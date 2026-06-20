const express = require('express');
const { protect } = require('../middleware/auth');
const { getSavedSearches, saveSearch, deleteSavedSearch } = require('../controllers/savedSearchController');

const router = express.Router();

router.route('/').get(protect, getSavedSearches).post(protect, saveSearch);
router.route('/:id').delete(protect, deleteSavedSearch);

module.exports = router;
