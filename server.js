const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit'); 
const helmet = require('helmet');
const http = require('http'); // <-- NEW
const { Server } = require('socket.io'); // <-- NEW

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

// Middleware
app.use(helmet()); 
app.use(cors({
  origin: process.env.CLIENT_URL,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// --- START: NEW SOCKET.IO INTEGRATION ---

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

// --- END: NEW SOCKET.IO INTEGRATION ---

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
// MODIFIED: We listen on the http server
server.listen(PORT, '0.0.0.0', () => { 
    console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
    mongoose.connect(process.env.MONGO_URL)
      .then(() => console.log('✅ MongoDB connected'))
      .catch((err) => console.error('❌ MongoDB connection error:', err));
});

// Unhandled rejection handler
process.on('unhandledRejection', (err, promise) => {
  console.log('❌ UNHANDLED REJECTION! Shutting down...');
  console.log(err.name, err.message);
  server.close(() => process.exit(1)); 
});