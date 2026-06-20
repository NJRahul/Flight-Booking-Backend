const { v4: uuidv4 } = require('uuid');
const { addMinutes, addDays } = require('date-fns');

const MOCK_AIRPORTS = [
  { iataCode: 'DEL', name: 'Indira Gandhi International Airport', city: 'New Delhi', country: 'India', timezone: 'Asia/Kolkata', coordinates: { lat: 28.5562, lng: 77.1000 } },
  { iataCode: 'BOM', name: 'Chhatrapati Shivaji Maharaj International Airport', city: 'Mumbai', country: 'India', timezone: 'Asia/Kolkata', coordinates: { lat: 19.0896, lng: 72.8656 } },
  { iataCode: 'MAA', name: 'Chennai International Airport', city: 'Chennai', country: 'India', timezone: 'Asia/Kolkata', coordinates: { lat: 12.9941, lng: 80.1709 } },
  { iataCode: 'BLR', name: 'Kempegowda International Airport', city: 'Bengaluru', country: 'India', timezone: 'Asia/Kolkata', coordinates: { lat: 13.1986, lng: 77.7066 } },
  { iataCode: 'HYD', name: 'Rajiv Gandhi International Airport', city: 'Hyderabad', country: 'India', timezone: 'Asia/Kolkata', coordinates: { lat: 17.2403, lng: 78.4294 } },
  { iataCode: 'CCU', name: 'Netaji Subhas Chandra Bose International Airport', city: 'Kolkata', country: 'India', timezone: 'Asia/Kolkata', coordinates: { lat: 22.6547, lng: 88.4467 } },
  { iataCode: 'GOI', name: 'Goa International Airport', city: 'Goa', country: 'India', timezone: 'Asia/Kolkata', coordinates: { lat: 15.3808, lng: 73.8314 } },
  { iataCode: 'AMD', name: 'Sardar Vallabhbhai Patel International Airport', city: 'Ahmedabad', country: 'India', timezone: 'Asia/Kolkata', coordinates: { lat: 23.0777, lng: 72.6347 } },
  { iataCode: 'PNQ', name: 'Pune Airport', city: 'Pune', country: 'India', timezone: 'Asia/Kolkata', coordinates: { lat: 18.5821, lng: 73.9197 } },
  { iataCode: 'COK', name: 'Cochin International Airport', city: 'Kochi', country: 'India', timezone: 'Asia/Kolkata', coordinates: { lat: 10.1520, lng: 76.4019 } },
  { iataCode: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', country: 'USA', timezone: 'America/New_York', coordinates: { lat: 40.6413, lng: -73.7781 } },
  { iataCode: 'LHR', name: 'Heathrow Airport', city: 'London', country: 'UK', timezone: 'Europe/London', coordinates: { lat: 51.4700, lng: -0.4543 } },
  { iataCode: 'DXB', name: 'Dubai International Airport', city: 'Dubai', country: 'UAE', timezone: 'Asia/Dubai', coordinates: { lat: 25.2532, lng: 55.3657 } },
  { iataCode: 'SIN', name: 'Singapore Changi Airport', city: 'Singapore', country: 'Singapore', timezone: 'Asia/Singapore', coordinates: { lat: 1.3644, lng: 103.9915 } },
  { iataCode: 'BKK', name: 'Suvarnabhumi Airport', city: 'Bangkok', country: 'Thailand', timezone: 'Asia/Bangkok', coordinates: { lat: 13.6900, lng: 100.7501 } },
  { iataCode: 'KUL', name: 'Kuala Lumpur International Airport', city: 'Kuala Lumpur', country: 'Malaysia', timezone: 'Asia/Kuala_Lumpur', coordinates: { lat: 2.7456, lng: 101.7099 } },
  { iataCode: 'HKG', name: 'Hong Kong International Airport', city: 'Hong Kong', country: 'China', timezone: 'Asia/Hong_Kong', coordinates: { lat: 22.3080, lng: 113.9185 } },
  { iataCode: 'CDG', name: 'Charles de Gaulle Airport', city: 'Paris', country: 'France', timezone: 'Europe/Paris', coordinates: { lat: 49.0097, lng: 2.5479 } },
  { iataCode: 'FRA', name: 'Frankfurt Airport', city: 'Frankfurt', country: 'Germany', timezone: 'Europe/Berlin', coordinates: { lat: 50.0379, lng: 8.5622 } },
  { iataCode: 'AMS', name: 'Amsterdam Airport Schiphol', city: 'Amsterdam', country: 'Netherlands', timezone: 'Europe/Amsterdam', coordinates: { lat: 52.3086, lng: 4.7639 } },
  { iataCode: 'NRT', name: 'Narita International Airport', city: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo', coordinates: { lat: 35.7653, lng: 140.3862 } },
  { iataCode: 'SYD', name: 'Sydney Kingsford Smith Airport', city: 'Sydney', country: 'Australia', timezone: 'Australia/Sydney', coordinates: { lat: -33.9461, lng: 151.1772 } },
  { iataCode: 'DOH', name: 'Hamad International Airport', city: 'Doha', country: 'Qatar', timezone: 'Asia/Qatar', coordinates: { lat: 25.2731, lng: 51.6082 } },
  { iataCode: 'AUH', name: 'Abu Dhabi International Airport', city: 'Abu Dhabi', country: 'UAE', timezone: 'Asia/Dubai', coordinates: { lat: 24.4330, lng: 54.6511 } },
  { iataCode: 'ORD', name: "O'Hare International Airport", city: 'Chicago', country: 'USA', timezone: 'America/Chicago', coordinates: { lat: 41.9742, lng: -87.9073 } },
  { iataCode: 'LAX', name: 'Los Angeles International Airport', city: 'Los Angeles', country: 'USA', timezone: 'America/Los_Angeles', coordinates: { lat: 33.9425, lng: -118.4081 } },
  { iataCode: 'DEN', name: 'Denver International Airport', city: 'Denver', country: 'USA', timezone: 'America/Denver', coordinates: { lat: 39.8561, lng: -104.6737 } },
  { iataCode: 'YYZ', name: 'Toronto Pearson International Airport', city: 'Toronto', country: 'Canada', timezone: 'America/Toronto', coordinates: { lat: 43.6777, lng: -79.6248 } },
  { iataCode: 'MEX', name: 'Benito Juárez International Airport', city: 'Mexico City', country: 'Mexico', timezone: 'America/Mexico_City', coordinates: { lat: 19.4363, lng: -99.0721 } },
  { iataCode: 'GRU', name: 'São Paulo/Guarulhos International Airport', city: 'São Paulo', country: 'Brazil', timezone: 'America/Sao_Paulo', coordinates: { lat: -23.4356, lng: -46.4731 } },
];

const MOCK_AIRLINES = [
  { code: '6E', name: 'IndiGo', logoColor: '#2B3A8C' },
  { code: 'AI', name: 'Air India', logoColor: '#E31837' },
  { code: 'EK', name: 'Emirates', logoColor: '#D71921' },
  { code: 'BA', name: 'British Airways', logoColor: '#075AAA' },
  { code: 'SQ', name: 'Singapore Airlines', logoColor: '#003087' },
  { code: 'LH', name: 'Lufthansa', logoColor: '#05164D' },
  { code: 'QR', name: 'Qatar Airways', logoColor: '#5C0631' },
  { code: 'UK', name: 'Vistara', logoColor: '#7B2C8B' },
  { code: 'SG', name: 'SpiceJet', logoColor: '#E8312F' },
  { code: 'G8', name: 'GoFirst', logoColor: '#FF6600' },
];

const AIRCRAFT_TYPES = ['Boeing 737', 'Airbus A320', 'Boeing 777', 'Airbus A380', 'Boeing 787 Dreamliner'];
const FLIGHT_STATUSES = ['scheduled', 'scheduled', 'scheduled', 'delayed', 'boarding', 'departed'];

const generateMockFlights = (count = 50) => {
  const flights = [];
  const today = new Date();

  for (let i = 0; i < count; i++) {
    const airline = MOCK_AIRLINES[Math.floor(Math.random() * MOCK_AIRLINES.length)];

    let originIdx = Math.floor(Math.random() * MOCK_AIRPORTS.length);
    let destIdx = Math.floor(Math.random() * MOCK_AIRPORTS.length);
    while (destIdx === originIdx) {
      destIdx = Math.floor(Math.random() * MOCK_AIRPORTS.length);
    }

    const origin = MOCK_AIRPORTS[originIdx];
    const destination = MOCK_AIRPORTS[destIdx];

    const daysOffset = Math.floor(Math.random() * 30);
    const departureHour = Math.floor(Math.random() * 24);
    const departureMinute = [0, 15, 30, 45][Math.floor(Math.random() * 4)];

    const departureTime = addDays(today, daysOffset);
    departureTime.setHours(departureHour, departureMinute, 0, 0);

    const durationMinutes = 60 + Math.floor(Math.random() * 840);
    const arrivalTime = addMinutes(departureTime, durationMinutes);

    const basePrice = 2000 + Math.floor(Math.random() * 48000);

    const totalEconomy = 150 + Math.floor(Math.random() * 50);
    const totalBusiness = 20 + Math.floor(Math.random() * 20);
    const hasFirst = Math.random() > 0.5;
    const totalFirst = hasFirst ? 8 + Math.floor(Math.random() * 8) : 0;

    flights.push({
      _id: uuidv4(),
      flightNumber: `${airline.code}${100 + Math.floor(Math.random() * 9900)}`,
      airline: airline.name,
      airlineCode: airline.code,
      airlineLogoColor: airline.logoColor,
      origin: {
        iataCode: origin.iataCode,
        name: origin.name,
        city: origin.city,
        country: origin.country,
        timezone: origin.timezone,
        coordinates: origin.coordinates,
      },
      destination: {
        iataCode: destination.iataCode,
        name: destination.name,
        city: destination.city,
        country: destination.country,
        timezone: destination.timezone,
        coordinates: destination.coordinates,
      },
      departureTime: departureTime.toISOString(),
      arrivalTime: arrivalTime.toISOString(),
      duration: durationMinutes,
      status: FLIGHT_STATUSES[Math.floor(Math.random() * FLIGHT_STATUSES.length)],
      aircraft: AIRCRAFT_TYPES[Math.floor(Math.random() * AIRCRAFT_TYPES.length)],
      seats: {
        economy: {
          total: totalEconomy,
          available: Math.floor(Math.random() * totalEconomy),
          price: basePrice,
        },
        business: {
          total: totalBusiness,
          available: Math.floor(Math.random() * totalBusiness),
          price: basePrice * 3,
        },
        first: {
          total: totalFirst,
          available: totalFirst > 0 ? Math.floor(Math.random() * totalFirst) : 0,
          price: basePrice * 6,
        },
      },
      amenities: {
        wifi: Math.random() > 0.4,
        meal: Math.random() > 0.3,
        entertainment: Math.random() > 0.5,
        usb: Math.random() > 0.3,
      },
      baggage: {
        cabin: '7kg',
        checkIn: '15kg',
      },
    });
  }

  return flights;
};

module.exports = { MOCK_AIRPORTS, MOCK_AIRLINES, generateMockFlights };
