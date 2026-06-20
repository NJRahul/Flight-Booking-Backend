const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Verify JWT on every socket connection
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} (user: ${socket.userId})`);

    // Auto-join user's own room on connect
    if (socket.userId) socket.join(`user:${socket.userId}`);

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

module.exports = { initSocket, emitFlightUpdate, emitBookingUpdate, emitUserNotification };
