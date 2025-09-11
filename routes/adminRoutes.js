// nextExams-backend/routes/adminRoutes.js

const express = require("express");
const router = express.Router();
const {
  listUsers,
  getUserDetails,
  toggleBlockUser,
  deleteUser,
  grantPrimeAccess,
  getFeedback,
  updateFeedbackStatus,
  createAdmin 
} = require("../controllers/userController");

// router.post("/create-admin", createAdmin);

// <-- 1. IMPORT THE NEW CONTROLLER FUNCTION
const { broadcastNotification, getAllNotifications,deleteBroadcast,
   } = require("../controllers/notificationController");

const { protect, adminOnly } = require("../middleware/authMiddleware");

// This protects all routes below it, which is perfect.
router.use(protect, adminOnly);

// --- User Management Routes ---
router.get("/users", listUsers);
router.get("/users/:id", getUserDetails);
router.put("/users/:id/block", toggleBlockUser);
router.put("/users/:id/prime-access", grantPrimeAccess);
router.delete("/users/:id", deleteUser);

// --- Feedback Management Routes ---
router.get("/feedback", getFeedback);
router.patch("/feedback/:id", updateFeedbackStatus);

// --- Notification Management Routes ---
router.post("/broadcast", broadcastNotification);
router.get("/notifications", getAllNotifications);
router.delete("/broadcasts/:broadcastId", deleteBroadcast);

module.exports = router;