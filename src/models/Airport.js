const mongoose = require('mongoose');

const airportSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 3 },
    name: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    countryCode: { type: String, required: true, uppercase: true, trim: true, maxlength: 2 },
    timezone: { type: String, required: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [longitude, latitude]
    },
    terminals: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

airportSchema.index({ location: '2dsphere' });
airportSchema.index({ city: 1, country: 1 });

module.exports = mongoose.model('Airport', airportSchema);
