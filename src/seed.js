require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Airport = require('./models/Airport');
const Airline = require('./models/Airline');
const Flight = require('./models/Flight');
const Booking = require('./models/Booking');
const Notification = require('./models/Notification');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/flight_booking';

// ── Airports ────────────────────────────────────────────────────────────────

const AIRPORTS = [
  { code: 'DEL', name: 'Indira Gandhi International Airport', city: 'New Delhi', country: 'India', countryCode: 'IN', timezone: 'Asia/Kolkata', terminals: 3, location: { type: 'Point', coordinates: [77.1025, 28.5665] } },
  { code: 'BOM', name: 'Chhatrapati Shivaji Maharaj International Airport', city: 'Mumbai', country: 'India', countryCode: 'IN', timezone: 'Asia/Kolkata', terminals: 2, location: { type: 'Point', coordinates: [72.8777, 19.0896] } },
  { code: 'BLR', name: 'Kempegowda International Airport', city: 'Bengaluru', country: 'India', countryCode: 'IN', timezone: 'Asia/Kolkata', terminals: 2, location: { type: 'Point', coordinates: [77.7063, 13.1986] } },
  { code: 'MAA', name: 'Chennai International Airport', city: 'Chennai', country: 'India', countryCode: 'IN', timezone: 'Asia/Kolkata', terminals: 2, location: { type: 'Point', coordinates: [80.1720, 12.9941] } },
  { code: 'CCU', name: 'Netaji Subhas Chandra Bose International Airport', city: 'Kolkata', country: 'India', countryCode: 'IN', timezone: 'Asia/Kolkata', terminals: 2, location: { type: 'Point', coordinates: [88.4467, 22.6547] } },
  { code: 'HYD', name: 'Rajiv Gandhi International Airport', city: 'Hyderabad', country: 'India', countryCode: 'IN', timezone: 'Asia/Kolkata', terminals: 1, location: { type: 'Point', coordinates: [78.4298, 17.2403] } },
  { code: 'AMD', name: 'Sardar Vallabhbhai Patel International Airport', city: 'Ahmedabad', country: 'India', countryCode: 'IN', timezone: 'Asia/Kolkata', terminals: 1, location: { type: 'Point', coordinates: [72.6347, 23.0772] } },
  { code: 'PNQ', name: 'Pune Airport', city: 'Pune', country: 'India', countryCode: 'IN', timezone: 'Asia/Kolkata', terminals: 1, location: { type: 'Point', coordinates: [73.9197, 18.5822] } },
  { code: 'GOI', name: 'Goa International Airport', city: 'Goa', country: 'India', countryCode: 'IN', timezone: 'Asia/Kolkata', terminals: 1, location: { type: 'Point', coordinates: [73.8314, 15.3808] } },
  { code: 'COK', name: 'Cochin International Airport', city: 'Kochi', country: 'India', countryCode: 'IN', timezone: 'Asia/Kolkata', terminals: 2, location: { type: 'Point', coordinates: [76.4019, 10.1520] } },
  { code: 'JAI', name: 'Jaipur International Airport', city: 'Jaipur', country: 'India', countryCode: 'IN', timezone: 'Asia/Kolkata', terminals: 1, location: { type: 'Point', coordinates: [75.8122, 26.8242] } },
  { code: 'LKO', name: 'Chaudhary Charan Singh International Airport', city: 'Lucknow', country: 'India', countryCode: 'IN', timezone: 'Asia/Kolkata', terminals: 1, location: { type: 'Point', coordinates: [80.8893, 26.7606] } },
  { code: 'NAG', name: 'Dr. Babasaheb Ambedkar International Airport', city: 'Nagpur', country: 'India', countryCode: 'IN', timezone: 'Asia/Kolkata', terminals: 1, location: { type: 'Point', coordinates: [79.0472, 21.0922] } },
  { code: 'SXR', name: 'Sheikh ul-Alam International Airport', city: 'Srinagar', country: 'India', countryCode: 'IN', timezone: 'Asia/Kolkata', terminals: 1, location: { type: 'Point', coordinates: [74.7742, 33.9871] } },
  { code: 'PAT', name: 'Jay Prakash Narayan International Airport', city: 'Patna', country: 'India', countryCode: 'IN', timezone: 'Asia/Kolkata', terminals: 1, location: { type: 'Point', coordinates: [85.0878, 25.5913] } },
  { code: 'DXB', name: 'Dubai International Airport', city: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE', timezone: 'Asia/Dubai', terminals: 3, location: { type: 'Point', coordinates: [55.3644, 25.2532] } },
  { code: 'SIN', name: 'Singapore Changi Airport', city: 'Singapore', country: 'Singapore', countryCode: 'SG', timezone: 'Asia/Singapore', terminals: 4, location: { type: 'Point', coordinates: [103.9894, 1.3644] } },
  { code: 'BKK', name: 'Suvarnabhumi Airport', city: 'Bangkok', country: 'Thailand', countryCode: 'TH', timezone: 'Asia/Bangkok', terminals: 1, location: { type: 'Point', coordinates: [100.7501, 13.6900] } },
  { code: 'KUL', name: 'Kuala Lumpur International Airport', city: 'Kuala Lumpur', country: 'Malaysia', countryCode: 'MY', timezone: 'Asia/Kuala_Lumpur', terminals: 2, location: { type: 'Point', coordinates: [101.7015, 2.7456] } },
  { code: 'HKG', name: 'Hong Kong International Airport', city: 'Hong Kong', country: 'Hong Kong', countryCode: 'HK', timezone: 'Asia/Hong_Kong', terminals: 2, location: { type: 'Point', coordinates: [113.9145, 22.3080] } },
  { code: 'LHR', name: 'London Heathrow Airport', city: 'London', country: 'United Kingdom', countryCode: 'GB', timezone: 'Europe/London', terminals: 5, location: { type: 'Point', coordinates: [-0.4543, 51.4700] } },
  { code: 'CDG', name: 'Paris Charles de Gaulle Airport', city: 'Paris', country: 'France', countryCode: 'FR', timezone: 'Europe/Paris', terminals: 3, location: { type: 'Point', coordinates: [2.5479, 49.0097] } },
  { code: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', country: 'Germany', countryCode: 'DE', timezone: 'Europe/Berlin', terminals: 2, location: { type: 'Point', coordinates: [8.5622, 50.0379] } },
  { code: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', country: 'United States', countryCode: 'US', timezone: 'America/New_York', terminals: 6, location: { type: 'Point', coordinates: [-73.7781, 40.6413] } },
  { code: 'NRT', name: 'Narita International Airport', city: 'Tokyo', country: 'Japan', countryCode: 'JP', timezone: 'Asia/Tokyo', terminals: 3, location: { type: 'Point', coordinates: [140.3929, 35.7647] } },
  { code: 'SYD', name: 'Sydney Kingsford Smith Airport', city: 'Sydney', country: 'Australia', countryCode: 'AU', timezone: 'Australia/Sydney', terminals: 3, location: { type: 'Point', coordinates: [151.1772, -33.9399] } },
  { code: 'ICN', name: 'Incheon International Airport', city: 'Seoul', country: 'South Korea', countryCode: 'KR', timezone: 'Asia/Seoul', terminals: 2, location: { type: 'Point', coordinates: [126.4407, 37.4602] } },
  { code: 'DOH', name: 'Hamad International Airport', city: 'Doha', country: 'Qatar', countryCode: 'QA', timezone: 'Asia/Qatar', terminals: 1, location: { type: 'Point', coordinates: [51.6138, 25.2731] } },
  { code: 'AUH', name: 'Abu Dhabi International Airport', city: 'Abu Dhabi', country: 'United Arab Emirates', countryCode: 'AE', timezone: 'Asia/Dubai', terminals: 3, location: { type: 'Point', coordinates: [54.6511, 24.4330] } },
  { code: 'ZRH', name: 'Zurich Airport', city: 'Zurich', country: 'Switzerland', countryCode: 'CH', timezone: 'Europe/Zurich', terminals: 1, location: { type: 'Point', coordinates: [8.5491, 47.4647] } },
];

// ── Airlines ─────────────────────────────────────────────────────────────────

const AIRLINES = [
  { code: 'AI', name: 'Air India', country: 'India', fleetSize: 180, rating: 3.8, baggage: { cabin: 8, checked: 25 } },
  { code: '6E', name: 'IndiGo', country: 'India', fleetSize: 330, rating: 4.0, baggage: { cabin: 7, checked: 20 } },
  { code: 'SG', name: 'SpiceJet', country: 'India', fleetSize: 90, rating: 3.6, baggage: { cabin: 7, checked: 20 } },
  { code: 'UK', name: 'Vistara', country: 'India', fleetSize: 70, rating: 4.4, baggage: { cabin: 7, checked: 20 } },
  { code: 'G8', name: 'Go First', country: 'India', fleetSize: 60, rating: 3.5, baggage: { cabin: 7, checked: 20 } },
  { code: 'EK', name: 'Emirates', country: 'United Arab Emirates', fleetSize: 270, rating: 4.8, baggage: { cabin: 7, checked: 30 } },
  { code: 'SQ', name: 'Singapore Airlines', country: 'Singapore', fleetSize: 140, rating: 4.9, baggage: { cabin: 7, checked: 30 } },
  { code: 'QR', name: 'Qatar Airways', country: 'Qatar', fleetSize: 250, rating: 4.8, baggage: { cabin: 7, checked: 30 } },
  { code: 'BA', name: 'British Airways', country: 'United Kingdom', fleetSize: 290, rating: 4.2, baggage: { cabin: 12, checked: 23 } },
  { code: 'LH', name: 'Lufthansa', country: 'Germany', fleetSize: 300, rating: 4.3, baggage: { cabin: 8, checked: 23 } },
];

// ── Flight generator ──────────────────────────────────────────────────────────

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const DOMESTIC_PAIRS = [
  ['DEL', 'BOM'], ['DEL', 'BLR'], ['DEL', 'MAA'], ['DEL', 'HYD'], ['DEL', 'CCU'],
  ['BOM', 'BLR'], ['BOM', 'MAA'], ['BOM', 'HYD'], ['BOM', 'COK'], ['BOM', 'GOI'],
  ['BLR', 'MAA'], ['BLR', 'HYD'], ['BLR', 'CCU'], ['BLR', 'COK'], ['HYD', 'MAA'],
  ['DEL', 'AMD'], ['DEL', 'JAI'], ['DEL', 'LKO'], ['DEL', 'SXR'], ['BOM', 'PNQ'],
];

const INTL_PAIRS = [
  ['DEL', 'DXB'], ['DEL', 'SIN'], ['DEL', 'LHR'], ['DEL', 'NRT'], ['DEL', 'JFK'],
  ['BOM', 'DXB'], ['BOM', 'SIN'], ['BOM', 'LHR'], ['BOM', 'DOH'], ['BOM', 'KUL'],
  ['BLR', 'SIN'], ['BLR', 'DXB'], ['BLR', 'FRA'], ['MAA', 'SIN'], ['CCU', 'BKK'],
];

const AIRCRAFT_TYPES = ['Airbus A320', 'Airbus A321', 'Boeing 737', 'Airbus A380', 'Boeing 777', 'Boeing 787'];

// Build both directions for domestic, keep single direction for international
const DOMESTIC_PAIRS_BOTH = [
  ...DOMESTIC_PAIRS,
  ...DOMESTIC_PAIRS.map(([a, b]) => [b, a]),
];

function makeFlight(airportMap, airlineMap, originCode, destCode, isIntl, daysAhead, departureHour) {
  const domesticAirlines = ['AI', '6E', 'SG', 'UK', 'G8'];
  const allAirlineCodes = AIRLINES.map((a) => a.code);

  const airlineCodes = isIntl ? allAirlineCodes : domesticAirlines;
  const airlineCode = pick(airlineCodes);
  const airline = airlineMap[airlineCode];
  const origin = airportMap[originCode];
  const destination = airportMap[destCode];
  if (!airline || !origin || !destination) return null;

  const now = new Date();
  const departure = addHours(addDays(now, daysAhead), departureHour);
  departure.setMinutes(pick([0, 15, 30, 45]));
  departure.setSeconds(0);
  departure.setMilliseconds(0);

  const durationMinutes = isIntl ? randInt(180, 960) : randInt(60, 180);
  const arrival = new Date(departure.getTime() + durationMinutes * 60000);

  const ecoPrice = isIntl ? randInt(8000, 35000) : randInt(2500, 8000);

  return {
    flightNumber: `${airlineCode}${randInt(100, 999)}`,
    airline: airline._id,
    origin: origin._id,
    destination: destination._id,
    departureTime: departure,
    arrivalTime: arrival,
    duration: durationMinutes,
    aircraft: { type: pick(AIRCRAFT_TYPES), registration: `VT-${String.fromCharCode(65 + randInt(0, 25))}${String.fromCharCode(65 + randInt(0, 25))}${String.fromCharCode(65 + randInt(0, 25))}` },
    seats: {
      economy: { total: 180, available: randInt(10, 180), price: ecoPrice },
      business: { total: 24, available: randInt(0, 24), price: Math.round(ecoPrice * 2.8) },
      first: { total: 8, available: randInt(0, 8), price: Math.round(ecoPrice * 5.5) },
    },
    status: 'scheduled',
    terminal: pick(['1', '2', '3', 'T1', 'T2', 'T3']),
    gate: `${String.fromCharCode(65 + randInt(0, 5))}${randInt(1, 30)}`,
    baggage: airline.baggage,
    amenities: {
      wifi: isIntl || Math.random() > 0.5,
      meals: isIntl || airlineCode === 'AI' || airlineCode === 'UK',
      entertainment: isIntl,
      usb: true,
    },
  };
}

// Generate flights systematically: every route gets 3 departures per day for the next 30 days
function generateFlights(airportMap, airlineMap) {
  const flights = [];
  const DAYS = 30;
  const DEPARTURE_HOURS_DOMESTIC = [6, 12, 18];
  const DEPARTURE_HOURS_INTL = [2, 14];

  for (const [originCode, destCode] of DOMESTIC_PAIRS_BOTH) {
    for (let day = 1; day <= DAYS; day++) {
      for (const hour of DEPARTURE_HOURS_DOMESTIC) {
        const f = makeFlight(airportMap, airlineMap, originCode, destCode, false, day, hour);
        if (f) flights.push(f);
      }
    }
  }

  for (const [originCode, destCode] of INTL_PAIRS) {
    for (let day = 1; day <= DAYS; day++) {
      for (const hour of DEPARTURE_HOURS_INTL) {
        const f = makeFlight(airportMap, airlineMap, originCode, destCode, true, day, hour);
        if (f) flights.push(f);
      }
    }
  }

  return flights;
}

// ── Main seed ─────────────────────────────────────────────────────────────────

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    // Drop collections so stale indexes are removed too
    const db = mongoose.connection.db;
    const existingCollections = (await db.listCollections().toArray()).map((c) => c.name);
    const toDrop = ['users', 'airports', 'airlines', 'flights', 'bookings', 'notifications', 'reviews'];
    await Promise.all(
      toDrop.filter((c) => existingCollections.includes(c)).map((c) => db.dropCollection(c))
    );
    console.log('Collections dropped');

    // ── Users ──
    const [admin, alice, bob] = await Promise.all([
      User.create({
        name: 'Admin User',
        email: 'admin@flightbook.com',
        password: 'Admin@1234',
        role: 'admin',
        phone: '+919999999999',
        isEmailVerified: true,
        nationality: 'Indian',
      }),
      User.create({
        name: 'Alice Johnson',
        email: 'alice@example.com',
        password: 'Alice@1234',
        phone: '+919876543210',
        isEmailVerified: true,
        nationality: 'Indian',
        dateOfBirth: new Date('1990-05-14'),
        gender: 'female',
        preferences: { seatClass: 'economy', seatPosition: 'window', mealPreference: 'vegetarian', notificationEmail: true },
      }),
      User.create({
        name: 'Bob Smith',
        email: 'bob@example.com',
        password: 'Bob@12345',
        phone: '+919876500000',
        isEmailVerified: false,
        nationality: 'Indian',
        dateOfBirth: new Date('1985-11-23'),
        gender: 'male',
        preferences: { seatClass: 'business', seatPosition: 'aisle', notificationEmail: true, notificationSMS: true },
      }),
    ]);
    console.log(`✅ Seeded: 3 users`);

    // ── Airports ──
    const airportDocs = await Airport.insertMany(AIRPORTS);
    const airportMap = {};
    airportDocs.forEach((a) => { airportMap[a.code] = a; });
    console.log(`✅ Seeded: ${airportDocs.length} airports`);

    // ── Airlines ──
    const airlineDocs = await Airline.insertMany(AIRLINES);
    const airlineMap = {};
    airlineDocs.forEach((a) => { airlineMap[a.code] = a; });
    console.log(`✅ Seeded: ${airlineDocs.length} airlines`);

    // ── Flights ──
    const flightData = generateFlights(airportMap, airlineMap);
    const flightDocs = await Flight.insertMany(flightData);
    console.log(`✅ Seeded: ${flightDocs.length} flights`);

    // ── Bookings ──
    const bookingUsers = [alice, bob];
    const bookingFlights = flightDocs.slice(0, 10);

    const bookingPayloads = [
      {
        user: alice._id,
        flight: bookingFlights[0]._id,
        tripType: 'one-way',
        class: 'economy',
        passengers: [
          { type: 'adult', firstName: 'Alice', lastName: 'Johnson', dateOfBirth: new Date('1990-05-14'), gender: 'female', passportNumber: 'A1234567', nationality: 'Indian', seatNumber: '14A', mealPreference: 'vegetarian' },
        ],
        contactInfo: { email: alice.email, phone: '+919876543210' },
        pricing: { basePrice: 4500, taxes: 810, fees: 200, extras: 0, discount: 0, totalAmount: 5510, currency: 'INR' },
        payment: { status: 'completed', method: 'card', transactionId: 'TXN' + Date.now() + '1', paidAt: new Date() },
        status: 'confirmed',
      },
      {
        user: alice._id,
        flight: bookingFlights[1]._id,
        returnFlight: bookingFlights[2]._id,
        tripType: 'round-trip',
        class: 'business',
        passengers: [
          { type: 'adult', firstName: 'Alice', lastName: 'Johnson', dateOfBirth: new Date('1990-05-14'), gender: 'female', seatNumber: '3C', mealPreference: 'vegetarian' },
        ],
        contactInfo: { email: alice.email, phone: '+919876543210' },
        pricing: { basePrice: 18000, taxes: 3240, fees: 500, extras: 800, discount: 1000, totalAmount: 21540, currency: 'INR' },
        payment: { status: 'completed', method: 'upi', transactionId: 'TXN' + Date.now() + '2', paidAt: new Date() },
        status: 'confirmed',
      },
      {
        user: bob._id,
        flight: bookingFlights[3]._id,
        tripType: 'one-way',
        class: 'economy',
        passengers: [
          { type: 'adult', firstName: 'Bob', lastName: 'Smith', dateOfBirth: new Date('1985-11-23'), gender: 'male', seatNumber: '22B', mealPreference: 'standard' },
          { type: 'adult', firstName: 'Carol', lastName: 'Smith', dateOfBirth: new Date('1988-03-10'), gender: 'female', seatNumber: '22C', mealPreference: 'standard' },
        ],
        contactInfo: { email: bob.email, phone: '+919876500000' },
        pricing: { basePrice: 9000, taxes: 1620, fees: 400, extras: 500, discount: 0, totalAmount: 11520, currency: 'INR' },
        payment: { status: 'completed', method: 'netbanking', transactionId: 'TXN' + Date.now() + '3', paidAt: new Date() },
        status: 'confirmed',
        extras: { extraBaggage: true, travelInsurance: false, mealUpgrade: false },
      },
      {
        user: bob._id,
        flight: bookingFlights[4]._id,
        tripType: 'one-way',
        class: 'economy',
        passengers: [
          { type: 'adult', firstName: 'Bob', lastName: 'Smith', dateOfBirth: new Date('1985-11-23'), gender: 'male', seatNumber: '8D' },
        ],
        contactInfo: { email: bob.email, phone: '+919876500000' },
        pricing: { basePrice: 3200, taxes: 576, fees: 200, extras: 0, discount: 0, totalAmount: 3976, currency: 'INR' },
        payment: { status: 'pending', method: 'card' },
        status: 'pending',
      },
      {
        user: alice._id,
        flight: bookingFlights[5]._id,
        tripType: 'one-way',
        class: 'economy',
        passengers: [
          { type: 'adult', firstName: 'Alice', lastName: 'Johnson', gender: 'female', seatNumber: '31F' },
        ],
        contactInfo: { email: alice.email, phone: '+919876543210' },
        pricing: { basePrice: 2800, taxes: 504, fees: 200, extras: 0, discount: 500, totalAmount: 3004, currency: 'INR' },
        payment: { status: 'refunded', method: 'card', transactionId: 'TXN' + Date.now() + '5', paidAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), refundAmount: 2703, refundedAt: new Date() },
        status: 'cancelled',
        cancellation: { cancelledAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), reason: 'Change of plans', cancelledBy: 'user', refundStatus: 'processed' },
      },
    ];

    const bookingDocs = await Booking.create(bookingPayloads);
    console.log(`✅ Seeded: ${bookingDocs.length} bookings`);

    // ── Notifications ──
    const notifPayloads = [
      { user: alice._id, type: 'booking_confirmed', title: 'Booking Confirmed!', message: `Your booking ${bookingDocs[0].bookingReference} has been confirmed.`, data: { bookingId: bookingDocs[0]._id }, priority: 'high' },
      { user: alice._id, type: 'booking_confirmed', title: 'Booking Confirmed!', message: `Your round-trip booking ${bookingDocs[1].bookingReference} has been confirmed.`, data: { bookingId: bookingDocs[1]._id }, priority: 'high' },
      { user: bob._id, type: 'booking_confirmed', title: 'Booking Confirmed!', message: `Your booking ${bookingDocs[2].bookingReference} has been confirmed.`, data: { bookingId: bookingDocs[2]._id }, priority: 'high' },
      { user: bob._id, type: 'general', title: 'Complete your booking', message: 'You have a pending booking awaiting payment. Complete it before it expires.', data: { bookingId: bookingDocs[3]._id }, priority: 'medium', isRead: false },
      { user: alice._id, type: 'refund_processed', title: 'Refund Processed', message: `A refund of ₹2,703 has been processed for booking ${bookingDocs[4].bookingReference}.`, data: { bookingId: bookingDocs[4]._id }, priority: 'medium', isRead: true, readAt: new Date() },
      { user: alice._id, type: 'price_drop', title: 'Price Drop Alert!', message: 'Prices have dropped on your saved DEL → BOM route. Book now!', data: { route: 'DEL-BOM' }, priority: 'low' },
      { user: bob._id, type: 'check_in_reminder', title: 'Check-in Opens Soon', message: `Online check-in for your flight opens in 24 hours.`, data: { bookingId: bookingDocs[2]._id }, priority: 'medium' },
    ];

    await Notification.insertMany(notifPayloads);
    console.log(`✅ Seeded: ${notifPayloads.length} notifications`);

    console.log('\n🎉 Database seeded successfully!');
    console.log('─────────────────────────────────');
    console.log(`  Users      : 3`);
    console.log(`  Airports   : ${airportDocs.length}`);
    console.log(`  Airlines   : ${airlineDocs.length}`);
    console.log(`  Flights    : ${flightDocs.length}`);
    console.log(`  Bookings   : ${bookingDocs.length}`);
    console.log(`  Notifs     : ${notifPayloads.length}`);
    console.log('─────────────────────────────────');
    console.log('\nTest credentials:');
    console.log('  admin@flightbook.com  / Admin@1234  (admin)');
    console.log('  alice@example.com     / Alice@1234  (user)');
    console.log('  bob@example.com       / Bob@12345   (user)');

  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

seed();
