const crypto = require('crypto');
const asyncHandler = require('../middleware/asyncHandler');
const User = require('../models/User');
const { generateJWT } = require('../utils/generateToken');
const { success, error } = require('../utils/apiResponse');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');

const sendTokenResponse = (user, statusCode, res) => {
  const token = generateJWT(user._id);

  res.cookie('token', token, {
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });

  user.password = undefined;

  return res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      phone: user.phone,
      preferences: user.preferences,
    },
  });
};

const register = asyncHandler(async (req, res, next) => {
  const { name, email, password, phone } = req.body;

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return error(res, 400, 'Email already registered');

  const user = await User.create({ name, email, password, phone });

  emailService.sendWelcomeEmail(user).catch((err) =>
    logger.error(`Welcome email failed for ${user.email}: ${err.message}`)
  );

  sendTokenResponse(user, 201, res);
});

const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

  if (!user || !(await user.matchPassword(password))) {
    return error(res, 401, 'Invalid credentials');
  }

  if (!user.isActive) return error(res, 403, 'Account has been deactivated. Please contact support.');

  user.lastLogin = Date.now();
  await user.save({ validateBeforeSave: false });

  const io = req.app.get('io');
  if (io) io.to(`user:${user._id}`).emit('user:login', { userId: user._id });

  sendTokenResponse(user, 200, res);
});

const getMe = asyncHandler(async (req, res, next) => {
  const mongoose = require('mongoose');
  let query = User.findById(req.user._id).select('+passportNumber +passportExpiry');

  // Populate bookings only once the Booking model is registered (Module 3+)
  if (mongoose.models.Booking) {
    query = query.populate({
      path: 'bookings',
      select: 'bookingReference status createdAt totalAmount',
      options: { limit: 5, sort: { createdAt: -1 } },
    });
  }

  const user = await query;
  if (!user) return error(res, 404, 'User not found');
  success(res, 200, { user });
});

const updateProfile = asyncHandler(async (req, res, next) => {
  const allowed = ['name', 'phone', 'dateOfBirth', 'gender', 'nationality', 'preferences', 'frequentFlyerNumber', 'passportNumber', 'passportExpiry', 'emergencyContact'];
  const updates = {};
  allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
  success(res, 200, { user }, 'Profile updated successfully');
});

const updatePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.matchPassword(currentPassword))) return error(res, 401, 'Current password is incorrect');
  if (currentPassword === newPassword) return error(res, 400, 'New password must differ from current password');

  user.password = newPassword;
  await user.save();
  sendTokenResponse(user, 200, res);
});

const forgotPassword = asyncHandler(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email?.toLowerCase() });

  // Always return success to prevent email enumeration
  if (!user) {
    return success(res, 200, null, 'If that email exists, a reset link has been sent');
  }

  const resetToken = user.getResetPasswordToken();
  await user.save({ validateBeforeSave: false });

  try {
    await emailService.sendPasswordResetEmail(user, resetToken);
    success(res, 200, null, 'Password reset email sent');
  } catch (err) {
    logger.error(`Password reset email failed: ${err.message}`);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });
    return error(res, 500, 'Failed to send reset email. Please try again.');
  }
});

const resetPassword = asyncHandler(async (req, res, next) => {
  const hashedToken = crypto.createHash('sha256').update(req.params.resettoken).digest('hex');

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() },
  }).select('+resetPasswordToken +resetPasswordExpire');

  if (!user) return error(res, 400, 'Invalid or expired reset token');

  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  sendTokenResponse(user, 200, res);
});

const logout = asyncHandler(async (req, res, next) => {
  res.cookie('token', 'none', { expires: new Date(Date.now() + 5 * 1000), httpOnly: true });
  success(res, 200, null, 'Logged out successfully');
});

module.exports = { register, login, getMe, updateProfile, updatePassword, forgotPassword, resetPassword, logout };
