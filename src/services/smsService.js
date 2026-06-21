const logger = require('../utils/logger');

const getTwilioClient = () => {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return null;
  try {
    return require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  } catch {
    return null;
  }
};

const normalizePhone = (phone) => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length > 10) return `+${digits}`;
  return null;
};

const sendSms = async (to, body) => {
  const client = getTwilioClient();
  if (!client || !process.env.TWILIO_PHONE_NUMBER) return;
  const message = await client.messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
  });
  logger.info(`SMS sent to ${to}: ${message.sid}`);
};

const sendBookingConfirmationSms = async (booking, user) => {
  const rawPhones = [user.phone, booking.contactInfo?.phone].filter(Boolean);
  const phones = [...new Set(rawPhones.map(normalizePhone).filter(Boolean))];
  if (!phones.length) return;

  const from = booking.flight?.origin?.city || 'Origin';
  const to = booking.flight?.destination?.city || 'Destination';
  const dep = booking.flight?.departureTime;
  const depStr = dep
    ? new Date(dep).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
    : 'N/A';
  const amount = (booking.pricing?.totalAmount || 0).toLocaleString('en-IN');
  const bookingUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/bookings/${booking._id}`;

  const body =
    `FlightBook: Booking Confirmed!\n` +
    `Ref: ${booking.bookingReference}\n` +
    `${from} → ${to}\n` +
    `Departure: ${depStr}\n` +
    `Total Paid: ₹${amount}\n` +
    `View: ${bookingUrl}`;

  await Promise.all(phones.map((phone) => sendSms(phone, body)));
};

module.exports = { sendBookingConfirmationSms };
