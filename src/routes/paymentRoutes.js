const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const { generalLimiter } = require('../middleware/rateLimiter');
const { createPaymentIntent, createCheckoutSession, verifyCheckoutSession, confirmPayment, confirmDemoPayment, handleWebhook, processRefund } = require('../controllers/paymentController');

// Webhook: no auth, no rate limit (raw body handled at server level)
router.post('/webhook', handleWebhook);

router.use(generalLimiter);

router.post('/create-intent', protect, createPaymentIntent);
router.post('/create-checkout-session', protect, createCheckoutSession);
router.get('/verify-session', protect, verifyCheckoutSession);
router.post('/confirm', protect, confirmPayment);
router.post('/confirm-demo', protect, confirmDemoPayment);
router.post('/refund', protect, admin, processRefund);

module.exports = router;
