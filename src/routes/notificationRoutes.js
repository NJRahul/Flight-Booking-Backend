const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimiter');
const { getNotifications, markNotificationRead, markAllRead, deleteNotification } = require('../controllers/notificationController');

router.use(protect, generalLimiter);

router.get('/', getNotifications);
router.put('/read-all', markAllRead);
router.put('/:id/read', markNotificationRead);
router.delete('/:id', deleteNotification);

module.exports = router;
