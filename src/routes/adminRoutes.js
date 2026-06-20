const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const ctrl = require('../controllers/adminController');

// All admin routes require authentication + admin role
router.use(protect, admin);

// ── Dashboard ─────────────────────────────────
router.get('/stats', ctrl.getStats);
router.get('/revenue', ctrl.getRevenueTrend);
router.get('/popular-routes', ctrl.getPopularRoutes);
router.get('/recent-bookings', ctrl.getRecentBookings);
router.get('/recent-users', ctrl.getRecentUsers);

// ── Global Search ─────────────────────────────
router.get('/search', ctrl.globalSearch);

// ── Reports ───────────────────────────────────
router.get('/reports', ctrl.getReports);

// ── Flights ───────────────────────────────────
router.route('/flights').get(ctrl.getAdminFlights).post(ctrl.createFlight);
router.route('/flights/:id').put(ctrl.updateFlight).delete(ctrl.deleteFlight);
router.patch('/flights/:id/status', ctrl.updateFlightStatus);

// ── Bookings ──────────────────────────────────
router.route('/bookings').get(ctrl.getAdminBookings);
router.route('/bookings/:id').patch(ctrl.updateAdminBooking);
router.post('/bookings/:id/refund', ctrl.processAdminRefund);

// ── Users ─────────────────────────────────────
router.route('/users').get(ctrl.getAdminUsers);
router.route('/users/:id').patch(ctrl.updateAdminUser);
router.get('/users/:id/detail', ctrl.getUserDetail);

// ── Airlines ──────────────────────────────────
router.route('/airlines').get(ctrl.getAdminAirlines).post(ctrl.createAirline);
router.route('/airlines/:id').put(ctrl.updateAirline).delete(ctrl.deleteAirline);

// ── Airports ──────────────────────────────────
router.route('/airports').get(ctrl.getAdminAirports).post(ctrl.createAirport);
router.route('/airports/:id').put(ctrl.updateAirport).delete(ctrl.deleteAirport);

// ── Admin Notifications ───────────────────────
router.get('/notifications', ctrl.getAdminNotifications);
router.put('/notifications/:id/resolve', ctrl.markAdminNotificationResolved);

module.exports = router;
