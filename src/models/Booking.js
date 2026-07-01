const mongoose = require('mongoose');
const { generateBookingRef } = require('../utils/generateReference');

const passengerSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['adult', 'child', 'infant'], required: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    passportNumber: { type: String, trim: true },
    passportExpiry: { type: Date },
    nationality: { type: String },
    seatNumber: { type: String },
    mealPreference: { type: String, default: 'standard' },
    specialAssistance: { type: String },
  },
  { _id: true }
);

const bookingSchema = new mongoose.Schema(
  {
    bookingReference: { type: String, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    flight: { type: mongoose.Schema.Types.ObjectId, ref: 'Flight', required: true },
    returnFlight: { type: mongoose.Schema.Types.ObjectId, ref: 'Flight' },
    tripType: { type: String, enum: ['one-way', 'round-trip'], default: 'one-way' },
    class: { type: String, enum: ['economy', 'business', 'first'], required: true },
    passengers: { type: [passengerSchema], required: true },
    contactInfo: {
      email: { type: String, required: true },
      phone: { type: String, required: true },
      emergencyContact: {
        name: { type: String },
        phone: { type: String },
      },
    },
    pricing: {
      basePrice: { type: Number, required: true },
      taxes: { type: Number, default: 0 },
      fees: { type: Number, default: 0 },
      extras: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      totalAmount: { type: Number, required: true },
      currency: { type: String, default: 'INR' },
    },
    extras: {
      extraBaggage: { type: Boolean, default: false },
      travelInsurance: { type: Boolean, default: false },
      mealUpgrade: { type: Boolean, default: false },
      priorityBoarding: { type: Boolean, default: false },
    },
    payment: {
      status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
      method: { type: String, enum: ['card', 'upi', 'netbanking', 'wallet', 'stripe', 'razorpay', 'demo'] },
      transactionId: { type: String },
      stripePaymentIntentId: { type: String },
      razorpayOrderId: { type: String },
      razorpayPaymentId: { type: String },
      paidAt: { type: Date },
      refundAmount: { type: Number },
      refundedAt: { type: Date },
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'],
      default: 'pending',
    },
    cancellation: {
      cancelledAt: { type: Date },
      reason: { type: String },
      refundAmount: { type: Number },
      cancelledBy: { type: String, enum: ['user', 'admin', 'system'] },
      refundStatus: { type: String, enum: ['pending', 'processed', 'denied'] },
    },
    checkedIn: { type: Boolean, default: false },
    checkedInAt: { type: Date },
    boardingPass: { type: String },
    notes: { type: String },
    notifications: {
      checkInReminderSent: { type: Boolean, default: false },
      reminderSent: { type: Boolean, default: false },
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

bookingSchema.virtual('passengerCount').get(function () {
  return this.passengers.length;
});

bookingSchema.virtual('isRefundable').get(function () {
  if (!this.flight || !this.flight.departureTime) return false;
  const hoursUntilDeparture = (new Date(this.flight.departureTime) - Date.now()) / 3600000;
  return hoursUntilDeparture > 24 && this.status !== 'cancelled';
});

bookingSchema.pre('save', async function (next) {
  if (!this.bookingReference) {
    this.bookingReference = generateBookingRef();
  }
  this._wasNew = this.isNew;
  next();
});

bookingSchema.post('save', async function (doc) {
  try {
    if (doc._wasNew) {
      const Flight = mongoose.model('Flight');
      const seatClass = doc.class;
      const adultCount = doc.passengers.filter((p) => p.type === 'adult').length;
      const childCount = doc.passengers.filter((p) => p.type === 'child').length;
      const paxCount = adultCount + childCount;
      await Flight.findByIdAndUpdate(doc.flight, {
        $inc: { [`seats.${seatClass}.available`]: -paxCount },
      });

      if (doc.returnFlight) {
        await Flight.findByIdAndUpdate(doc.returnFlight, {
          $inc: { [`seats.${seatClass}.available`]: -paxCount },
        });
      }

      await mongoose.model('User').findByIdAndUpdate(doc.user, {
        $addToSet: { bookings: doc._id },
      });
    }
  } catch (_) {}
});

bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ flight: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ 'payment.status': 1 });

module.exports = mongoose.model('Booking', bookingSchema);
