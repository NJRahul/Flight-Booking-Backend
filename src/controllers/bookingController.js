const Booking = require('../models/Booking');
const Flight = require('../models/Flight');
const Notification = require('../models/Notification');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const { generateBookingRef } = require('../utils/generateReference');
const logger = require('../utils/logger');
const { sendBookingConfirmationEmail, sendCancellationEmail } = require('../services/emailService');
const pdfService = require('../services/pdfService');

// ── Constants ─────────────────────────────────────────────────────────────────
const TAX_RATE = 0.18;
const FUEL_SURCHARGE_RATE = 0.05;
const CONVENIENCE_FEE = 99;
const EXTRAS_PRICING = {
  extraBaggage: 1299,
  travelInsurance: 499,
  mealUpgrade: 299,
  priorityBoarding: 199,
};

// ── createBooking ─────────────────────────────────────────────────────────────
const createBooking = asyncHandler(async (req, res, next) => {
  const {
    flightId,
    returnFlightId,
    tripType = 'one-way',
    class: seatClass,
    passengers = [],
    contactInfo,
    extras = {},
  } = req.body;

  // Basic validation
  if (!flightId) {
    return error(res, 400, 'Flight ID is required');
  }
  if (!seatClass || !['economy', 'business', 'first'].includes(seatClass)) {
    return error(res, 400, 'Valid seat class is required (economy, business, or first)');
  }
  if (!passengers || passengers.length === 0) {
    return error(res, 400, 'At least one passenger is required');
  }

  // Find flight
  const flight = await Flight.findById(flightId)
    .populate('airline')
    .populate('origin')
    .populate('destination');

  if (!flight) {
    return error(res, 404, 'Flight not found');
  }
  if (!flight.isActive) {
    return error(res, 400, 'Flight is not available for booking');
  }
  if (new Date(flight.departureTime) <= new Date()) {
    return error(res, 400, 'Cannot book a flight that has already departed');
  }

  // Validate seat class availability
  const classData = flight.seats[seatClass];
  if (!classData) {
    return error(res, 400, 'Invalid seat class');
  }

  // Count passengers by type
  const adultsCount = passengers.filter((p) => p.type === 'adult').length;
  const childrenCount = passengers.filter((p) => p.type === 'child').length;

  if (adultsCount < 1) {
    return error(res, 400, 'At least one adult passenger is required');
  }

  // Infants don't occupy seats
  const paxCount = adultsCount + childrenCount;

  if (classData.available < paxCount) {
    return error(res, 400, 'Insufficient seats available for the selected class');
  }

  // Validate each passenger has name fields
  for (let i = 0; i < passengers.length; i++) {
    const pax = passengers[i];
    if (!pax.firstName || !pax.lastName) {
      return error(res, 400, `Passenger ${i + 1} must have a first name and last name`);
    }
  }

  // Validate contact info
  if (!contactInfo || !contactInfo.email || !contactInfo.phone) {
    return error(res, 400, 'Contact email and phone are required');
  }

  // ── Pricing calculation ────────────────────────────────────────────────────
  const baseFare = classData.price;

  const perPassengerFares = passengers.map((p) => {
    if (p.type === 'adult') return baseFare;
    if (p.type === 'child') return Math.round(baseFare * 0.75);
    return Math.round(baseFare * 0.1); // infant
  });

  const baseTotal = perPassengerFares.reduce((sum, f) => sum + f, 0);

  // Infants are not taxed — sum fares for adult + child only
  const taxableBase = passengers.reduce((sum, p, i) => {
    if (p.type === 'adult' || p.type === 'child') return sum + perPassengerFares[i];
    return sum;
  }, 0);

  const taxes = Math.round(taxableBase * TAX_RATE);
  const fuelSurcharge = Math.round(taxableBase * FUEL_SURCHARGE_RATE);
  const fees = fuelSurcharge + CONVENIENCE_FEE;

  const extrasTotal = Object.entries(extras).reduce((sum, [key, val]) => {
    if (val && EXTRAS_PRICING[key]) {
      return sum + EXTRAS_PRICING[key] * paxCount;
    }
    return sum;
  }, 0);

  const totalAmount = baseTotal + taxes + fees + extrasTotal;

  // Pre-generate booking reference
  const bookingRef = generateBookingRef();

  // Build extras document
  const extrasDoc = {
    extraBaggage: !!extras.extraBaggage,
    travelInsurance: !!extras.travelInsurance,
    mealUpgrade: !!extras.mealUpgrade,
    priorityBoarding: !!extras.priorityBoarding,
  };

  // Create booking instance (not saved yet)
  const booking = new Booking({
    bookingReference: bookingRef,
    user: req.user._id,
    flight: flightId,
    returnFlight: returnFlightId || undefined,
    tripType,
    class: seatClass,
    passengers,
    contactInfo,
    extras: extrasDoc,
    pricing: {
      basePrice: baseTotal,
      taxes,
      fees,
      extras: extrasTotal,
      discount: 0,
      totalAmount,
    },
    status: 'pending',
    payment: { status: 'pending' },
  });

  // ── Stripe PaymentIntent ───────────────────────────────────────────────────
  let clientSecret = null;
  try {
    if (process.env.STRIPE_SECRET_KEY) {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: totalAmount * 100,
        currency: 'inr',
        metadata: {
          bookingReference: bookingRef,
          userId: req.user._id.toString(),
        },
      });
      booking.payment.stripePaymentIntentId = paymentIntent.id;
      clientSecret = paymentIntent.client_secret;
    }
  } catch (stripeErr) {
    logger.error('Stripe PaymentIntent creation failed:', stripeErr.message);
    // Continue — booking still created, payment can be retried
  }

  await booking.save();

  // Fire-and-forget side effects
  sendBookingConfirmationEmail(booking, req.user).catch(() => {});

  Notification.createForUser(
    req.user._id,
    'booking_confirmed',
    'Booking Created',
    'Your booking has been created. Complete payment to confirm.',
    { bookingId: booking._id, bookingReference: bookingRef },
    'high'
  ).catch(() => {});

  // Populate for response
  await booking.populate(['flight', 'user']);

  logger.info(`Booking created: ${bookingRef} by user ${req.user._id}`);

  return success(res, 201, { booking, clientSecret });
});

// ── getUserBookings ───────────────────────────────────────────────────────────
const getUserBookings = asyncHandler(async (req, res, next) => {
  const { status, page = 1, limit = 10 } = req.query;

  const filter = { user: req.user._id };
  if (status) filter.status = status;

  const total = await Booking.countDocuments(filter);
  const bookings = await Booking.find(filter)
    .populate({
      path: 'flight',
      select: 'flightNumber airline departureTime arrivalTime origin destination status duration',
      populate: [
        { path: 'airline', select: 'name code' },
        { path: 'origin', select: 'code city name' },
        { path: 'destination', select: 'code city name' },
      ],
    })
    .sort('-createdAt')
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean();

  return success(res, 200, {
    bookings,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / limit),
    },
  });
});

// ── getBookingById ────────────────────────────────────────────────────────────
const getBookingById = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id)
    .populate({
      path: 'flight',
      populate: [{ path: 'airline' }, { path: 'origin' }, { path: 'destination' }],
    })
    .populate('user', 'name email');

  if (!booking) {
    return error(res, 404, 'Booking not found');
  }

  if (
    booking.user._id.toString() !== req.user._id.toString() &&
    req.user.role !== 'admin'
  ) {
    return error(res, 403, 'Not authorised to view this booking');
  }

  return success(res, 200, { booking });
});

// ── cancelBooking ─────────────────────────────────────────────────────────────
const cancelBooking = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return error(res, 404, 'Booking not found');
  }

  // Ownership check
  if (
    booking.user.toString() !== req.user._id.toString() &&
    req.user.role !== 'admin'
  ) {
    return error(res, 403, 'Not authorised to cancel this booking');
  }

  if (!['pending', 'confirmed'].includes(booking.status)) {
    return error(res, 400, 'Booking cannot be cancelled');
  }

  // Populate flight to inspect departure time
  await booking.populate('flight');

  const hoursUntilDep =
    (new Date(booking.flight.departureTime) - Date.now()) / 3600000;

  if (hoursUntilDep < 0) {
    return error(res, 400, 'Cannot cancel — flight has already departed');
  }

  // Count seat-occupying passengers
  const adultsCount = booking.passengers.filter((p) => p.type === 'adult').length;
  const childrenCount = booking.passengers.filter((p) => p.type === 'child').length;
  const paxCount = adultsCount + childrenCount;

  // Refund calculation
  let refundPct;
  if (booking.flight.status === 'cancelled') {
    refundPct = 1.0;
  } else if (hoursUntilDep > 24) {
    refundPct = 0.9;
  } else if (hoursUntilDep >= 12) {
    refundPct = 0.5;
  } else {
    refundPct = 0;
  }

  const refundAmount = Math.round(booking.pricing.totalAmount * refundPct);

  // Update booking
  booking.status = 'cancelled';
  booking.cancellation = {
    cancelledAt: new Date(),
    reason: req.body.reason || 'User requested',
    refundAmount,
    refundStatus: refundAmount > 0 ? 'pending' : 'denied',
    cancelledBy: 'user',
  };
  booking.payment.refundAmount = refundAmount;

  // Restore seats (fire-and-forget)
  Flight.findByIdAndUpdate(booking.flight._id, {
    $inc: { [`seats.${booking.class}.available`]: paxCount },
  }).catch(() => {});

  await booking.save();

  // Notifications (fire-and-forget)
  sendCancellationEmail({ ...booking.toObject(), refundAmount }, req.user).catch(() => {});

  Notification.createForUser(
    req.user._id,
    'booking_cancelled',
    'Booking Cancelled',
    refundAmount > 0
      ? `Your refund of ₹${refundAmount.toLocaleString('en-IN')} will be processed in 5-7 business days.`
      : 'Your booking has been cancelled. No refund applicable.',
    { bookingId: booking._id },
    'high'
  ).catch(() => {});

  // Socket.io broadcast
  const io = req.app.get('io');
  if (io) {
    io.to(`booking:${booking._id}`).emit('booking:cancelled', {
      bookingId: booking._id,
      refundAmount,
    });
  }

  logger.info(
    `Booking ${booking.bookingReference} cancelled by user ${req.user._id}. Refund: ₹${refundAmount}`
  );

  return success(res, 200, { booking, refundAmount });
});

// ── downloadBookingPDF ────────────────────────────────────────────────────────
const downloadBookingPDF = asyncHandler(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id)
    .populate({
      path: 'flight',
      populate: [{ path: 'airline' }, { path: 'origin' }, { path: 'destination' }],
    })
    .populate('user', 'name email');

  if (!booking) {
    return error(res, 404, 'Booking not found');
  }

  if (
    booking.user._id.toString() !== req.user._id.toString() &&
    req.user.role !== 'admin'
  ) {
    return error(res, 403, 'Not authorised to download this booking');
  }

  const pdfBuffer = await pdfService.generateBookingPDF(booking.toObject());

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="FlightBook-${booking.bookingReference}.pdf"`
  );
  res.send(pdfBuffer);
});

// ── getBookingStats (admin) ───────────────────────────────────────────────────
const getBookingStats = asyncHandler(async (req, res, next) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const [
    total,
    confirmed,
    cancelled,
    pending,
    thisMonthRevenueResult,
    lastMonthRevenueResult,
  ] = await Promise.all([
    Booking.countDocuments({}),
    Booking.countDocuments({ status: 'confirmed' }),
    Booking.countDocuments({ status: 'cancelled' }),
    Booking.countDocuments({ status: 'pending' }),
    Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth },
          status: { $in: ['confirmed', 'completed'] },
        },
      },
      { $group: { _id: null, revenue: { $sum: '$pricing.totalAmount' } } },
    ]),
    Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
          status: { $in: ['confirmed', 'completed'] },
        },
      },
      { $group: { _id: null, revenue: { $sum: '$pricing.totalAmount' } } },
    ]),
  ]);

  const thisMonthRevenue =
    thisMonthRevenueResult.length > 0 ? thisMonthRevenueResult[0].revenue : 0;
  const lastMonthRevenue =
    lastMonthRevenueResult.length > 0 ? lastMonthRevenueResult[0].revenue : 0;

  const revenueChange =
    lastMonthRevenue > 0
      ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
      : 100;

  return success(res, 200, {
    stats: {
      total,
      confirmed,
      cancelled,
      pending,
      thisMonthRevenue,
      lastMonthRevenue,
      revenueChange,
    },
  });
});

module.exports = {
  createBooking,
  getUserBookings,
  getBookingById,
  cancelBooking,
  downloadBookingPDF,
  getBookingStats,
};
