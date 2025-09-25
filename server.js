// --- CORE & VENDOR MODULES ---
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');

// --- LOAD ENVIRONMENT VARIABLES ---
dotenv.config();

// --- STARTUP LOGS FOR VERIFICATION ---
console.log("✅ NODE_ENV:", process.env.NODE_ENV || 'development');
console.log("✅ CLIENT_URL:", process.env.CLIENT_URL);
console.log("✅ GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID);
if (process.env.GOOGLE_CLIENT_SECRET) {
    console.log("✅ GOOGLE_CLIENT_SECRET: [LOADED]");
} else {
    console.log("❌ GOOGLE_CLIENT_SECRET is missing!");
}

// --- GLOBAL ERROR HANDLERS ---
process.on('uncaughtException', (err) => {
    console.error('❌ UNCAUGHT EXCEPTION! Shutting down...', err);
    process.exit(1);
});

// --- ROUTE & MIDDLEWARE IMPORTS ---
const userRoutes = require('./routes/userRoutes');
const questionRoutes = require('./routes/questionRoutes');
const testSeriesRoutes = require('./routes/testSeriesRoutes');
const testSeriesGroupRoutes = require('./routes/testSeriesGroupRoutes');
const passRoutes = require('./routes/passRoutes');
const bookRoutes = require('./routes/bookRoutes');
const adminRoutes = require('./routes/adminRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware.js');
const { apiLimiter } = require('./utils/rateLimiter');

// --- INITIALIZE EXPRESS APP ---
const app = express();
const server = http.createServer(app);

// --- SECURITY & MIDDLEWARE CONFIGURATION ---
app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: false, 
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- DYNAMIC CORS POLICY (THIS IS THE FIX) ---
const allowedOrigins = [
    process.env.CLIENT_URL,      // Your production URL (e.g., https://www.nextexams.in)
    'http://localhost:5173',       // Standard local development URL
    'http://10.244.18.84:5173'    // Your specific local network URL
];

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like Postman, mobile apps, etc.)
        if (!origin) {
            return callback(null, true);
        }

        // Check if the origin is in our static whitelist OR if it matches the Vercel preview URL pattern
        if (allowedOrigins.includes(origin) || /nextexams-.*\.vercel\.app$/.test(origin)) {
            callback(null, true);
        } else {
            callback(new Error('The CORS policy for this site does not allow access from your origin.'));
        }
    },
    credentials: true,
};

// Use the new, more flexible CORS options for both the main API and Socket.IO
app.use(cors(corsOptions));
// --- END OF CORS FIX ---

// --- SOCKET.IO INTEGRATION ---
const io = new Server(server, {
    cors: corsOptions // Use the same flexible options here
});

let onlineUsers = {};
io.on('connection', (socket) => {
    console.log(`🔌 New client connected: ${socket.id}`);
    socket.on('addNewUser', (userId) => {
        if (userId) {
            onlineUsers[userId] = socket.id;
            console.log('Active users:', Object.keys(onlineUsers).length);
        }
    });
    socket.on('disconnect', () => {
        Object.keys(onlineUsers).forEach((userId) => {
            if (onlineUsers[userId] === socket.id) {
                delete onlineUsers[userId];
            }
        });
        console.log(`🔌 Client disconnected: ${socket.id}`);
        console.log('Active users:', Object.keys(onlineUsers).length);
    });
});

app.use((req, res, next) => {
    req.io = io;
    req.onlineUsers = onlineUsers;
    next();
});

// --- API ROUTES ---
app.get('/', (req, res) => res.send('✅ NextExams API is running successfully.'));
app.use('/api/users', userRoutes);
app.use('/api/questions', apiLimiter, questionRoutes);
app.use('/api/testseries', apiLimiter, testSeriesRoutes);
app.use('/api/testseries-groups', apiLimiter, testSeriesGroupRoutes);
app.use('/api/passes', apiLimiter, passRoutes);
app.use('/api/books', apiLimiter, bookRoutes);
app.use('/api/admin', apiLimiter, adminRoutes);
app.use('/api/feedback', apiLimiter, feedbackRoutes);
app.use('/api/notifications', apiLimiter, notificationRoutes);


// --- CUSTOM ERROR HANDLING MIDDLEWARE ---
app.use(notFound);
app.use(errorHandler);

// --- SERVER STARTUP LOGIC ---
const PORT = process.env.PORT || 8000;

const startServer = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log('✅ MongoDB connected successfully.');
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
        });
    } catch (err) {
        console.error('❌ Failed to connect to MongoDB!', err);
        process.exit(1);
    }
};

startServer();

// Graceful shutdown for unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('❌ UNHANDLED REJECTION! Shutting down...', err);
    server.close(() => {
        process.exit(1);
    });
});