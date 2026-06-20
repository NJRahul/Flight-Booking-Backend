const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    flight: { type: mongoose.Schema.Types.ObjectId, ref: 'Flight', required: true },
    airline: { type: mongoose.Schema.Types.ObjectId, ref: 'Airline', required: true },
    ratings: {
      overall: { type: Number, required: true, min: 1, max: 5 },
      seatComfort: { type: Number, min: 1, max: 5 },
      cabinService: { type: Number, min: 1, max: 5 },
      foodBeverage: { type: Number, min: 1, max: 5 },
      entertainment: { type: Number, min: 1, max: 5 },
      valueForMoney: { type: Number, min: 1, max: 5 },
    },
    title: { type: String, trim: true, maxlength: 200 },
    comment: { type: String, trim: true, maxlength: 2000 },
    travelClass: { type: String, enum: ['economy', 'business', 'first'] },
    isVerified: { type: Boolean, default: true },
    helpful: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

reviewSchema.index({ airline: 1, isPublished: 1 });
reviewSchema.index({ flight: 1 });
reviewSchema.index({ user: 1 });
reviewSchema.index({ booking: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
