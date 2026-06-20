const mongoose = require('mongoose');

const airlineSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 3 },
    name: { type: String, required: true, trim: true },
    logo: { type: String },
    country: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    baggage: {
      cabin: { type: Number, default: 7 },   // kg
      checked: { type: Number, default: 20 }, // kg
    },
    fleetSize: { type: Number, default: 0 },
    rating: { type: Number, default: 4.0, min: 1, max: 5 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Airline', airlineSchema);
