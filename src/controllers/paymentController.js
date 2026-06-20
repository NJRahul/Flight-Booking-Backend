const stripeKey = process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('your_stripe')
  ? process.env.STRIPE_SECRET_KEY
  : null;
const stripe = stripeKey ? require('stripe')(stripeKey) : null;
const Booking = require('../models/Booking');
const Flight = require('../models/Flight');
const Notification = require('../models/Notification');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const { generateTransactionId } = require('../utils/generateReference');
const logger = require('../utils/logger');
const { sendBookingConfirmationEmail } = require('../services/emailService');

const createPaymentIntent = asyncHandler(async (req, res, next) => {
  const { bookingId } = req.body;

  if (!bookingId) return error(res, 400, 'bookingId is required');

  const booking = await Booking.findById(bookingId);
  if (!booking) return error(res, 404, 'Booking not found');

  if (booking.user.toString() !== req.user._id.toString()) {
    return error(res, 403, 'Not authorized to access this booking');
  }

  if (booking.status !== 'pending') {
    return error(res, 400, 'Booking is not in pending state');
  }

  if (!stripe) {
    return error(res, 503, 'Payment service not configured');
  }

  try {
    if (booking.payment.stripePaymentIntentId) {
      const existingPI = await stripe.paymentIntents.retrieve(booking.payment.stripePaymentIntentId);
      if (
        existingPI.status === 'requires_payment_method' ||
        existingPI.status === 'requires_confirmation'
      ) {
        return success(res, 200, { clientSecret: existingPI.client_secret });
      }
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(booking.pricing.totalAmount * 100),
      currency: 'inr',
      metadata: {
        bookingId: bookingId.toString(),
        bookingReference: booking.bookingReference || '',
      },
      automatic_payment_methods: { enabled: true },
    });

    booking.payment.stripePaymentIntentId = paymentIntent.id;
    await booking.save();

    return success(res, 200, { clientSecret: paymentIntent.client_secret });
  } catch (stripeErr) {
    logger.error('Stripe createPaymentIntent error:', stripeErr.message);
    return error(res, 503, 'Payment service not configured');
  }
});

const confirmPayment = asyncHandler(async (req, res, next) => {
  const { bookingId, paymentIntentId, paymentMethod = 'card' } = req.body;

  if (!bookingId || !paymentIntentId) {
    return error(res, 400, 'bookingId and paymentIntentId are required');
  }

  const booking = await Booking.findById(bookingId).populate('flight');
  if (!booking) return error(res, 404, 'Booking not found');

  if (booking.user.toString() !== req.user._id.toString()) {
    return error(res, 403, 'Not authorized to access this booking');
  }

  if (!stripe) return error(res, 503, 'Payment service not configured');

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (Math.round(booking.pricing.totalAmount * 100) !== paymentIntent.amount) {
    return error(res, 400, 'Payment amount mismatch');
  }

  if (paymentIntent.status !== 'succeeded') {
    return error(res, 400, { paymentStatus: paymentIntent.status, message: 'Payment not completed' });
  }

  const txnId = generateTransactionId();
  booking.payment.status = 'completed';
  booking.payment.paidAt = new Date();
  booking.payment.method = paymentMethod;
  booking.payment.transactionId = txnId;
  booking.status = 'confirmed';
  await booking.save();

  // Fire-and-forget
  sendBookingConfirmationEmail(booking, req.user).catch(() => {});
  Notification.createForUser(
    req.user._id,
    'payment_success',
    'Payment Successful',
    'Your booking has been confirmed!',
    { bookingId: booking._id, bookingReference: booking.bookingReference },
    'high'
  ).catch(() => {});

  const io = req.app.get('io');
  if (io) {
    io.to(`booking:${booking._id}`).emit('booking:confirmed', {
      bookingId: booking._id,
      bookingReference: booking.bookingReference,
      status: 'confirmed',
    });
    io.to(`user:${req.user._id}`).emit('notification:new', {
      type: 'payment_success',
      message: 'Payment confirmed!',
    });
  }

  await booking.populate({
    path: 'flight',
    populate: [{ path: 'airline' }, { path: 'origin' }, { path: 'destination' }],
  });

  return success(res, 200, { booking, message: 'Booking confirmed!' });
});

const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(200).json({ received: true }); // Dev mode: skip verification
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  // Handle async, respond immediately
  res.status(200).json({ received: true });

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const bookingId = pi.metadata?.bookingId;
        if (!bookingId) break;
        const booking = await Booking.findById(bookingId).populate('user');
        if (!booking || booking.status === 'confirmed') break;
        const txnId = generateTransactionId();
        booking.payment.status = 'completed';
        booking.payment.paidAt = new Date();
        booking.payment.transactionId = txnId;
        booking.status = 'confirmed';
        await booking.save();
        if (booking.user) {
          sendBookingConfirmationEmail(booking, booking.user).catch(() => {});
          Notification.createForUser(
            booking.user._id,
            'payment_success',
            'Booking Confirmed!',
            `Your booking ${booking.bookingReference} is confirmed.`,
            { bookingId: booking._id },
            'high'
          ).catch(() => {});
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        const bookingId = pi.metadata?.bookingId;
        if (!bookingId) break;
        const booking = await Booking.findById(bookingId).populate('user');
        if (!booking) break;
        booking.payment.status = 'failed';
        await booking.save();
        if (booking.user) {
          Notification.createForUser(
            booking.user._id,
            'payment_failed',
            'Payment Failed',
            `Payment for booking ${booking.bookingReference} failed. Please retry.`,
            { bookingId: booking._id },
            'high'
          ).catch(() => {});
        }
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object;
        const booking = await Booking.findOne({ 'payment.stripePaymentIntentId': charge.payment_intent });
        if (!booking) break;
        booking.payment.status = 'refunded';
        booking.payment.refundedAt = new Date();
        if (booking.cancellation) {
          booking.cancellation.refundStatus = 'processed';
          booking.cancellation.refundedAt = new Date();
        }
        await booking.save();
        break;
      }
    }
  } catch (webhookErr) {
    logger.error('Webhook processing error:', webhookErr.message);
  }
};

const processRefund = asyncHandler(async (req, res, next) => {
  const { bookingId, refundAmount, reason = 'Admin initiated refund' } = req.body;

  const booking = await Booking.findById(bookingId).populate('user');
  if (!booking) return error(res, 404, 'Booking not found');
  if (booking.payment.status !== 'completed') return error(res, 400, 'Booking payment is not completed');

  if (!process.env.STRIPE_SECRET_KEY) return error(res, 503, 'Payment service not configured');

  const pi = await stripe.paymentIntents.retrieve(booking.payment.stripePaymentIntentId);
  const chargeId = pi.latest_charge;

  if (!chargeId) return error(res, 400, 'No charge found for this payment');

  const refundAmountInPaise = Math.round((refundAmount || booking.pricing.totalAmount) * 100);
  const refund = await stripe.refunds.create({ charge: chargeId, amount: refundAmountInPaise });

  booking.payment.status = 'refunded';
  booking.payment.refundAmount = refundAmount || booking.pricing.totalAmount;
  booking.payment.refundedAt = new Date();
  booking.cancellation = booking.cancellation || {};
  booking.cancellation.refundStatus = 'processed';
  booking.cancellation.refundedAt = new Date();
  booking.cancellation.reason = reason;
  await booking.save();

  if (booking.user) {
    Notification.createForUser(
      booking.user._id,
      'refund_processed',
      'Refund Processed',
      `Your refund of ₹${(refundAmount || booking.pricing.totalAmount).toLocaleString('en-IN')} has been processed.`,
      { bookingId: booking._id },
      'high'
    ).catch(() => {});
  }

  logger.info(`Refund processed for booking ${booking.bookingReference}: ₹${refundAmount}`);
  return success(res, 200, { refund, booking });
});

const confirmDemoPayment = asyncHandler(async (req, res, next) => {
  const { bookingId, paymentMethod = 'demo' } = req.body;

  if (!bookingId) return error(res, 400, 'bookingId is required');

  const booking = await Booking.findById(bookingId).populate('flight');
  if (!booking) return error(res, 404, 'Booking not found');

  if (booking.user.toString() !== req.user._id.toString()) {
    return error(res, 403, 'Not authorized to access this booking');
  }

  if (booking.status === 'confirmed') {
    return success(res, 200, { booking }, 'Booking already confirmed');
  }

  if (booking.status !== 'pending') {
    return error(res, 400, 'Booking is not in pending state');
  }

  const txnId = generateTransactionId();
  booking.payment.status = 'completed';
  booking.payment.paidAt = new Date();
  booking.payment.method = paymentMethod;
  booking.payment.transactionId = txnId;
  booking.status = 'confirmed';
  await booking.save();

  sendBookingConfirmationEmail(booking, req.user).catch(() => {});
  Notification.createForUser(
    req.user._id,
    'payment_success',
    'Payment Successful',
    `Your booking ${booking.bookingReference} has been confirmed!`,
    { bookingId: booking._id, bookingReference: booking.bookingReference },
    'high'
  ).catch(() => {});

  const io = req.app.get('io');
  if (io) {
    io.to(`user:${req.user._id}`).emit('notification:new', {
      type: 'payment_success',
      message: 'Payment confirmed! Booking is now confirmed.',
    });
  }

  await booking.populate({
    path: 'flight',
    populate: [{ path: 'airline' }, { path: 'origin' }, { path: 'destination' }],
  });

  return success(res, 200, { booking });
});

module.exports = { createPaymentIntent, confirmPayment, confirmDemoPayment, handleWebhook, processRefund };
