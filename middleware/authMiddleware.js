const jwt = require("jsonwebtoken");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const admin = require('firebase-admin');

// ✅ OPTIMIZED PROTECT MIDDLEWARE (Stateless)
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    res.status(401);
    throw new Error("Not authorized, no token");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 🚀 PERFORMANCE FIX: Trust the token!
    // Instead of querying MongoDB for every request, we just attach the ID.
    // This saves ~300ms per request on free tier DBs.
    req.user = { 
        _id: decoded.id, 
        role: decoded.role || 'user' // Ensure your generateToken includes role!
    };

    // Note: If you need to check if a user is "Blocked", 
    // you should do that in a separate "isBlocked" middleware only for critical routes,
    // OR cache the blocked status in Redis.
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      res.status(401);
      throw new Error("Not authorized, token expired");
    }
    res.status(401);
    throw new Error("Not authorized, token failed");
  }
});

// ... (Keep adminOnly and protectFirebase exactly as they are) ...
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403);
    throw new Error("Access denied: Admins only");
  }
};

const protectFirebase = asyncHandler(async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decodedToken = await admin.auth().verifyIdToken(token);
            req.user = decodedToken;
            next();
        } catch (error) {
            console.error('Firebase token verification error:', error);
            res.status(401);
            throw new Error('Not authorized, token failed');
        }
    }
    if (!token) {
        res.status(401);
        throw new Error('Not authorized, no token');
    }
});

module.exports = { protect, adminOnly, protectFirebase };