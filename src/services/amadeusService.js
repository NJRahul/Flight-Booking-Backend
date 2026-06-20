const { startOfDay, endOfDay } = require('date-fns');
const Airport = require('../models/Airport');
const Flight = require('../models/Flight');
const logger = require('../utils/logger');

let Amadeus;
let amadeus = null;

try {
  Amadeus = require('amadeus');
  if (process.env.AMADEUS_API_KEY && process.env.AMADEUS_API_SECRET) {
    amadeus = new Amadeus({
      clientId: process.env.AMADEUS_API_KEY,
      clientSecret: process.env.AMADEUS_API_SECRET,
      hostname: process.env.AMADEUS_HOSTNAME || 'test',
    });
  }
} catch (err) {
  logger.warn('Amadeus SDK not available — using MongoDB fallback');
}

const CLASS_MAP = { economy: 'ECONOMY', business: 'BUSINESS', first: 'FIRST' };

function parseDuration(iso) {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  return m ? parseInt(m[1] || 0) * 60 + parseInt(m[2] || 0) : 0;
}

function mapAmadeusOffer(offer, travelClass, adults, children, infants) {
  const itin = offer.itineraries[0];
  const first = itin.segments[0];
  const last = itin.segments[itin.segments.length - 1];
  const baseFare = parseFloat(offer.price.total);
  const totalPrice =
    baseFare * adults + baseFare * 0.75 * children + baseFare * 0.1 * infants;

  return {
    _id: offer.id,
    flightNumber: `${first.carrierCode}${first.number}`,
    airline: { code: first.carrierCode, name: first.carrierCode },
    origin: { code: first.departure.iataCode },
    destination: { code: last.arrival.iataCode },
    departureTime: new Date(first.departure.at),
    arrivalTime: new Date(last.arrival.at),
    duration: parseDuration(itin.duration),
    stops: itin.segments.length - 1,
    seats: {
      [travelClass]: { price: baseFare, available: 9, total: 100 },
    },
    status: 'scheduled',
    totalPrice,
    source: 'amadeus',
  };
}

async function searchFlightsMongo({ origin, destination, departureDate, returnDate, adults, children, infants, travelClass }) {
  const [originAirport, destAirport] = await Promise.all([
    Airport.findOne({ code: origin.toUpperCase() }),
    Airport.findOne({ code: destination.toUpperCase() }),
  ]);

  if (!originAirport || !destAirport) {
    return { outbound: [], return: [] };
  }

  const date = new Date(departureDate);
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const totalPax = adults + children;

  const baseQuery = {
    isActive: true,
    [`seats.${travelClass}.available`]: { $gte: totalPax },
  };

  const calcTotal = (flight) => {
    const base = flight.seats[travelClass]?.price || 0;
    return base * adults + base * 0.75 * children + base * 0.1 * infants;
  };

  const outboundFlights = await Flight.find({
    ...baseQuery,
    origin: originAirport._id,
    destination: destAirport._id,
    departureTime: { $gte: dayStart, $lte: dayEnd },
  })
    .populate('airline')
    .populate('origin')
    .populate('destination')
    .sort({ [`seats.${travelClass}.price`]: 1 })
    .lean();

  let returnFlights = [];
  if (returnDate) {
    const retDate = new Date(returnDate);
    returnFlights = await Flight.find({
      ...baseQuery,
      origin: destAirport._id,
      destination: originAirport._id,
      departureTime: { $gte: startOfDay(retDate), $lte: endOfDay(retDate) },
    })
      .populate('airline')
      .populate('origin')
      .populate('destination')
      .sort({ [`seats.${travelClass}.price`]: 1 })
      .lean();
  }

  return {
    outbound: outboundFlights.map((f) => ({ ...f, stops: 0, totalPrice: calcTotal(f), source: 'mongodb' })),
    return: returnFlights.map((f) => ({ ...f, stops: 0, totalPrice: calcTotal(f), source: 'mongodb' })),
  };
}

async function searchFlights(params) {
  const { origin, destination, departureDate, returnDate, adults = 1, children = 0, infants = 0, travelClass = 'economy', nonStop = false } = params;

  if (amadeus) {
    try {
      const amadeusParams = {
        originLocationCode: origin,
        destinationLocationCode: destination,
        departureDate,
        adults,
        travelClass: CLASS_MAP[travelClass] || 'ECONOMY',
        nonStop,
        currencyCode: 'INR',
        max: 20,
      };
      if (children > 0) amadeusParams.children = children;
      if (infants > 0) amadeusParams.infants = infants;
      if (returnDate) amadeusParams.returnDate = returnDate;

      const response = await amadeus.shopping.flightOffersSearch.get(amadeusParams);
      const allOffers = response.data || [];
      return {
        outbound: allOffers.map((o) => mapAmadeusOffer(o, travelClass, adults, children, infants)),
        return: [],
        source: 'amadeus',
      };
    } catch (err) {
      logger.warn(`Amadeus search failed (${err.message}), falling back to MongoDB`);
    }
  }

  return searchFlightsMongo(params);
}

async function getFlightStatus(flightNumber, date) {
  if (amadeus) {
    try {
      const response = await amadeus.schedule.flights.get({
        carrierCode: flightNumber.slice(0, 2),
        flightNumber: flightNumber.slice(2),
        scheduledDepartureDate: date,
      });
      return response.data?.[0] || null;
    } catch (err) {
      logger.warn(`Amadeus flight status failed: ${err.message}`);
    }
  }
  return Flight.findOne({ flightNumber }).lean();
}

async function searchAirports(query) {
  if (amadeus && query.length >= 2) {
    try {
      const response = await amadeus.referenceData.locations.get({
        keyword: query,
        subType: 'AIRPORT,CITY',
      });
      return (response.data || []).slice(0, 8).map((loc) => ({
        code: loc.iataCode,
        name: loc.name,
        city: loc.address?.cityName || loc.name,
        country: loc.address?.countryName || '',
      }));
    } catch (err) {
      logger.warn(`Amadeus airport search failed: ${err.message}`);
    }
  }

  const airports = await Airport.find({
    $or: [
      { code: { $regex: `^${query}`, $options: 'i' } },
      { name: { $regex: query, $options: 'i' } },
      { city: { $regex: query, $options: 'i' } },
    ],
    isActive: true,
  })
    .sort({ code: 1 })
    .limit(8)
    .lean();

  return airports.map((a) => ({ code: a.code, name: a.name, city: a.city, country: a.country }));
}

module.exports = { searchFlights, getFlightStatus, searchAirports };
