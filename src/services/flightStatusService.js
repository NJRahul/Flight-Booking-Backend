const Flight = require('../models/Flight');
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const emailService = require('./emailService');
const amadeusService = require('./amadeusService');
const logger = require('../utils/logger');

async function updateFlightStatus(io, flight, newStatus, delayMinutes = 0, reason = '') {
  const oldStatus = flight.status;

  await Flight.findByIdAndUpdate(flight._id, {
    status: newStatus,
    delay: newStatus === 'delayed' ? delayMinutes : 0,
  });

  // Emit to everyone watching this flight room
  if (io) {
    io.to(`flight:${flight._id}`).emit('flight:update', {
      flightId: flight._id,
      flightNumber: flight.flightNumber,
      status: newStatus,
      delay: delayMinutes,
      gate: flight.gate,
      reason,
    });
  }

  // Only notify passengers for impactful statuses
  if (!['delayed', 'cancelled', 'boarding'].includes(newStatus)) return;

  const bookings = await Booking.find({ flight: flight._id, status: 'confirmed' })
    .populate('user', 'name email preferences')
    .lean();

  const typeMap = { delayed: 'flight_delay', cancelled: 'flight_cancelled', boarding: 'general' };
  const notifType = typeMap[newStatus] || 'general';
  const title =
    newStatus === 'delayed'
      ? `Flight ${flight.flightNumber} delayed by ${delayMinutes} min`
      : newStatus === 'cancelled'
      ? `Flight ${flight.flightNumber} has been cancelled`
      : `Flight ${flight.flightNumber} is now boarding`;

  const message =
    reason ||
    (newStatus === 'delayed'
      ? `Your flight has been delayed by ${delayMinutes} minutes.`
      : newStatus === 'cancelled'
      ? 'Your flight has been cancelled. Please contact support.'
      : `Boarding has begun at Gate ${flight.gate || 'TBA'}.`);

  for (const booking of bookings) {
    if (!booking.user) continue;

    // In-app notification
    await Notification.createForUser(
      booking.user._id,
      notifType,
      title,
      message,
      { flightId: flight._id, bookingId: booking._id },
      newStatus === 'cancelled' ? 'high' : 'medium'
    ).catch(() => {});

    // Socket push to user room
    if (io) {
      io.to(`user:${booking.user._id}`).emit('notification:new', {
        type: notifType,
        title,
        message,
        _id: `${booking._id}-${Date.now()}`,
        isRead: false,
        createdAt: new Date().toISOString(),
        data: { flightId: flight._id, bookingId: booking._id },
      });
      // Also emit to the specific booking room
      io.to(`booking:${booking._id}`).emit('booking:flight_update', {
        flightId: flight._id,
        status: newStatus,
        delay: delayMinutes,
        gate: flight.gate,
      });
    }

    // Email (fire-and-forget; only if user opted in or notification is critical)
    const sendEmail = booking.user.preferences?.notificationEmail !== false || newStatus === 'cancelled';
    if (sendEmail) {
      emailService
        .sendFlightStatusEmail(
          { ...booking, flight },
          booking.user,
          {
            flightNumber: flight.flightNumber,
            status: newStatus,
            oldDepartureTime: flight.departureTime,
            newDepartureTime:
              newStatus === 'delayed'
                ? new Date(new Date(flight.departureTime).getTime() + delayMinutes * 60000)
                : undefined,
            gate: flight.gate,
          }
        )
        .catch(() => {});
    }
  }

  logger.info(`Flight ${flight.flightNumber}: ${oldStatus} → ${newStatus} (${bookings.length} passengers notified)`);
}

async function pollFlightStatuses(io) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const flights = await Flight.find({
    isActive: true,
    status: { $in: ['scheduled', 'boarding', 'delayed'] },
    departureTime: { $gte: now, $lte: cutoff },
  })
    .populate('origin', 'code')
    .populate('destination', 'code')
    .lean();

  for (const flight of flights) {
    try {
      const depDate = new Date(flight.departureTime).toISOString().split('T')[0];
      const liveStatus = await amadeusService.getFlightStatus(flight.flightNumber, depDate);
      if (!liveStatus) continue;

      const newStatus = liveStatus.flightStatus?.toLowerCase();
      if (!newStatus || newStatus === flight.status) continue;

      const validStatuses = ['scheduled', 'boarding', 'departed', 'arrived', 'delayed', 'cancelled'];
      if (!validStatuses.includes(newStatus)) continue;

      const delay = liveStatus.delays?.departureGateDelayInMinutes
        ? parseInt(liveStatus.delays.departureGateDelayInMinutes)
        : 0;

      await updateFlightStatus(io, flight, newStatus, delay, 'Automated status update from airline data');
    } catch (err) {
      // Skip individual flight errors silently
    }
  }
}

function startFlightStatusPolling(io) {
  // Run once after 30s startup delay, then every 5 minutes
  setTimeout(() => pollFlightStatuses(io).catch(() => {}), 30000);
  setInterval(() => pollFlightStatuses(io).catch(() => {}), 5 * 60 * 1000);
  logger.info('Flight status polling started (5-minute interval)');
}

module.exports = { startFlightStatusPolling, updateFlightStatus };
