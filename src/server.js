const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const connectDB = require('./config/db');
const { initSocket } = require('./config/socket');
const { startFlightStatusPolling } = require('./services/flightStatusService');
const { startScheduler } = require('./services/schedulerService');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();
const server = http.createServer(app);

connectDB();

const io = initSocket(server);
app.set('io', io);
global.io = io;

// Raw body parser for Stripe webhooks — must come before express.json
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(helmet());
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  process.env.ADMIN_URL   || 'http://localhost:5174',
  // dev fallbacks when ports shift
  'http://localhost:5175',
  'http://localhost:5176',
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/flights', require('./routes/flightRoutes'));
app.use('/api/bookings', require('./routes/bookingRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/airports', require('./routes/airportRoutes'));

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'FlightBook API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  startFlightStatusPolling(io);
  startScheduler(io);
});

module.exports = { app, server };
