const mongoose = require('mongoose');

const seatInventorySchema = new mongoose.Schema(
  {
    total: { type: Number, required: true },
    available: { type: Number, required: true },
    price: { type: Number, required: true },
  },
  { _id: false }
);

const flightSchema = new mongoose.Schema(
  {
    flightNumber: { type: String, required: true, trim: true },
    airline: { type: mongoose.Schema.Types.ObjectId, ref: 'Airline', required: true },
    origin: { type: mongoose.Schema.Types.ObjectId, ref: 'Airport', required: true },
    destination: { type: mongoose.Schema.Types.ObjectId, ref: 'Airport', required: true },
    departureTime: { type: Date, required: true },
    arrivalTime: { type: Date, required: true },
    duration: { type: Number, required: true }, // minutes
    aircraft: {
      type: { type: String },
      registration: { type: String },
    },
    seats: {
      economy: { type: seatInventorySchema, required: true },
      business: { type: seatInventorySchema, required: true },
      first: { type: seatInventorySchema, required: true },
    },
    status: {
      type: String,
      enum: ['scheduled', 'boarding', 'departed', 'arrived', 'delayed', 'cancelled'],
      default: 'scheduled',
    },
    delay: { type: Number, default: 0 }, // minutes
    terminal: { type: String },
    gate: { type: String },
    baggage: {
      cabin: { type: Number, default: 7 },   // kg
      checked: { type: Number, default: 20 }, // kg
    },
    amenities: {
      wifi: { type: Boolean, default: false },
      meals: { type: Boolean, default: false },
      entertainment: { type: Boolean, default: false },
      usb: { type: Boolean, default: true },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

flightSchema.virtual('isDelayed').get(function () {
  return this.delay > 0;
});

flightSchema.virtual('occupancyRate').get(function () {
  const totalSeats = this.seats.economy.total + this.seats.business.total + this.seats.first.total;
  const takenSeats =
    (this.seats.economy.total - this.seats.economy.available) +
    (this.seats.business.total - this.seats.business.available) +
    (this.seats.first.total - this.seats.first.available);
  return totalSeats > 0 ? Math.round((takenSeats / totalSeats) * 100) : 0;
});

flightSchema.index({ origin: 1, destination: 1, departureTime: 1 });
flightSchema.index({ flightNumber: 1 });
flightSchema.index({ status: 1 });
flightSchema.index({ airline: 1 });

flightSchema.pre('save', function (next) {
  if (this.departureTime && this.arrivalTime && !this.duration) {
    this.duration = Math.round((this.arrivalTime - this.departureTime) / 60000);
  }
  next();
});

flightSchema.post('save', async function (doc) {
  if (doc.status === 'delayed' || doc.status === 'cancelled') {
    try {
      const Flight = mongoose.model('Flight');
      const io = global.io;
      if (io) {
        io.to(`flight:${doc._id}`).emit('flight:statusUpdate', {
          flightId: doc._id,
          flightNumber: doc.flightNumber,
          status: doc.status,
          delay: doc.delay,
        });
      }
    } catch (_) {}
  }
});

module.exports = mongoose.model('Flight', flightSchema);
