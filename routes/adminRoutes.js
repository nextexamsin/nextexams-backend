// nextExams-backend/routes/adminRoutes.js

const express = require("express");
const router = express.Router();

// 1. Import User Controllers
const {
  listUsers,
  getUserDetails,
  toggleBlockUser,
  deleteUser,
  grantPrimeAccess,
} = require("../controllers/userController");

// 2. Import Notification Controllers
const { 
  broadcastNotification, 
  getAllNotifications, 
  deleteBroadcast 
} = require("../controllers/notificationController");

// 3. Import Feedback Controllers
const { 
  getAllFeedback, 
  updateFeedbackStatus 
} = require("../controllers/feedbackController");

// ✅ 4. IMPORT ANALYTICS CONTROLLER (New)
const { getGA4Report, getRealtimeReport } = require("../controllers/analyticsController");

const { protect, adminOnly } = require("../middleware/authMiddleware");

// This protects all routes below it
router.use(protect, adminOnly);

// --- Analytics Routes (New) ---
router.get("/ga4-report", getGA4Report);
router.get("/ga4-realtime", getRealtimeReport);

// --- User Management Routes ---
router.get("/users", listUsers);
router.get("/users/:id", getUserDetails);
router.put("/users/:id/block", toggleBlockUser);
router.put("/users/:id/prime-access", grantPrimeAccess);
router.delete("/users/:id", deleteUser);

// --- Feedback Management Routes ---
router.get("/feedback", getAllFeedback);
router.patch("/feedback/:id", updateFeedbackStatus);

// --- Notification Management Routes ---
router.post("/broadcast", broadcastNotification);
router.get("/notifications", getAllNotifications);
router.delete("/broadcasts/:broadcastId", deleteBroadcast);

module.exports = router;