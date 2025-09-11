const jwt = require("jsonwebtoken");
const User = require("../models/User");
const asyncHandler = require("express-async-handler");

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try { // <-- MODIFIED: Add try block
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select("-password");

      if (!req.user || req.user.isBlocked) {
        res.status(401);
        throw new Error("Not authorized. User not found or is blocked.");
      }

      next();
    } catch (error) { // <-- MODIFIED: Add catch block
      // Specifically check for token expiration error
      if (error.name === 'TokenExpiredError') {
        res.status(401);
        throw new Error("Not authorized, token expired");
      }
      // Handle other verification errors
      res.status(401);
      throw new Error("Not authorized, token failed");
    }
  } else {
    res.status(401);
    throw new Error("Not authorized, no token");
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

module.exports = { protect, adminOnly };