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

// Trust Render's reverse proxy so req.ip is the real client IP (fixes rate-limiter shared-counter bug)
app.set('trust proxy', 1);

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
app.use('/api/saved-searches', require('./routes/savedSearchRoutes'));

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'FlightBook API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// One-time seed endpoint — protected by SEED_SECRET env var
// Remove SEED_SECRET from Render env vars after seeding to disable this
if (process.env.SEED_SECRET) {
  app.get('/api/seed', (req, res) => {
    if (req.query.secret !== process.env.SEED_SECRET) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { execFile } = require('child_process');
    const path = require('path');
    res.setHeader('Content-Type', 'text/plain');
    res.write('Seeding database...\n');
    execFile('node', [path.join(__dirname, 'seed.js')], { env: process.env }, (err, stdout, stderr) => {
      if (err) { res.write('ERROR:\n' + (stderr || err.message)); }
      else { res.write(stdout); }
      res.end();
    });
  });

  // Cleanup endpoint — removes all non-admin users, bookings, and notifications
  // Airports, airlines, and flights are preserved
  app.get('/api/cleanup', async (req, res) => {
    if (req.query.secret !== process.env.SEED_SECRET) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      const mongoose = require('mongoose');
      const User = require('./models/User');
      const Booking = require('./models/Booking');
      const Notification = require('./models/Notification');

      const [users, bookings, notifications] = await Promise.all([
        User.deleteMany({ role: { $ne: 'admin' } }),
        Booking.deleteMany({}),
        Notification.deleteMany({}),
      ]);

      res.json({
        success: true,
        message: 'Cleanup complete. Admin user, airports, airlines, and flights preserved.',
        deleted: {
          users: users.deletedCount,
          bookings: bookings.deletedCount,
          notifications: notifications.deletedCount,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  startFlightStatusPolling(io);
  startScheduler(io);
});

module.exports = { app, server };
