// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');

// Load environment variables
dotenv.config();

// Uncaught exception handler
process.on('uncaughtException', (err) => {
  console.log('❌ UNCAUGHT EXCEPTION! Shutting down...');
  console.log(err.name, err.message);
  process.exit(1);
});

// Route imports
const userRoutes = require('./routes/userRoutes');
const questionRoutes = require('./routes/questionRoutes');
const testSeriesRoutes = require('./routes/testSeriesRoutes');
const testSeriesGroupRoutes = require('./routes/testSeriesGroupRoutes');
const passRoutes = require('./routes/passRoutes');
const bookRoutes = require('./routes/bookRoutes');
const adminRoutes = require('./routes/adminRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

// Import error handlers
const { notFound, errorHandler } = require('./middleware/errorMiddleware.js');

// Initialize Express app
const app = express();

// If running behind Render / a proxy, trust the proxy for protocol/host info
app.set('trust proxy', 1);

// Basic rate limiter for all API endpoints (tweak as needed)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(helmet());
app.use(apiLimiter);

// Allow CORS from your frontend origin. Make sure CLIENT_URL env var is set to your frontend origin.
app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true, // needed if you use cookies/credentials from frontend
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsers
app.use(express.json()); // parse application/json
app.use(express.urlencoded({ extended: true })); // parse application/x-www-form-urlencoded

// --- START: SOCKET.IO INTEGRATION ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
  },
});

let onlineUsers = {};

io.on('connection', (socket) => {
  console.log(`🔌 New client connected: ${socket.id}`);

  socket.on('addNewUser', (userId) => {
    onlineUsers[userId] = socket.id;
    console.log('Active users:', Object.keys(onlineUsers));
  });

  socket.on('disconnect', () => {
    Object.keys(onlineUsers).forEach((userId) => {
      if (onlineUsers[userId] === socket.id) {
        delete onlineUsers[userId];
      }
    });
    console.log(`🔌 Client disconnected: ${socket.id}`);
    console.log('Active users:', Object.keys(onlineUsers));
  });
});

app.use((req, res, next) => {
  req.io = io;
  req.onlineUsers = onlineUsers;
  next();
});
// --- END: SOCKET.IO INTEGRATION ---

// Test route
app.get('/', (req, res) => {
  res.send('✅ NextExams API is running');
});

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/testseries', testSeriesRoutes);
app.use('/api/testseries-groups', testSeriesGroupRoutes);
app.use('/api/passes', passRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/notifications', notificationRoutes);

// Use error handlers
app.use(notFound);
app.use(errorHandler);

// Connect to MongoDB and Start Server
const PORT = process.env.PORT || 8000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
  console.log('CLIENT_URL:', process.env.CLIENT_URL || '(not set)');
  console.log('GOOGLE_OAUTH_REDIRECT_URI:', process.env.GOOGLE_OAUTH_REDIRECT_URI || '(not set)');

  mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('✅ MongoDB connected'))
    .catch((err) => console.error('❌ MongoDB connection error:', err));
});

// Unhandled rejection handler
process.on('unhandledRejection', (err, promise) => {
  console.log('❌ UNHANDLED REJECTION! Shutting down...');
  console.log(err && (err.name || err.message) ? `${err.name} ${err.message}` : err);
  server.close(() => process.exit(1));
});
