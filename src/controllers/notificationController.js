const asyncHandler = require('../middleware/asyncHandler');
const Notification = require('../models/Notification');
const { success, error } = require('../utils/apiResponse');

// GET /api/notifications
// Query params: type (string), isRead (boolean string 'true'/'false'), page (default 1), limit (default 20)
const getNotifications = asyncHandler(async (req, res) => {
  const { type, isRead, page = 1, limit = 20 } = req.query;
  const filter = { user: req.user._id };
  if (type) filter.type = type;
  if (isRead !== undefined) filter.isRead = isRead === 'true';

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [notifications, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Notification.countDocuments(filter),
  ]);
  const unreadCount = await Notification.countDocuments({ user: req.user._id, isRead: false });

  success(res, 200, { notifications, total, unreadCount, page: parseInt(page), limit: parseInt(limit) });
});

// PUT /api/notifications/:id/read
const markNotificationRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({ _id: req.params.id, user: req.user._id });
  if (!notification) return error(res, 404, 'Notification not found');
  await notification.markAsRead();
  success(res, 200, { notification }, 'Notification marked as read');
});

// PUT /api/notifications/read-all
const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { user: req.user._id, isRead: false },
    { isRead: true, readAt: new Date() }
  );
  success(res, 200, null, 'All notifications marked as read');
});

// DELETE /api/notifications/:id
const deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!notification) return error(res, 404, 'Notification not found');
  success(res, 200, null, 'Notification deleted');
});

module.exports = { getNotifications, markNotificationRead, markAllRead, deleteNotification };
