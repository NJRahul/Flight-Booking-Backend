const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  res.status(403).json({ success: false, error: 'Admin access required' });
};

module.exports = { admin };
