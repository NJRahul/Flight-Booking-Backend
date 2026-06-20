const { v4: uuidv4 } = require('uuid');
const asyncHandler = require('../middleware/asyncHandler');
const { success, error } = require('../utils/apiResponse');
const Flight = require('../models/Flight');
const Airline = require('../models/Airline');
const Booking = require('../models/Booking');
const amadeusService = require('../services/amadeusService');
const logger = require('../utils/logger');

async function generateSeatMap(flightId, seatClass) {
  const bookings = await Booking.find({
    flight: flightId,
    class: seatClass,
    status: { $in: ['confirmed', 'completed'] },
  }).lean();

  const occupied = new Set(
    bookings.flatMap((b) => b.passengers.map((p) => p.seatNumber).filter(Boolean))
  );

  const seats = [];
  if (seatClass === 'economy') {
    const cols = ['A', 'B', 'C', 'D', 'E', 'F'];
    for (let row = 1; row <= 30; row++) {
      for (const col of cols) {
        const id = `${row}${col}`;
        const isExit = row === 12 || row === 13;
        seats.push({
          seat: id, row, column: col,
          isOccupied: occupied.has(id),
          isExitRow: isExit,
          isExtraLegroom: isExit || row === 1,
          type: col === 'A' || col === 'F' ? 'window' : col === 'C' || col === 'D' ? 'aisle' : 'middle',
        });
      }
    }
  } else if (seatClass === 'business') {
    for (let row = 1; row <= 5; row++) {
      for (const col of ['A', 'B', 'C', 'D']) {
        const id = `${row}${col}`;
        seats.push({ seat: id, row, column: col, isOccupied: occupied.has(id), isExitRow: false, isExtraLegroom: true, type: col === 'A' || col === 'D' ? 'window' : 'aisle' });
      }
    }
  } else if (seatClass === 'first') {
    for (let row = 1; row <= 3; row++) {
      for (const col of ['A', 'C', 'F']) {
        const id = `${row}${col}`;
        seats.push({ seat: id, row, column: col, isOccupied: occupied.has(id), isExitRow: false, isExtraLegroom: true, type: 'window' });
      }
    }
  }
  return seats;
}

const searchFlights = asyncHandler(async (req, res) => {
  const {
    from, to, departureDate, returnDate,
    adults = '1', children = '0', infants = '0',
    class: travelClass = 'economy',
    tripType = 'one-way',
    nonStop = 'false',
  } = req.query;

  if (!from || !to) return error(res, 400, 'Origin and destination are required');
  if (from.toUpperCase() === to.toUpperCase()) return error(res, 400, 'Origin and destination must be different');
  if (!departureDate) return error(res, 400, 'Departure date is required');

  const depDate = new Date(departureDate);
  if (isNaN(depDate.getTime())) return error(res, 400, 'Invalid departure date');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (depDate < today) return error(res, 400, 'Departure date cannot be in the past');

  const adultsInt = Math.max(1, parseInt(adults) || 1);
  if (adultsInt < 1) return error(res, 400, 'At least 1 adult is required');

  if (tripType === 'round-trip') {
    if (!returnDate) return error(res, 400, 'Return date is required for round-trip');
    if (new Date(returnDate) <= depDate) return error(res, 400, 'Return date must be after departure date');
  }

  const results = await amadeusService.searchFlights({
    origin: from,
    destination: to,
    departureDate,
    returnDate: tripType === 'round-trip' ? returnDate : undefined,
    adults: adultsInt,
    children: parseInt(children) || 0,
    infants: parseInt(infants) || 0,
    travelClass,
    nonStop: nonStop === 'true',
  });

  // Increment view count on searched flights (fire-and-forget, strict schema strips unknown fields)
  const ids = results.outbound.map((f) => f._id).filter(Boolean);
  if (ids.length) {
    Flight.updateMany({ _id: { $in: ids } }, { $inc: { viewCount: 1 } }).catch(() => {});
  }

  success(res, 200, {
    outbound: results.outbound,
    return: results.return || [],
    searchId: uuidv4(),
    searchParams: { from, to, departureDate, returnDate, adults: adultsInt, children: parseInt(children) || 0, infants: parseInt(infants) || 0, class: travelClass, tripType },
    source: results.source,
  });
});

const getFlightById = asyncHandler(async (req, res) => {
  const flight = await Flight.findById(req.params.id)
    .populate('airline')
    .populate('origin')
    .populate('destination');

  if (!flight) return error(res, 404, 'Flight not found');

  Flight.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } }).catch(() => {});

  const seatClass = req.query.class || 'economy';
  const seatMap = await generateSeatMap(req.params.id, seatClass);

  success(res, 200, { flight, seatMap });
});

const getSeatMap = asyncHandler(async (req, res) => {
  const flight = await Flight.findById(req.params.id).lean();
  if (!flight) return error(res, 404, 'Flight not found');

  const seatClass = req.query.class || 'economy';
  const seatMap = await generateSeatMap(req.params.id, seatClass);
  success(res, 200, { seatMap });
});

const getAirlines = asyncHandler(async (req, res) => {
  const airlines = await Airline.find({ isActive: true }).sort({ name: 1 }).lean();
  success(res, 200, { airlines });
});

module.exports = { searchFlights, getFlightById, getSeatMap, getAirlines };
