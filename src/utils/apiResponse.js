const success = (res, statusCode = 200, data = null, message = 'Success') => {
  return res.status(statusCode).json({ success: true, message, data });
};

const error = (res, statusCode = 500, message = 'Internal Server Error') => {
  return res.status(statusCode).json({ success: false, error: message });
};

module.exports = { success, error };
