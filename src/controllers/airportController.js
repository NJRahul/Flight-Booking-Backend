const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const amadeusService = require('../services/amadeusService');

const searchAirports = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 1) return error(res, 400, 'Search query is required');

  const airports = await amadeusService.searchAirports(q.trim());
  success(res, 200, { airports });
});

module.exports = { searchAirports };
