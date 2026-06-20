const Flight = require('../models/Flight');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Airline = require('../models/Airline');
const Airport = require('../models/Airport');
const Notification = require('../models/Notification');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const logger = require('../utils/logger');
const emailService = require('../services/emailService');
const paymentService = require('../services/paymentService');

// ─────────────────────────────────────────────
// DASHBOARD STATS
// ─────────────────────────────────────────────

const getStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const startOfWeek = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 86400000);

  const [
    revenueThis, revenueLast,
    bookingsThis, bookingsLast,
    flightsToday, flightsDelayed, flightsCancelled,
    totalUsers, newUsersWeek,
    bookingsByStatus,
  ] = await Promise.all([
    Booking.aggregate([
      { $match: { createdAt: { $gte: startOfMonth }, 'payment.status': 'completed' } },
      { $group: { _id: null, total: { $sum: '$pricing.totalAmount' } } },
    ]),
    Booking.aggregate([
      { $match: { createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth }, 'payment.status': 'completed' } },
      { $group: { _id: null, total: { $sum: '$pricing.totalAmount' } } },
    ]),
    Booking.countDocuments({ createdAt: { $gte: startOfMonth } }),
    Booking.countDocuments({ createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } }),
    Flight.countDocuments({ departureTime: { $gte: startOfToday, $lt: endOfToday }, isActive: true }),
    Flight.countDocuments({ departureTime: { $gte: startOfToday, $lt: endOfToday }, status: 'delayed' }),
    Flight.countDocuments({ departureTime: { $gte: startOfToday, $lt: endOfToday }, status: 'cancelled' }),
    User.countDocuments({ role: 'user' }),
    User.countDocuments({ role: 'user', createdAt: { $gte: startOfWeek } }),
    Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  const revThisVal = revenueThis[0]?.total || 0;
  const revLastVal = revenueLast[0]?.total || 0;
  const revChange = revLastVal > 0 ? (((revThisVal - revLastVal) / revLastVal) * 100).toFixed(1) : 0;
  const bookChange = bookingsLast > 0 ? (((bookingsThis - bookingsLast) / bookingsLast) * 100).toFixed(1) : 0;

  success(res, 200, {
    revenue: { thisMonth: revThisVal, lastMonth: revLastVal, change: parseFloat(revChange) },
    bookings: { thisMonth: bookingsThis, lastMonth: bookingsLast, change: parseFloat(bookChange) },
    flights: { today: flightsToday, delayed: flightsDelayed, cancelled: flightsCancelled },
    users: { total: totalUsers, newThisWeek: newUsersWeek },
    bookingsByStatus: bookingsByStatus.reduce((acc, { _id, count }) => { acc[_id] = count; return acc; }, {}),
  });
});

// ─────────────────────────────────────────────
// REVENUE TREND
// ─────────────────────────────────────────────

const getRevenueTrend = asyncHandler(async (req, res) => {
  const period = req.query.period || '30d';
  const days = period === '7d' ? 7 : period === '3m' ? 90 : period === '1y' ? 365 : 30;
  const startDate = new Date(Date.now() - days * 86400000);

  const [revenueByDay, bookingsByDay] = await Promise.all([
    Booking.aggregate([
      { $match: { createdAt: { $gte: startDate }, 'payment.status': 'completed' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$pricing.totalAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Booking.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  success(res, 200, { revenueByDay, bookingsByDay, period });
});

// ─────────────────────────────────────────────
// POPULAR ROUTES
// ─────────────────────────────────────────────

const getPopularRoutes = asyncHandler(async (req, res) => {
  const routes = await Booking.aggregate([
    { $match: { status: { $in: ['confirmed', 'completed'] } } },
    { $lookup: { from: 'flights', localField: 'flight', foreignField: '_id', as: 'flightData' } },
    { $unwind: { path: '$flightData', preserveNullAndEmpty: false } },
    { $lookup: { from: 'airports', localField: 'flightData.origin', foreignField: '_id', as: 'originAirport' } },
    { $lookup: { from: 'airports', localField: 'flightData.destination', foreignField: '_id', as: 'destAirport' } },
    { $unwind: { path: '$originAirport', preserveNullAndEmpty: false } },
    { $unwind: { path: '$destAirport', preserveNullAndEmpty: false } },
    {
      $group: {
        _id: { origin: '$flightData.origin', dest: '$flightData.destination' },
        originCode: { $first: '$originAirport.code' },
        destCode: { $first: '$destAirport.code' },
        originCity: { $first: '$originAirport.city' },
        destCity: { $first: '$destAirport.city' },
        bookings: { $sum: 1 },
        revenue: { $sum: '$pricing.totalAmount' },
        avgPrice: { $avg: '$pricing.totalAmount' },
      },
    },
    { $sort: { bookings: -1 } },
    { $limit: 5 },
  ]);

  success(res, 200, { routes });
});

// ─────────────────────────────────────────────
// RECENT BOOKINGS & USERS (dashboard)
// ─────────────────────────────────────────────

const getRecentBookings = asyncHandler(async (req, res) => {
  const bookings = await Booking.find()
    .populate('user', 'name email')
    .populate({
      path: 'flight',
      populate: [
        { path: 'origin', select: 'code city' },
        { path: 'destination', select: 'code city' },
      ],
    })
    .sort({ createdAt: -1 })
    .limit(8)
    .lean();

  success(res, 200, { bookings });
});

const getRecentUsers = asyncHandler(async (req, res) => {
  const users = await User.find({ role: 'user' }).sort({ createdAt: -1 }).limit(5).lean();
  success(res, 200, { users });
});

// ─────────────────────────────────────────────
// ADMIN FLIGHTS — full CRUD
// ─────────────────────────────────────────────

const getAdminFlights = asyncHandler(async (req, res) => {
  const { search, airline, status, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (airline) filter.airline = airline;
  if (status) filter.status = status;
  if (search) {
    filter.$or = [{ flightNumber: { $regex: search, $options: 'i' } }];
  }

  const [flights, total] = await Promise.all([
    Flight.find(filter)
      .populate('airline', 'name code logo')
      .populate('origin', 'code city name')
      .populate('destination', 'code city name')
      .sort({ departureTime: 1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean(),
    Flight.countDocuments(filter),
  ]);

  success(res, 200, { flights, total, page: parseInt(page), limit: parseInt(limit) });
});

const createFlight = asyncHandler(async (req, res) => {
  const flight = await Flight.create(req.body);
  const populated = await Flight.findById(flight._id)
    .populate('airline')
    .populate('origin')
    .populate('destination');
  success(res, 201, { flight: populated }, 'Flight created successfully');
});

const updateFlight = asyncHandler(async (req, res) => {
  const flight = await Flight.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    .populate('airline')
    .populate('origin')
    .populate('destination');
  if (!flight) return error(res, 404, 'Flight not found');
  success(res, 200, { flight }, 'Flight updated successfully');
});

const deleteFlight = asyncHandler(async (req, res) => {
  const flight = await Flight.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!flight) return error(res, 404, 'Flight not found');
  success(res, 200, null, 'Flight deactivated successfully');
});

const updateFlightStatus = asyncHandler(async (req, res) => {
  const { status, delayMinutes = 0, reason, notifyPassengers = false } = req.body;

  const flight = await Flight.findByIdAndUpdate(
    req.params.id,
    { status, delay: status === 'delayed' ? delayMinutes : 0 },
    { new: true }
  )
    .populate('airline', 'name code')
    .populate('origin', 'code city')
    .populate('destination', 'code city');

  if (!flight) return error(res, 404, 'Flight not found');

  const io = req.app.get('io');
  if (io) {
    io.to(`flight:${flight._id}`).emit('flight:statusUpdate', {
      flightId: flight._id,
      flightNumber: flight.flightNumber,
      status,
      delay: delayMinutes,
      reason,
    });
  }

  if (notifyPassengers) {
    const bookings = await Booking.find({ flight: flight._id, status: 'confirmed' })
      .populate('user', 'name email')
      .lean();

    const notificationType = status === 'delayed' ? 'flight_delay' : 'flight_cancelled';
    const notifTitle =
      status === 'delayed'
        ? `Flight ${flight.flightNumber} Delayed by ${delayMinutes} min`
        : `Flight ${flight.flightNumber} Cancelled`;

    for (const booking of bookings) {
      if (!booking.user) continue;

      await Notification.createForUser(
        booking.user._id,
        notificationType,
        notifTitle,
        reason || `Your flight has been ${status}`,
        { flightId: flight._id, bookingId: booking._id },
        'high'
      ).catch(() => {});

      if (io) {
        io.to(`user:${booking.user._id}`).emit('notification:new', {
          type: notificationType,
          title: notifTitle,
          message: reason || `Your flight has been ${status}`,
          _id: Date.now().toString(),
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }

      emailService
        .sendEmail({
          to: booking.user.email,
          subject: notifTitle,
          html: `<p>Dear ${booking.user.name},</p><p>${
            reason || `Your flight ${flight.flightNumber} has been ${status}`
          }.</p><p>Booking Reference: <strong>${booking.bookingReference}</strong></p>`,
        })
        .catch(() => {});
    }
  }

  success(res, 200, { flight }, `Flight status updated to ${status}`);
});

// ─────────────────────────────────────────────
// ADMIN BOOKINGS
// ─────────────────────────────────────────────

const getAdminBookings = asyncHandler(async (req, res) => {
  const {
    search, status, paymentStatus,
    page = 1, limit = 20,
    dateFrom, dateTo,
    amountMin, amountMax,
  } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (paymentStatus) filter['payment.status'] = paymentStatus;
  if (dateFrom || dateTo) filter.createdAt = {};
  if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
  if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  if (amountMin || amountMax) filter['pricing.totalAmount'] = {};
  if (amountMin) filter['pricing.totalAmount'].$gte = parseFloat(amountMin);
  if (amountMax) filter['pricing.totalAmount'].$lte = parseFloat(amountMax);
  if (search) {
    filter.$or = [
      { bookingReference: { $regex: search, $options: 'i' } },
      { 'passengers.firstName': { $regex: search, $options: 'i' } },
      { 'passengers.lastName': { $regex: search, $options: 'i' } },
      { 'contactInfo.email': { $regex: search, $options: 'i' } },
    ];
  }

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .populate('user', 'name email')
      .populate({
        path: 'flight',
        populate: [
          { path: 'airline', select: 'name code' },
          { path: 'origin', select: 'code city' },
          { path: 'destination', select: 'code city' },
        ],
      })
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean(),
    Booking.countDocuments(filter),
  ]);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [todayBookings, todayRevenue, pendingRefunds, todayCancellations] = await Promise.all([
    Booking.countDocuments({ createdAt: { $gte: startOfToday } }),
    Booking.aggregate([
      { $match: { createdAt: { $gte: startOfToday }, 'payment.status': 'completed' } },
      { $group: { _id: null, total: { $sum: '$pricing.totalAmount' } } },
    ]),
    Booking.countDocuments({ status: 'cancelled', 'cancellation.refundStatus': 'pending' }),
    Booking.countDocuments({ status: 'cancelled', updatedAt: { $gte: startOfToday } }),
  ]);

  success(res, 200, {
    bookings,
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    todayStats: {
      bookings: todayBookings,
      revenue: todayRevenue[0]?.total || 0,
      pendingRefunds,
      cancellations: todayCancellations,
    },
  });
});

const updateAdminBooking = asyncHandler(async (req, res) => {
  const allowedUpdates = ['notes', 'status'];
  const updates = {};
  allowedUpdates.forEach((f) => {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  });

  if (req.body.status === 'cancelled' && !updates.cancellation) {
    updates.cancellation = {
      cancelledAt: new Date(),
      reason: req.body.reason || 'Admin cancellation',
      cancelledBy: 'admin',
      refundStatus: 'pending',
    };
  }

  const booking = await Booking.findByIdAndUpdate(req.params.id, updates, { new: true })
    .populate('user', 'name email')
    .populate({
      path: 'flight',
      populate: [
        { path: 'origin', select: 'code city' },
        { path: 'destination', select: 'code city' },
      ],
    });

  if (!booking) return error(res, 404, 'Booking not found');
  success(res, 200, { booking }, 'Booking updated');
});

const processAdminRefund = asyncHandler(async (req, res) => {
  const { amount, reason } = req.body;
  const booking = await Booking.findById(req.params.id);
  if (!booking) return error(res, 404, 'Booking not found');
  if (!booking.payment.stripePaymentIntentId) {
    return error(res, 400, 'No payment intent found for this booking');
  }

  try {
    const pi = await paymentService.getPaymentIntent(booking.payment.stripePaymentIntentId);
    if (!pi.latest_charge) return error(res, 400, 'No charge found for refund');
    const refundAmount = Math.round((amount || booking.pricing.totalAmount) * 100);
    await paymentService.processRefund(pi.latest_charge, refundAmount);
    booking.payment.status = 'refunded';
    booking.payment.refundAmount = amount || booking.pricing.totalAmount;
    booking.payment.refundedAt = new Date();
    booking.cancellation = { ...booking.cancellation, refundStatus: 'processed' };
    await booking.save();
    success(res, 200, { booking }, 'Refund processed successfully');
  } catch (err) {
    logger.error('Admin refund error: ' + err.message);
    return error(res, 500, 'Refund failed: ' + err.message);
  }
});

// ─────────────────────────────────────────────
// ADMIN USERS
// ─────────────────────────────────────────────

const getAdminUsers = asyncHandler(async (req, res) => {
  const {
    search, role, isActive,
    page = 1, limit = 20,
    dateFrom, dateTo,
  } = req.query;

  const filter = {};
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  if (dateFrom || dateTo) filter.createdAt = {};
  if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
  if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('-password -resetPasswordToken -resetPasswordExpire -passportNumber -passportExpiry')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean(),
    User.countDocuments(filter),
  ]);

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalCount, activeToday, newThisMonth, adminCount] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    User.countDocuments({ lastLogin: { $gte: startOfDay } }),
    User.countDocuments({ role: 'user', createdAt: { $gte: startOfMonth } }),
    User.countDocuments({ role: 'admin' }),
  ]);

  const userIds = users.map((u) => u._id);
  const bookingCounts = await Booking.aggregate([
    { $match: { user: { $in: userIds } } },
    { $group: { _id: '$user', count: { $sum: 1 }, totalSpent: { $sum: '$pricing.totalAmount' } } },
  ]);
  const bookingMap = bookingCounts.reduce((acc, { _id, count, totalSpent }) => {
    acc[_id.toString()] = { count, totalSpent };
    return acc;
  }, {});
  const enriched = users.map((u) => ({
    ...u,
    bookingCount: bookingMap[u._id.toString()]?.count || 0,
    totalSpent: bookingMap[u._id.toString()]?.totalSpent || 0,
  }));

  success(res, 200, {
    users: enriched,
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    stats: { total: totalCount, activeToday, newThisMonth, admins: adminCount },
  });
});

const updateAdminUser = asyncHandler(async (req, res) => {
  const allowed = ['role', 'isActive'];
  const updates = {};
  allowed.forEach((f) => {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  });
  const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
  if (!user) return error(res, 404, 'User not found');
  success(res, 200, { user }, 'User updated');
});

const getUserDetail = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select(
    '-password -resetPasswordToken -resetPasswordExpire'
  );
  if (!user) return error(res, 404, 'User not found');

  const [bookings, stats] = await Promise.all([
    Booking.find({ user: req.params.id })
      .populate({
        path: 'flight',
        populate: [
          { path: 'origin', select: 'code city' },
          { path: 'destination', select: 'code city' },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
    Booking.aggregate([
      { $match: { user: user._id } },
      { $group: { _id: null, total: { $sum: 1 }, spent: { $sum: '$pricing.totalAmount' } } },
    ]),
  ]);

  success(res, 200, { user, bookings, stats: stats[0] || { total: 0, spent: 0 } });
});

// ─────────────────────────────────────────────
// GLOBAL SEARCH
// ─────────────────────────────────────────────

const globalSearch = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return success(res, 200, { flights: [], bookings: [], users: [] });

  const regex = { $regex: q, $options: 'i' };

  const [flights, bookings, users] = await Promise.all([
    Flight.find({ $or: [{ flightNumber: regex }] })
      .populate('airline', 'name code')
      .populate('origin', 'code city')
      .populate('destination', 'code city')
      .limit(3)
      .lean(),
    Booking.find({
      $or: [
        { bookingReference: regex },
        { 'contactInfo.email': regex },
        { 'passengers.firstName': regex },
        { 'passengers.lastName': regex },
      ],
    })
      .populate('user', 'name email')
      .limit(3)
      .lean(),
    User.find({ $or: [{ name: regex }, { email: regex }] })
      .select('name email role createdAt')
      .limit(3)
      .lean(),
  ]);

  success(res, 200, { flights, bookings, users });
});

// ─────────────────────────────────────────────
// AIRLINES CRUD
// ─────────────────────────────────────────────

const getAdminAirlines = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const filter = search
    ? {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { code: { $regex: search, $options: 'i' } },
        ],
      }
    : {};

  const [airlines, total] = await Promise.all([
    Airline.find(filter)
      .sort({ name: 1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean(),
    Airline.countDocuments(filter),
  ]);

  success(res, 200, { airlines, total });
});

const createAirline = asyncHandler(async (req, res) => {
  const airline = await Airline.create(req.body);
  success(res, 201, { airline }, 'Airline created');
});

const updateAirline = asyncHandler(async (req, res) => {
  const airline = await Airline.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!airline) return error(res, 404, 'Airline not found');
  success(res, 200, { airline }, 'Airline updated');
});

const deleteAirline = asyncHandler(async (req, res) => {
  const airline = await Airline.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!airline) return error(res, 404, 'Airline not found');
  success(res, 200, null, 'Airline deactivated');
});

// ─────────────────────────────────────────────
// AIRPORTS CRUD
// ─────────────────────────────────────────────

const getAdminAirports = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const filter = search
    ? {
        $or: [
          { code: { $regex: search, $options: 'i' } },
          { city: { $regex: search, $options: 'i' } },
          { country: { $regex: search, $options: 'i' } },
          { name: { $regex: search, $options: 'i' } },
        ],
      }
    : {};

  const [airports, total] = await Promise.all([
    Airport.find(filter)
      .sort({ name: 1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean(),
    Airport.countDocuments(filter),
  ]);

  success(res, 200, { airports, total });
});

const createAirport = asyncHandler(async (req, res) => {
  const airport = await Airport.create(req.body);
  success(res, 201, { airport }, 'Airport created');
});

const updateAirport = asyncHandler(async (req, res) => {
  const airport = await Airport.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!airport) return error(res, 404, 'Airport not found');
  success(res, 200, { airport }, 'Airport updated');
});

const deleteAirport = asyncHandler(async (req, res) => {
  const airport = await Airport.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!airport) return error(res, 404, 'Airport not found');
  success(res, 200, null, 'Airport deactivated');
});

// ─────────────────────────────────────────────
// REPORTS
// ─────────────────────────────────────────────

const getReports = asyncHandler(async (req, res) => {
  const { from, to, period = '30d' } = req.query;
  const days = period === '7d' ? 7 : period === '3m' ? 90 : period === '1y' ? 365 : 30;
  const startDate = from ? new Date(from) : new Date(Date.now() - days * 86400000);
  const endDate = to ? new Date(to) : new Date();

  const [
    revenueByDay, bookingsByDay, byStatus, byClass,
    byPaymentMethod, revenueByAirline, userSignupsByDay,
    topUsers, refundsByDay,
  ] = await Promise.all([
    // Revenue by day
    Booking.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate }, 'payment.status': 'completed' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$pricing.totalAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    // Bookings by day
    Booking.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    // By status
    Booking.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    // By class
    Booking.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: '$class',
          count: { $sum: 1 },
          revenue: { $sum: '$pricing.totalAmount' },
        },
      },
    ]),
    // By payment method
    Booking.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate }, 'payment.status': 'completed' } },
      { $group: { _id: '$payment.method', count: { $sum: 1 } } },
    ]),
    // Revenue by airline
    Booking.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate }, 'payment.status': 'completed' } },
      { $lookup: { from: 'flights', localField: 'flight', foreignField: '_id', as: 'fl' } },
      { $unwind: { path: '$fl', preserveNullAndEmpty: false } },
      { $lookup: { from: 'airlines', localField: 'fl.airline', foreignField: '_id', as: 'al' } },
      { $unwind: { path: '$al', preserveNullAndEmpty: false } },
      {
        $group: {
          _id: '$al.name',
          revenue: { $sum: '$pricing.totalAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 6 },
    ]),
    // User signups by day
    User.aggregate([
      { $match: { role: 'user', createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    // Top users by bookings
    Booking.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: '$user', count: { $sum: 1 }, spent: { $sum: '$pricing.totalAmount' } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmpty: false } },
      { $project: { name: '$user.name', email: '$user.email', count: 1, spent: 1 } },
    ]),
    // Refunds by day
    Booking.aggregate([
      {
        $match: {
          'payment.status': 'refunded',
          'payment.refundedAt': { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$payment.refundedAt' } },
          amount: { $sum: '$payment.refundAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  success(res, 200, {
    revenueByDay,
    bookingsByDay,
    byStatus,
    byClass,
    byPaymentMethod,
    revenueByAirline,
    userSignupsByDay,
    topUsers,
    refundsByDay,
    period,
    startDate,
    endDate,
  });
});

// ─────────────────────────────────────────────
// ADMIN NOTIFICATIONS
// ─────────────────────────────────────────────

const getAdminNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ priority: { $in: ['high', 'medium'] } })
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  success(res, 200, { notifications });
});

const markAdminNotificationResolved = asyncHandler(async (req, res) => {
  const notification = await Notification.findByIdAndUpdate(
    req.params.id,
    { isRead: true, readAt: new Date() },
    { new: true }
  );
  if (!notification) return error(res, 404, 'Notification not found');
  success(res, 200, { notification }, 'Resolved');
});

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────

module.exports = {
  // Dashboard
  getStats,
  getRevenueTrend,
  getPopularRoutes,
  getRecentBookings,
  getRecentUsers,
  // Search
  globalSearch,
  // Reports
  getReports,
  // Flights
  getAdminFlights,
  createFlight,
  updateFlight,
  deleteFlight,
  updateFlightStatus,
  // Bookings
  getAdminBookings,
  updateAdminBooking,
  processAdminRefund,
  // Users
  getAdminUsers,
  updateAdminUser,
  getUserDetail,
  // Airlines
  getAdminAirlines,
  createAirline,
  updateAirline,
  deleteAirline,
  // Airports
  getAdminAirports,
  createAirport,
  updateAirport,
  deleteAirport,
  // Notifications
  getAdminNotifications,
  markAdminNotificationResolved,
};
