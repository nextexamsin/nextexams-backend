// nextExams-backend/routes/adminRoutes.js

const express = require("express");
const router = express.Router();

// 1. Import User Controllers (REMOVED feedback functions from here)
const {
  listUsers,
  getUserDetails,
  toggleBlockUser,
  deleteUser,
  grantPrimeAccess,
  // createAdmin 
} = require("../controllers/userController");

// 2. Import Notification Controllers
const { 
  broadcastNotification, 
  getAllNotifications, 
  deleteBroadcast 
} = require("../controllers/notificationController");

// ✅ 3. IMPORT FEEDBACK CONTROLLERS FROM THE CORRECT FILE
const { 
  getAllFeedback, 
  updateFeedbackStatus 
} = require("../controllers/feedbackController");

const { protect, adminOnly } = require("../middleware/authMiddleware");

// This protects all routes below it
router.use(protect, adminOnly);

// --- User Management Routes ---
router.get("/users", listUsers);
router.get("/users/:id", getUserDetails);
router.put("/users/:id/block", toggleBlockUser);
router.put("/users/:id/prime-access", grantPrimeAccess);
router.delete("/users/:id", deleteUser);

// --- Feedback Management Routes ---
// ✅ Updated to use the correct controller functions
router.get("/feedback", getAllFeedback);
router.patch("/feedback/:id", updateFeedbackStatus);

// --- Notification Management Routes ---
router.post("/broadcast", broadcastNotification);
router.get("/notifications", getAllNotifications);
router.delete("/broadcasts/:broadcastId", deleteBroadcast);

module.exports = router;