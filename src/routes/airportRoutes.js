const express = require('express');
const router = express.Router();
const { generalLimiter } = require('../middleware/rateLimiter');
const { searchAirports } = require('../controllers/airportController');

router.use(generalLimiter);
router.get('/search', searchAirports);

module.exports = router;
