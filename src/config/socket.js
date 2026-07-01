const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const initSocket = (server) => {
  const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    process.env.ADMIN_URL   || 'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
  ];

  const io = new Server(server, {
    cors: {
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`Socket CORS: origin ${origin} not allowed`));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Verify JWT and resolve role on every socket connection
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      // Look up role so admins can join the admin room
      const user = await User.findById(decoded.id).select('role').lean();
      socket.userRole = user?.role || 'user';
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} (user: ${socket.userId}, role: ${socket.userRole})`);

    // Auto-join user's own room on connect
    if (socket.userId) socket.join(`user:${socket.userId}`);

    // Auto-join admin room for admin users
    if (socket.userRole === 'admin') socket.join('admin');

    socket.on('join:flight', (flightId) => {
      socket.join(`flight:${flightId}`);
    });

    socket.on('join:booking', (bookingId) => {
      socket.join(`booking:${bookingId}`);
    });

    socket.on('join:user', (userId) => {
      socket.join(`user:${userId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

const emitFlightUpdate = (io, flightId, data) => {
  io.to(`flight:${flightId}`).emit('flight:update', data);
};

const emitBookingUpdate = (io, bookingId, data) => {
  io.to(`booking:${bookingId}`).emit('booking:update', data);
};

const emitUserNotification = (io, userId, data) => {
  io.to(`user:${userId}`).emit('notification:new', data);
};

// Broadcast lightweight stats-changed signal to all connected admins
const emitAdminStatsUpdate = (io, payload = {}) => {
  io.to('admin').emit('admin:stats', { ts: Date.now(), ...payload });
};

// Broadcast updated seat availability to everyone viewing a flight detail page
const emitFlightSeatsUpdate = (io, flightId, available) => {
  io.to(`flight:${flightId}`).emit('flight:seatsUpdate', {
    flightId: String(flightId),
    available, // { economy: N, business: N, first: N }
  });
};

module.exports = {
  initSocket,
  emitFlightUpdate,
  emitBookingUpdate,
  emitUserNotification,
  emitAdminStatsUpdate,
  emitFlightSeatsUpdate,
};
