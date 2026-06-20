const express = require('express');
const router = express.Router();
const { generalLimiter } = require('../middleware/rateLimiter');
const { searchFlights, getFlightById, getSeatMap, getAirlines } = require('../controllers/flightController');

router.use(generalLimiter);

router.get('/search', searchFlights);
router.get('/airlines', getAirlines);
router.get('/:id/seats', getSeatMap);
router.get('/:id', getFlightById);

module.exports = router;
