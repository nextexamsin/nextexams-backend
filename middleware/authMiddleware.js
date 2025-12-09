const jwt = require("jsonwebtoken");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");
const admin = require('firebase-admin');

const protect = asyncHandler(async (req, res, next) => {
  let token;

  // 1. CHECK COOKIES FIRST (Primary method for Web App)
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  // 2. CHECK HEADERS SECOND (Fallback for mobile/postman)
  else if (
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
    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user || req.user.isBlocked) {
      res.status(401);
      throw new Error("Not authorized. User not found or is blocked.");
    }

    next();
  } catch (error) {
    // Specifically check for token expiration error
    if (error.name === 'TokenExpiredError') {
      res.status(401);
      throw new Error("Not authorized, token expired");
    }
    // Handle other verification errors
    res.status(401);
    throw new Error("Not authorized, token failed");
  }
});

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

            // Verify the token using the Firebase Admin SDK
            const decodedToken = await admin.auth().verifyIdToken(token);
            
            // Attach the decoded token's payload to the request object
            // This payload contains uid, phone_number, etc.
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




///////

// Helo

/////////