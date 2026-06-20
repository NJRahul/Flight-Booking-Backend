const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const createPaymentIntent = async (amount, currency = 'inr', metadata = {}) => {
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency,
    metadata,
    automatic_payment_methods: { enabled: true },
  });
  return { clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id };
};

const confirmPayment = async (paymentIntentId) => {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  return paymentIntent;
};

const processRefund = async (chargeId, amount) => {
  const refund = await stripe.refunds.create({ charge: chargeId, amount });
  return refund;
};

const getPaymentIntent = async (paymentIntentId) => {
  return stripe.paymentIntents.retrieve(paymentIntentId);
};

module.exports = { createPaymentIntent, confirmPayment, processRefund, getPaymentIntent };
