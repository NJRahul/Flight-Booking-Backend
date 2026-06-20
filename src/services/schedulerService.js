const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const emailService = require('./emailService');
const logger = require('../utils/logger');

// ── Check-in reminder (runs every hour) ─────────────────────────────────────
// Targets bookings departing in 25–26 hours (48h check-in window opening)
async function checkInReminders(io) {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 25 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 26 * 60 * 60 * 1000);

  const bookings = await Booking.find({
    status: 'confirmed',
    'notifications.checkInReminderSent': { $ne: true },
  })
    .populate({
      path: 'flight',
      match: { departureTime: { $gte: windowStart, $lte: windowEnd } },
      populate: [
        { path: 'origin', select: 'code city' },
        { path: 'destination', select: 'code city' },
      ],
    })
    .populate('user', 'name email preferences')
    .lean();

  let sent = 0;
  for (const booking of bookings) {
    if (!booking.flight || !booking.user) continue;

    const title = `Check-in is open for ${booking.bookingReference}`;
    const message = `Online check-in is now open for your flight ${booking.flight.flightNumber}. Check in now to choose your seat.`;

    await Promise.all([
      Notification.createForUser(
        booking.user._id,
        'check_in_reminder',
        title,
        message,
        { bookingId: booking._id, flightId: booking.flight._id },
        'medium'
      ).catch(() => {}),
      Booking.findByIdAndUpdate(booking._id, { 'notifications.checkInReminderSent': true }).catch(() => {}),
    ]);

    if (io) {
      io.to(`user:${booking.user._id}`).emit('notification:new', {
        type: 'check_in_reminder',
        title,
        message,
        _id: `checkin-${booking._id}`,
        isRead: false,
        createdAt: new Date().toISOString(),
        data: { bookingId: booking._id },
      });
    }

    if (booking.user.preferences?.notificationEmail !== false) {
      emailService.sendCheckInReminderEmail(booking, booking.user).catch(() => {});
    }

    sent++;
  }

  if (sent > 0) logger.info(`Check-in reminders sent: ${sent}`);
}

// ── Upcoming flight reminder (runs every hour) ───────────────────────────────
// Targets bookings departing in 3–4 hours
async function upcomingFlightReminders(io) {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 4 * 60 * 60 * 1000);

  const bookings = await Booking.find({
    status: 'confirmed',
    'notifications.reminderSent': { $ne: true },
  })
    .populate({
      path: 'flight',
      match: { departureTime: { $gte: windowStart, $lte: windowEnd } },
      populate: [
        { path: 'origin', select: 'code city' },
        { path: 'destination', select: 'code city' },
      ],
    })
    .populate('user', 'name email preferences')
    .lean();

  let sent = 0;
  for (const booking of bookings) {
    if (!booking.flight || !booking.user) continue;

    const title = `Your flight departs in ~3 hours`;
    const message = `Flight ${booking.flight.flightNumber} departs soon. Head to the airport now.`;

    await Promise.all([
      Notification.createForUser(
        booking.user._id,
        'general',
        title,
        message,
        { bookingId: booking._id, flightId: booking.flight._id },
        'high'
      ).catch(() => {}),
      Booking.findByIdAndUpdate(booking._id, { 'notifications.reminderSent': true }).catch(() => {}),
    ]);

    if (io) {
      io.to(`user:${booking.user._id}`).emit('notification:new', {
        type: 'general',
        title,
        message,
        _id: `reminder-${booking._id}`,
        isRead: false,
        createdAt: new Date().toISOString(),
        data: { bookingId: booking._id },
      });
    }

    if (booking.user.preferences?.notificationEmail !== false) {
      emailService.sendFlightReminderEmail(booking, booking.user).catch(() => {});
    }

    sent++;
  }

  if (sent > 0) logger.info(`Flight reminders sent: ${sent}`);
}

// ── Auto-complete bookings (runs daily) ─────────────────────────────────────
// Marks bookings as completed when flight arrival + 2h has passed
async function autoCompleteBookings() {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const bookings = await Booking.find({ status: 'confirmed' })
    .populate('flight', 'arrivalTime')
    .lean();

  const toComplete = bookings.filter(
    (b) => b.flight?.arrivalTime && new Date(b.flight.arrivalTime) < cutoff
  );

  if (toComplete.length === 0) return;

  await Booking.updateMany(
    { _id: { $in: toComplete.map((b) => b._id) } },
    { status: 'completed' }
  );

  logger.info(`Auto-completed ${toComplete.length} bookings`);
}

// ── Abandoned booking cleanup (runs every 2 hours) ───────────────────────────
// Cancels pending bookings older than 2 hours (never paid)
async function abandonedBookingCleanup() {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const bookings = await Booking.find({
    status: 'pending',
    'payment.status': 'pending',
    createdAt: { $lt: cutoff },
  })
    .populate('flight', 'seats')
    .lean();

  if (bookings.length === 0) return;

  const Flight = require('../models/Flight');

  for (const booking of bookings) {
    // Restore seats
    if (booking.flight) {
      const paxCount = booking.passengers.filter((p) => p.type !== 'infant').length;
      await Flight.findByIdAndUpdate(booking.flight._id, {
        $inc: { [`seats.${booking.class}.available`]: paxCount },
      }).catch(() => {});
    }
  }

  await Booking.updateMany(
    { _id: { $in: bookings.map((b) => b._id) } },
    {
      status: 'cancelled',
      cancellation: {
        cancelledAt: new Date(),
        reason: 'Payment not received within 2 hours',
        cancelledBy: 'system',
        refundStatus: 'denied',
      },
    }
  );

  logger.info(`Cleaned up ${bookings.length} abandoned bookings`);
}

// ── Start all scheduled tasks ────────────────────────────────────────────────
function startScheduler(io) {
  const HOUR = 60 * 60 * 1000;

  // Run hourly tasks after a short startup delay
  setTimeout(() => {
    checkInReminders(io).catch(() => {});
    upcomingFlightReminders(io).catch(() => {});
  }, 10000);

  setInterval(() => checkInReminders(io).catch(() => {}), HOUR);
  setInterval(() => upcomingFlightReminders(io).catch(() => {}), HOUR);
  setInterval(() => autoCompleteBookings().catch(() => {}), 6 * HOUR);
  setInterval(() => abandonedBookingCleanup().catch(() => {}), 2 * HOUR);

  // Run cleanup once on startup too
  setTimeout(() => {
    autoCompleteBookings().catch(() => {});
    abandonedBookingCleanup().catch(() => {});
  }, 15000);

  logger.info('Scheduler started (check-in reminders, flight reminders, auto-complete, abandoned cleanup)');
}

module.exports = { startScheduler };
