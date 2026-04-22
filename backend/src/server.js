import './setup.js';
import app from './setupApp.js';
import { closeDb, connectDb } from './utils/db.js';
import './jobs/reminders.js';
import './jobs/analytics.js';
import { seedAdminIfNeeded } from './controllers/authController.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { verifyToken } from './utils/jwt.js';
import { logSuspiciousActivity } from './utils/logger.js';
import cookie from 'cookie';
import { seedEmailTemplates } from './services/emailTemplateService.js';
import { setIo } from './utils/io.js';
import { startEmbeddedWorkers } from './workers/startEmbeddedWorkers.js';

const PORT = process.env.PORT || 4000;
//new file check
await connectDb();
await seedAdminIfNeeded();
await seedEmailTemplates();

const httpServer = createServer(app);

let isShuttingDown = false;

// Setup Socket.IO with CORS
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// SECURITY: WebSocket authentication middleware
// Now reads JWT from HttpOnly cookies to prevent XSS token theft
io.use((socket, next) => {
  try {
    let token = null;
    
    // SECURITY: Try to read token from HttpOnly cookie first (preferred, XSS-safe)
    const cookieHeader = socket.handshake.headers.cookie;
    if (cookieHeader) {
      const cookies = cookie.parse(cookieHeader);
      token = cookies.accessToken;
    }
    
    // Fallback: Check auth object (for backwards compatibility during migration)
    // Note: This fallback should be removed after full migration to cookie-based auth
    if (!token) {
      token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    }
    
    if (!token) {
      console.warn(`[SECURITY] WebSocket connection attempt without token from ${socket.handshake.address}`);
      return next(new Error('Authentication required'));
    }
    
    // Verify JWT token
    const payload = verifyToken(token);
    socket.userId = payload.sub;
    socket.userRole = payload.role;
    socket.userEmail = payload.email;
    
    next();
  } catch (err) {
    console.warn(`[SECURITY] WebSocket auth failed from ${socket.handshake.address}: ${err.message}`);
    next(new Error('Invalid token'));
  }
});

// SECURITY: Track connections per user to prevent abuse
const connectionsPerUser = new Map();
const MAX_CONNECTIONS_PER_USER = 10;

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id} (User: ${socket.userEmail})`);
  
  // SECURITY: Limit connections per user
  const userId = socket.userId;
  const currentCount = connectionsPerUser.get(userId) || 0;
  
  if (currentCount >= MAX_CONNECTIONS_PER_USER) {
    console.warn(`[SECURITY] User ${socket.userEmail} exceeded max connections (${MAX_CONNECTIONS_PER_USER})`);
    socket.disconnect(true);
    return;
  }
  
  connectionsPerUser.set(userId, currentCount + 1);
  
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id} (User: ${socket.userEmail})`);
    
    // Clean up connection count
    const count = connectionsPerUser.get(userId) || 1;
    if (count <= 1) {
      connectionsPerUser.delete(userId);
    } else {
      connectionsPerUser.set(userId, count - 1);
    }
  });

  // Join personal room for real-time notifications
  socket.on('register', (userId) => {
    const normalized = userId ? String(userId) : '';
    const socketUserId = socket.userId ? String(socket.userId) : '';
    const roomToJoin = normalized && normalized === socketUserId ? normalized : socketUserId;
    if (roomToJoin) {
      socket.join(roomToJoin);
    }
  });
  
  // SECURITY: Rate limit events per socket (prevent spam)
  const eventCounts = new Map();
  const EVENT_LIMIT = 100;
  const EVENT_WINDOW = 60000; // 1 minute
  
  socket.use((packet, next) => {
    const eventName = packet[0];
    const now = Date.now();
    
    const eventData = eventCounts.get(eventName) || { count: 0, resetTime: now + EVENT_WINDOW };
    
    if (now > eventData.resetTime) {
      // Reset window
      eventCounts.set(eventName, { count: 1, resetTime: now + EVENT_WINDOW });
      next();
    } else if (eventData.count >= EVENT_LIMIT) {
      // Rate limit exceeded
      console.warn(`[SECURITY] WebSocket rate limit exceeded for user ${socket.userEmail} on event ${eventName}`);
      socket.emit('error', { message: 'Rate limit exceeded' });
      // Don't call next() - block the event
    } else {
      // Increment count
      eventData.count++;
      eventCounts.set(eventName, eventData);
      next();
    }
  });
});

// Make io available globally
app.set('io', io);
setIo(io);
startEmbeddedWorkers();

// SECURITY: Graceful shutdown handlers
const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n${signal} received. Starting graceful shutdown...`);

  const exitCleanly = async (code) => {
    try {
      io.close(() => {
        console.log('WebSocket server closed');
      });
    } catch {
      // ignore
    }

    try {
      await closeDb();
      console.log('Database connection closed');
    } catch (err) {
      console.error('Error closing database:', err);
    }

    process.exit(code);
  };

  // Stop accepting new connections (if server actually started)
  try {
    if (!httpServer.listening) {
      await exitCleanly(signal === 'UNCAUGHT_EXCEPTION' ? 1 : 0);
      return;
    }

    httpServer.close(async () => {
      console.log('HTTP server closed');
      await exitCleanly(signal === 'UNCAUGHT_EXCEPTION' ? 1 : 0);
    });
  } catch (err) {
    console.error('Error closing HTTP server:', err);
    await exitCleanly(1);
  }
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors gracefully
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

httpServer.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Uncaught Exception: Error: listen EADDRINUSE: address already in use :::${PORT}`);
    console.error(`Port ${PORT} is already in use. Stop the existing server or set PORT to a different value in backend/.env.`);
    shutdown('UNCAUGHT_EXCEPTION');
    return;
  }

  console.error('HTTP server error:', err);
  shutdown('UNCAUGHT_EXCEPTION');
});

httpServer.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
  console.log(`Socket.IO ready for real-time updates`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export { io };
