const mongoose = require('mongoose');

const savedSearchSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, trim: true },
    from: { type: String, trim: true },
    to: { type: String, trim: true },
    fromCity: { type: String, trim: true },
    toCity: { type: String, trim: true },
    departureDate: { type: String },
    returnDate: { type: String },
    adults: { type: Number, default: 1 },
    children: { type: Number, default: 0 },
    infants: { type: Number, default: 0 },
    class: { type: String, default: 'economy' },
    tripType: { type: String, default: 'one-way' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SavedSearch', savedSearchSchema);
