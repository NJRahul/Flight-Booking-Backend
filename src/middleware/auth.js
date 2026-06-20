const jwt = require('jsonwebtoken');
const asyncHandler = require('./asyncHandler');
const User = require('../models/User');

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ success: false, error: 'Not authorized, user not found' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, error: 'Account has been deactivated' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Not authorized, token invalid' });
  }
});

module.exports = { protect };
