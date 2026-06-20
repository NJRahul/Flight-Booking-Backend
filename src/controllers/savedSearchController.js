const asyncHandler = require('../middleware/asyncHandler');
const SavedSearch = require('../models/SavedSearch');
const { success, error } = require('../utils/apiResponse');

const MAX_SAVED = 20;

const getSavedSearches = asyncHandler(async (req, res) => {
  const searches = await SavedSearch.find({ user: req.user._id }).sort({ createdAt: -1 });
  success(res, 200, { savedSearches: searches });
});

const saveSearch = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const count = await SavedSearch.countDocuments({ user: userId });
  if (count >= MAX_SAVED) {
    return error(res, 400, `You can save up to ${MAX_SAVED} searches. Please delete some to add new ones.`);
  }

  const { from, to, departureDate, class: seatClass } = req.body;

  const existing = await SavedSearch.findOne({ user: userId, from, to, departureDate, class: seatClass });
  if (existing) {
    return success(res, 200, { savedSearch: existing }, 'Search already saved');
  }

  const saved = await SavedSearch.create({ user: userId, ...req.body });
  success(res, 201, { savedSearch: saved }, 'Search saved');
});

const deleteSavedSearch = asyncHandler(async (req, res) => {
  const doc = await SavedSearch.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!doc) return error(res, 404, 'Saved search not found');
  success(res, 200, null, 'Saved search deleted');
});

module.exports = { getSavedSearches, saveSearch, deleteSavedSearch };
