const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const { generalLimiter } = require('../middleware/rateLimiter');
const {
  createBooking,
  getUserBookings,
  getBookingById,
  cancelBooking,
  downloadBookingPDF,
  getBookingStats,
} = require('../controllers/bookingController');

router.use(generalLimiter);

router.route('/').post(protect, createBooking).get(protect, getUserBookings);
router.get('/stats', protect, admin, getBookingStats);
router.get('/:id', protect, getBookingById);
router.put('/:id/cancel', protect, cancelBooking);
router.get('/:id/download', protect, downloadBookingPDF);

module.exports = router;
