const stripeKey = process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('your_stripe')
  ? process.env.STRIPE_SECRET_KEY
  : null;
const stripe = stripeKey ? require('stripe')(stripeKey) : null;

const razorpayConfigured = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET;
const Razorpay = razorpayConfigured ? require('razorpay') : null;
const razorpay = razorpayConfigured
  ? new (require('razorpay'))({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;
const Booking = require('../models/Booking');
const Flight = require('../models/Flight');
const Notification = require('../models/Notification');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const { generateTransactionId } = require('../utils/generateReference');
const logger = require('../utils/logger');
const { sendBookingConfirmationEmail } = require('../services/emailService');
const { sendBookingConfirmationSms } = require('../services/smsService');
const { emitAdminStatsUpdate } = require('../config/socket');

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

  sendBookingConfirmationEmail(booking, req.user).catch(err => logger.error('Confirmation email failed:', err.message));
  sendBookingConfirmationSms(booking, req.user).catch(err => logger.error('Confirmation SMS failed:', err.message));

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
          await booking.populate({
            path: 'flight',
            populate: [{ path: 'airline' }, { path: 'origin' }, { path: 'destination' }],
          });
          sendBookingConfirmationEmail(booking, booking.user).catch(err => logger.error('Confirmation email failed:', err.message));
          sendBookingConfirmationSms(booking, booking.user).catch(err => logger.error('Confirmation SMS failed:', err.message));
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
      case 'checkout.session.completed': {
        const session = event.data.object;
        const bookingId = session.metadata?.bookingId;
        if (!bookingId || session.payment_status !== 'paid') break;
        const booking = await Booking.findById(bookingId).populate('user');
        if (!booking || booking.status === 'confirmed') break;
        const txnId = generateTransactionId();
        booking.payment.status = 'completed';
        booking.payment.paidAt = new Date();
        booking.payment.transactionId = txnId;
        booking.payment.method = 'card';
        if (session.payment_intent) booking.payment.stripePaymentIntentId = session.payment_intent;
        booking.status = 'confirmed';
        await booking.save();
        if (booking.user) {
          await booking.populate({ path: 'flight', populate: [{ path: 'airline' }, { path: 'origin' }, { path: 'destination' }] });
          sendBookingConfirmationEmail(booking, booking.user).catch(err => logger.error('Confirmation email failed:', err.message));
          sendBookingConfirmationSms(booking, booking.user).catch(err => logger.error('Confirmation SMS failed:', err.message));
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

const createCheckoutSession = asyncHandler(async (req, res) => {
  const { bookingId } = req.body;
  if (!bookingId) return error(res, 400, 'bookingId is required');

  const booking = await Booking.findById(bookingId).populate('flight');
  if (!booking) return error(res, 404, 'Booking not found');

  if (booking.user.toString() !== req.user._id.toString()) {
    return error(res, 403, 'Not authorized to access this booking');
  }

  if (booking.status === 'confirmed') {
    return success(res, 200, { url: `${process.env.FRONTEND_URL}/booking/confirmation/${bookingId}` });
  }

  if (booking.status !== 'pending') {
    return error(res, 400, 'Booking is not in pending state');
  }

  if (!stripe) return error(res, 503, 'Payment service not configured');

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'inr',
        product_data: {
          name: `Flight Booking – ${booking.bookingReference}`,
          description: [
            booking.flight?.flightNumber,
            `${booking.class} class`,
            `${booking.passengers?.length ?? 1} passenger${(booking.passengers?.length ?? 1) !== 1 ? 's' : ''}`,
          ].filter(Boolean).join(' · '),
        },
        unit_amount: Math.round(booking.pricing.totalAmount * 100),
      },
      quantity: 1,
    }],
    mode: 'payment',
    customer_email: req.user.email,
    success_url: `${process.env.FRONTEND_URL}/booking/confirmation/${bookingId}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/payment/${bookingId}`,
    metadata: {
      bookingId: bookingId.toString(),
      bookingReference: booking.bookingReference || '',
    },
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });

  return success(res, 200, { url: session.url, sessionId: session.id });
});

const verifyCheckoutSession = asyncHandler(async (req, res) => {
  const { session_id, bookingId } = req.query;
  if (!session_id || !bookingId) return error(res, 400, 'session_id and bookingId are required');
  if (!stripe) return error(res, 503, 'Payment service not configured');

  const booking = await Booking.findById(bookingId).populate('flight');
  if (!booking) return error(res, 404, 'Booking not found');

  if (booking.user.toString() !== req.user._id.toString()) {
    return error(res, 403, 'Not authorized to access this booking');
  }

  if (booking.status === 'confirmed') {
    await booking.populate({ path: 'flight', populate: [{ path: 'airline' }, { path: 'origin' }, { path: 'destination' }] });
    return success(res, 200, { booking, alreadyConfirmed: true });
  }

  const session = await stripe.checkout.sessions.retrieve(session_id);
  if (session.payment_status !== 'paid') {
    return error(res, 400, `Payment not completed (status: ${session.payment_status})`);
  }

  const txnId = generateTransactionId();
  booking.payment.status = 'completed';
  booking.payment.paidAt = new Date();
  booking.payment.method = 'card';
  booking.payment.transactionId = txnId;
  if (session.payment_intent) booking.payment.stripePaymentIntentId = session.payment_intent;
  booking.status = 'confirmed';
  await booking.save();

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
    io.to(`booking:${booking._id}`).emit('booking:confirmed', {
      bookingId: booking._id,
      bookingReference: booking.bookingReference,
      status: 'confirmed',
    });
    io.to(`user:${req.user._id}`).emit('notification:new', {
      type: 'payment_success',
      message: 'Payment confirmed!',
    });
    emitAdminStatsUpdate(io, { event: 'payment:confirmed', bookingId: booking._id });
  }

  await booking.populate({ path: 'flight', populate: [{ path: 'airline' }, { path: 'origin' }, { path: 'destination' }] });

  sendBookingConfirmationEmail(booking, req.user).catch(err => logger.error('Confirmation email failed:', err.message));
  sendBookingConfirmationSms(booking, req.user).catch(err => logger.error('Confirmation SMS failed:', err.message));

  return success(res, 200, { booking });
});

const createRazorpayOrder = asyncHandler(async (req, res) => {
  const { bookingId } = req.body;
  if (!bookingId) return error(res, 400, 'bookingId is required');

  const booking = await Booking.findById(bookingId);
  if (!booking) return error(res, 404, 'Booking not found');

  if (booking.user.toString() !== req.user._id.toString()) {
    return error(res, 403, 'Not authorized to access this booking');
  }

  if (booking.status === 'confirmed') {
    return error(res, 400, 'Booking is already confirmed');
  }

  if (booking.status !== 'pending') {
    return error(res, 400, 'Booking is not in pending state');
  }

  if (!razorpay) return error(res, 503, 'Razorpay not configured');

  const order = await razorpay.orders.create({
    amount: Math.round(booking.pricing.totalAmount * 100), // paise
    currency: 'INR',
    receipt: (booking.bookingReference || bookingId).toString().slice(0, 40),
    notes: {
      bookingId: bookingId.toString(),
      bookingReference: booking.bookingReference || '',
    },
  });

  booking.payment.razorpayOrderId = order.id;
  await booking.save();

  return success(res, 200, {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: process.env.RAZORPAY_KEY_ID,
    bookingReference: booking.bookingReference,
  });
});

const verifyRazorpayPayment = asyncHandler(async (req, res) => {
  const { bookingId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

  if (!bookingId || !razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return error(res, 400, 'Missing required payment verification fields');
  }

  if (!process.env.RAZORPAY_KEY_SECRET) return error(res, 503, 'Razorpay not configured');

  const booking = await Booking.findById(bookingId).populate('flight');
  if (!booking) return error(res, 404, 'Booking not found');

  if (booking.user.toString() !== req.user._id.toString()) {
    return error(res, 403, 'Not authorized to access this booking');
  }

  if (booking.status === 'confirmed') {
    await booking.populate({ path: 'flight', populate: [{ path: 'airline' }, { path: 'origin' }, { path: 'destination' }] });
    return success(res, 200, { booking, alreadyConfirmed: true });
  }

  // Verify HMAC-SHA256 signature: orderId|paymentId signed with key_secret
  const crypto = require('crypto');
  const expectedSig = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSig !== razorpay_signature) {
    logger.error(`Razorpay signature mismatch for booking ${bookingId}`);
    return error(res, 400, 'Payment verification failed: invalid signature');
  }

  const txnId = generateTransactionId();
  booking.payment.status = 'completed';
  booking.payment.paidAt = new Date();
  booking.payment.method = 'razorpay';
  booking.payment.transactionId = txnId;
  booking.payment.razorpayOrderId = razorpay_order_id;
  booking.payment.razorpayPaymentId = razorpay_payment_id;
  booking.status = 'confirmed';
  await booking.save();

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
    io.to(`booking:${booking._id}`).emit('booking:confirmed', {
      bookingId: booking._id,
      bookingReference: booking.bookingReference,
      status: 'confirmed',
    });
    io.to(`user:${req.user._id}`).emit('notification:new', {
      type: 'payment_success',
      message: 'Payment confirmed!',
    });
    emitAdminStatsUpdate(io, { event: 'payment:confirmed', bookingId: booking._id });
  }

  await booking.populate({ path: 'flight', populate: [{ path: 'airline' }, { path: 'origin' }, { path: 'destination' }] });

  sendBookingConfirmationEmail(booking, req.user).catch(err => logger.error('Confirmation email failed:', err.message));
  sendBookingConfirmationSms(booking, req.user).catch(err => logger.error('Confirmation SMS failed:', err.message));

  return success(res, 200, { booking });
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
    emitAdminStatsUpdate(io, { event: 'payment:confirmed', bookingId: booking._id });
  }

  await booking.populate({
    path: 'flight',
    populate: [{ path: 'airline' }, { path: 'origin' }, { path: 'destination' }],
  });

  sendBookingConfirmationEmail(booking, req.user).catch(err => logger.error('Confirmation email failed:', err.message));
  sendBookingConfirmationSms(booking, req.user).catch(err => logger.error('Confirmation SMS failed:', err.message));

  return success(res, 200, { booking });
});

module.exports = {
  createPaymentIntent, createCheckoutSession, verifyCheckoutSession,
  createRazorpayOrder, verifyRazorpayPayment,
  confirmPayment, confirmDemoPayment, handleWebhook, processRefund,
};
