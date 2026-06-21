const nodemailer = require('nodemailer');
const { format } = require('date-fns');
const logger = require('../utils/logger');

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10),
    secure: process.env.EMAIL_PORT === '465',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

const sendEmail = async ({ to, subject, html }) => {
  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME || 'FlightBook'}" <${process.env.EMAIL_FROM_ADDRESS}>`,
    to,
    subject,
    html,
  });
  logger.info(`Email sent to ${to}: ${info.messageId}`);
  return info;
};

const baseLayout = (content, headerColor = '#2563eb') => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;">
          <tr>
            <td style="background:${headerColor};border-radius:12px 12px 0 0;padding:28px 40px;">
              <span style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;">✈ FlightBook</span>
            </td>
          </tr>
          <tr>
            <td style="background:#fff;padding:40px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 0;text-align:center;color:#94a3b8;font-size:12px;line-height:1.6;">
              <p style="margin:0 0 6px 0;">© ${new Date().getFullYear()} FlightBook. All rights reserved.</p>
              <p style="margin:0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" style="color:#94a3b8;text-decoration:underline;">Visit FlightBook</a>
                &nbsp;·&nbsp;
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/unsubscribe" style="color:#94a3b8;text-decoration:underline;">Unsubscribe</a>
                &nbsp;·&nbsp;
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/privacy" style="color:#94a3b8;text-decoration:underline;">Privacy Policy</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const ctaButton = (text, url, color = '#2563eb') => `
<table cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0;">
  <tr>
    <td style="background:${color};border-radius:8px;">
      <a href="${url}" style="display:inline-block;padding:14px 32px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:-0.2px;">${text} →</a>
    </td>
  </tr>
</table>`;

const featureRow = (icon, title, desc) => `
<tr>
  <td style="padding:10px 0;">
    <table cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td style="font-size:20px;width:32px;vertical-align:top;">${icon}</td>
        <td style="padding-left:12px;vertical-align:top;">
          <strong style="color:#0f172a;font-size:14px;">${title}</strong>
          <br><span style="color:#64748b;font-size:13px;">${desc}</span>
        </td>
      </tr>
    </table>
  </td>
</tr>`;

// ── Welcome Email ──────────────────────────────────────────────
const sendWelcomeEmail = async (user) => {
  const firstName = user.name.split(' ')[0];
  const content = `
    <h2 style="color:#0f172a;font-size:24px;font-weight:700;margin:0 0 8px 0;">Welcome aboard, ${firstName}! ✈️</h2>
    <p style="color:#475569;font-size:16px;line-height:1.6;margin:0 0 28px 0;">
      Your FlightBook account is ready. Start exploring thousands of flights at the best prices.
    </p>
    <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin:0 0 28px 0;background:#f8fafc;border-radius:10px;padding:20px;">
      ${featureRow('🔍', 'Search 1,000+ flights daily', 'Compare fares across all major airlines')}
      ${featureRow('⚡', 'Instant booking & e-tickets', 'Receive your ticket in seconds via email')}
      ${featureRow('🛡️', 'Secure payments', 'Your card and personal data are always protected')}
      ${featureRow('📱', 'Manage bookings anytime', 'Cancel, change, or check-in from your account')}
    </table>
    ${ctaButton('Start Booking', process.env.FRONTEND_URL || 'http://localhost:5173')}
    <p style="color:#94a3b8;font-size:13px;margin:0;">
      Questions? Reply to this email — our support team is always here.
    </p>`;

  return sendEmail({
    to: user.email,
    subject: `Welcome to FlightBook, ${firstName}! ✈️`,
    html: baseLayout(content),
  });
};

// ── Password Reset Email ───────────────────────────────────────
const sendPasswordResetEmail = async (user, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${resetToken}`;
  const firstName = user.name.split(' ')[0];

  const content = `
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px 0;">Reset your password</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px 0;">
      Hi ${firstName}, we received a request to reset your FlightBook password.
      Click the button below to choose a new password.
    </p>
    ${ctaButton('Reset Password', resetUrl)}
    <p style="color:#64748b;font-size:13px;line-height:1.6;margin:20px 0 0 0;padding:16px;background:#fef3c7;border-radius:8px;border-left:4px solid #f59e0b;">
      ⏱ This link expires in <strong>10 minutes</strong>. If you didn't request this, you can safely ignore this email — your password won't change.
    </p>
    <p style="color:#94a3b8;font-size:12px;margin:20px 0 0 0;">
      Or copy and paste this URL into your browser:<br>
      <a href="${resetUrl}" style="color:#2563eb;word-break:break-all;">${resetUrl}</a>
    </p>`;

  return sendEmail({
    to: user.email,
    subject: 'Reset Your FlightBook Password',
    html: baseLayout(content, '#0f172a'),
  });
};

// ── Booking Confirmation Email ─────────────────────────────────
const sendBookingConfirmationEmail = async (booking, user) => {
  const dep = booking.flight?.departureTime;
  const arr = booking.flight?.arrivalTime;
  const depFormatted = dep ? format(new Date(dep), 'EEE, dd MMM yyyy — HH:mm') : 'N/A';
  const arrFormatted = arr ? format(new Date(arr), 'EEE, dd MMM yyyy — HH:mm') : 'N/A';
  const from = booking.flight?.origin?.city || 'Origin';
  const to = booking.flight?.destination?.city || 'Destination';
  const passengerRows = (booking.passengers || [])
    .map((p) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#475569;">${p.firstName} ${p.lastName}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#475569;text-transform:capitalize;">${p.type}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#475569;">${p.seatNumber || '—'}</td></tr>`)
    .join('');

  const content = `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin-bottom:28px;text-align:center;">
      <p style="color:#15803d;font-size:13px;font-weight:600;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:1px;">Booking Confirmed</p>
      <p style="color:#0f172a;font-size:32px;font-weight:700;font-family:monospace;margin:0 0 6px 0;letter-spacing:4px;">${booking.bookingReference}</p>
      <p style="color:#475569;font-size:14px;margin:0;">${from} → ${to}</p>
    </div>
    <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin-bottom:24px;background:#f8fafc;border-radius:10px;overflow:hidden;">
      <tr style="background:#e0e7ff;">
        <td style="padding:12px;font-size:12px;font-weight:600;color:#3730a3;text-transform:uppercase;letter-spacing:0.5px;">Flight</td>
        <td style="padding:12px;font-size:12px;font-weight:600;color:#3730a3;text-transform:uppercase;letter-spacing:0.5px;">${booking.flight?.flightNumber || 'N/A'}</td>
      </tr>
      <tr>
        <td style="padding:12px;color:#64748b;font-size:13px;">Departure</td>
        <td style="padding:12px;color:#0f172a;font-size:13px;font-weight:500;">${depFormatted}</td>
      </tr>
      <tr style="background:#f8fafc;">
        <td style="padding:12px;color:#64748b;font-size:13px;">Arrival</td>
        <td style="padding:12px;color:#0f172a;font-size:13px;font-weight:500;">${arrFormatted}</td>
      </tr>
      <tr>
        <td style="padding:12px;color:#64748b;font-size:13px;">Class</td>
        <td style="padding:12px;color:#0f172a;font-size:13px;font-weight:500;text-transform:capitalize;">${booking.class || 'Economy'}</td>
      </tr>
      <tr style="background:#f8fafc;">
        <td style="padding:12px;color:#64748b;font-size:13px;">Total Paid</td>
        <td style="padding:12px;color:#0f172a;font-size:15px;font-weight:700;">₹${(booking.pricing?.totalAmount || 0).toLocaleString('en-IN')}</td>
      </tr>
    </table>
    ${passengerRows ? `
    <h3 style="color:#0f172a;font-size:15px;font-weight:600;margin:0 0 12px 0;">Passengers</h3>
    <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <tr style="background:#f8fafc;"><th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;">Name</th><th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;">Type</th><th style="padding:10px 12px;text-align:left;font-size:12px;color:#64748b;">Seat</th></tr>
      ${passengerRows}
    </table>` : ''}
    <div style="background:#eff6ff;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="color:#1e40af;font-size:13px;font-weight:600;margin:0 0 8px 0;">📋 Important Reminders</p>
      <ul style="color:#3b82f6;font-size:13px;margin:0;padding-left:20px;line-height:1.8;">
        <li>Online check-in opens 48 hours before departure</li>
        <li>Arrive at the airport at least 2 hours before departure</li>
        <li>Carry a valid photo ID or passport</li>
      </ul>
    </div>
    ${ctaButton('View Booking', `${process.env.FRONTEND_URL || 'http://localhost:5173'}/bookings/${booking._id}`)}`;

  const recipients = [user.email];
  const contactEmail = booking.contactInfo?.email;
  if (contactEmail && contactEmail.toLowerCase() !== user.email.toLowerCase()) {
    recipients.push(contactEmail);
  }

  return sendEmail({
    to: recipients.join(', '),
    subject: `Booking Confirmed! ${booking.bookingReference} — ${from} to ${to}`,
    html: baseLayout(content),
  });
};

// ── Cancellation Email ─────────────────────────────────────────
const sendCancellationEmail = async (booking, user) => {
  const from = booking.flight?.origin?.city || 'Origin';
  const to = booking.flight?.destination?.city || 'Destination';
  const refundAmount = booking.refundAmount || 0;

  const content = `
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px 0;">Booking Cancelled</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px 0;">
      Your booking <strong>${booking.bookingReference}</strong> (${from} → ${to}) has been cancelled.
    </p>
    ${refundAmount > 0 ? `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin-bottom:24px;">
      <p style="color:#15803d;font-size:14px;font-weight:600;margin:0 0 6px 0;">Refund Initiated</p>
      <p style="color:#0f172a;font-size:24px;font-weight:700;margin:0 0 6px 0;">₹${refundAmount.toLocaleString('en-IN')}</p>
      <p style="color:#475569;font-size:13px;margin:0;">Expected in 5–7 business days to your original payment method.</p>
    </div>` : `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;margin-bottom:24px;">
      <p style="color:#991b1b;font-size:13px;margin:0;">No refund is applicable for this cancellation as per the fare rules.</p>
    </div>`}
    ${ctaButton('Search New Flights', process.env.FRONTEND_URL || 'http://localhost:5173', '#475569')}`;

  return sendEmail({
    to: user.email,
    subject: `Booking ${booking.bookingReference} Cancelled`,
    html: baseLayout(content, '#64748b'),
  });
};

// ── Flight Status Email ────────────────────────────────────────
const sendFlightStatusEmail = async (booking, user, statusUpdate) => {
  const { flightNumber, status, oldDepartureTime, newDepartureTime, gate } = statusUpdate;
  const statusLabels = { delayed: 'Flight Delayed', cancelled: 'Flight Cancelled', boarding: 'Boarding Now' };
  const headerColors = { delayed: '#b45309', cancelled: '#b91c1c', boarding: '#1d4ed8' };

  const content = `
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px 0;">${statusLabels[status] || 'Flight Update'}</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px 0;">
      There's an update for your flight <strong>${flightNumber}</strong> (Booking: ${booking.bookingReference}).
    </p>
    <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background:#f8fafc;border-radius:10px;margin-bottom:24px;">
      <tr><td style="padding:14px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Status</td><td style="padding:14px;font-size:13px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;text-transform:capitalize;">${status}</td></tr>
      ${oldDepartureTime ? `<tr><td style="padding:14px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Original Departure</td><td style="padding:14px;font-size:13px;color:#64748b;text-decoration:line-through;border-bottom:1px solid #e2e8f0;">${format(new Date(oldDepartureTime), 'EEE, dd MMM — HH:mm')}</td></tr>` : ''}
      ${newDepartureTime ? `<tr><td style="padding:14px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">New Departure</td><td style="padding:14px;font-size:13px;font-weight:600;color:#b45309;border-bottom:1px solid #e2e8f0;">${format(new Date(newDepartureTime), 'EEE, dd MMM — HH:mm')}</td></tr>` : ''}
      ${gate ? `<tr><td style="padding:14px;color:#64748b;font-size:13px;">Gate</td><td style="padding:14px;font-size:13px;font-weight:600;color:#0f172a;">${gate}</td></tr>` : ''}
    </table>
    <p style="color:#64748b;font-size:13px;line-height:1.6;margin:0 0 24px 0;">
      We apologise for any inconvenience. Please check in with airport staff for the latest updates.
    </p>
    ${ctaButton('View Booking Details', `${process.env.FRONTEND_URL || 'http://localhost:5173'}/bookings/${booking._id}`, headerColors[status] || '#2563eb')}`;

  return sendEmail({
    to: user.email,
    subject: `⚠️ Flight ${flightNumber} Update — ${statusLabels[status] || status}`,
    html: baseLayout(content, headerColors[status] || '#2563eb'),
  });
};

// ── Check-in Reminder Email ────────────────────────────────────
const sendCheckInReminderEmail = async (booking, user) => {
  const from = booking.flight?.origin?.city || 'Origin';
  const to = booking.flight?.destination?.city || 'Destination';
  const dep = booking.flight?.departureTime;
  const depFormatted = dep ? format(new Date(dep), 'EEE, dd MMM yyyy — HH:mm') : 'N/A';
  const checkInUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard/bookings/${booking._id}`;

  const content = `
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px 0;">✅ Check-in is Open!</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px 0;">
      Online check-in for your flight from <strong>${from}</strong> to <strong>${to}</strong> is now open.
    </p>
    <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background:#f8fafc;border-radius:10px;margin-bottom:24px;">
      <tr><td style="padding:14px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Booking Ref</td><td style="padding:14px;font-size:13px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;">${booking.bookingReference}</td></tr>
      <tr><td style="padding:14px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Flight</td><td style="padding:14px;font-size:13px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;">${booking.flight?.flightNumber || 'N/A'}</td></tr>
      <tr><td style="padding:14px;color:#64748b;font-size:13px;">Departure</td><td style="padding:14px;font-size:13px;font-weight:600;color:#0f172a;">${depFormatted}</td></tr>
    </table>
    <div style="background:#eff6ff;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="color:#1e40af;font-size:13px;font-weight:600;margin:0 0 6px 0;">📋 Remember</p>
      <ul style="color:#3b82f6;font-size:13px;margin:0;padding-left:20px;line-height:1.8;">
        <li>Arrive at the airport at least 2 hours before departure</li>
        <li>Carry a valid photo ID or passport for all passengers</li>
        <li>Check baggage allowance before packing</li>
      </ul>
    </div>
    ${ctaButton('Check In Now', checkInUrl)}`;

  return sendEmail({
    to: user.email,
    subject: `⏰ Check-in Open: ${booking.bookingReference} — ${from} to ${to}`,
    html: baseLayout(content),
  });
};

// ── Flight Reminder Email ──────────────────────────────────────
const sendFlightReminderEmail = async (booking, user) => {
  const from = booking.flight?.origin?.city || 'Origin';
  const to = booking.flight?.destination?.city || 'Destination';
  const dep = booking.flight?.departureTime;
  const depFormatted = dep ? format(new Date(dep), 'HH:mm') : 'N/A';

  const content = `
    <h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:0 0 8px 0;">✈️ Your flight departs soon!</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px 0;">
      Your flight from <strong>${from}</strong> to <strong>${to}</strong> departs at <strong>${depFormatted}</strong>.
      Head to the airport now if you haven't already.
    </p>
    <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background:#f8fafc;border-radius:10px;margin-bottom:24px;">
      <tr><td style="padding:14px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Booking Ref</td><td style="padding:14px;font-size:13px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;">${booking.bookingReference}</td></tr>
      <tr><td style="padding:14px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Flight</td><td style="padding:14px;font-size:13px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;">${booking.flight?.flightNumber || 'N/A'}</td></tr>
      <tr><td style="padding:14px;color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;">Terminal</td><td style="padding:14px;font-size:13px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;">${booking.flight?.terminal || '—'}</td></tr>
      <tr><td style="padding:14px;color:#64748b;font-size:13px;">Gate</td><td style="padding:14px;font-size:13px;font-weight:600;color:#0f172a;">${booking.flight?.gate || '—'}</td></tr>
    </table>
    ${ctaButton('View Boarding Pass', `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard/bookings/${booking._id}`, '#16a34a')}`;

  return sendEmail({
    to: user.email,
    subject: `🛫 Departing at ${depFormatted} — ${booking.bookingReference}`,
    html: baseLayout(content, '#16a34a'),
  });
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendBookingConfirmationEmail,
  sendCancellationEmail,
  sendFlightStatusEmail,
  sendCheckInReminderEmail,
  sendFlightReminderEmail,
};
