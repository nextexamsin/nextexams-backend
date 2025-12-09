// --- CORE & VENDOR MODULES ---
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser'); // <--- 1. ADDED THIS IMPORT
const dotenv = require('dotenv');
dotenv.config();

const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');
const admin = require('firebase-admin');
const { Redis } = require('@upstash/redis'); 
const cron = require('node-cron');

// --- INITIALIZE FIREBASE ADMIN SDK ---
try {
    let serviceAccount;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else {
        serviceAccount = require('./config/firebase-service-account.json');
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin SDK initialized successfully.');

} catch (error) {
    console.error('❌ Failed to initialize Firebase Admin SDK!', error);
    process.exit(1);
}

// --- REDIS CLOUD CONNECTION (Upstash REST) ---
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

redis.get('ping').then(() => {
    console.log('✅ Connected to Upstash Redis Cloud (REST) successfully.');
}).catch((err) => {
    console.error('❌ Redis Connection Error:', err.message);
});

// --- CRON JOB: KEEP REDIS ALIVE ---
cron.schedule('0 0 * * *', async () => {
    try {
        await redis.set('heartbeat', 'ok', { ex: 60 }); 
        console.log('🔔 Daily Cron: Redis Ping successful (Keep-Alive)');
    } catch (err) {
        console.error('❌ Daily Cron: Redis Ping failed:', err.message);
    }
});

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
const blogRoutes = require('./routes/blogRoutes');
const commentRoutes = require('./routes/commentRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware.js');
const { apiLimiter } = require('./utils/rateLimiter');
const examCategoryRoutes = require('./routes/examCategoryRoutes');

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
app.use(cookieParser()); // <--- 2. ADDED COOKIE PARSER MIDDLEWARE

// --- DYNAMIC CORS POLICY ---
const allowedOrigins = [
    process.env.CLIENT_URL,       
    'https://nextexams.in',
    'https://www.nextexams.in',
    'https://tool.nextexams.in',  
    'http://localhost:5173',      
    'http://localhost:5174'       
];

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin) || /nextexams-.*\.vercel\.app$/.test(origin)) {
            callback(null, true);
        } else {
            callback(new Error('The CORS policy for this site does not allow access from your origin.'));
        }
    },
    credentials: true, // Allows cookies to be shared
};

app.use(cors(corsOptions));

// --- SOCKET.IO INTEGRATION ---
const io = new Server(server, { cors: corsOptions });

let onlineUsers = {};
io.on('connection', (socket) => {
    socket.on('addNewUser', (userId) => {
        if (userId) onlineUsers[userId] = socket.id;
    });
    socket.on('disconnect', () => {
        Object.keys(onlineUsers).forEach((userId) => {
            if (onlineUsers[userId] === socket.id) {
                delete onlineUsers[userId];
            }
        });
    });
});

// --- INJECT GLOBALS INTO REQUEST (Middleware) ---
app.use((req, res, next) => {
    req.io = io;
    req.onlineUsers = onlineUsers;
    req.redis = redis; 
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
app.use('/api/blog', apiLimiter, blogRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/exam-categories', examCategoryRoutes);

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
            console.log(`🚀 Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error('❌ Failed to connect to MongoDB!', err);
        process.exit(1);
    }
};

startServer();

process.on('unhandledRejection', (err) => {
    console.error('❌ UNHANDLED REJECTION! Shutting down...', err);
    server.close(() => {
        process.exit(1);
    });
});




///////

// hello

////