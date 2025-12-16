const express = require("express");
const router = express.Router();
const {
  getCommentsForPost,
  createComment,
  updateComment,
  deleteComment,
  getPendingComments,
  approveComment,
  deleteImageFile
} = require("../controllers/commentController");
const { protect, adminOnly } = require("../middleware/authMiddleware");

// --- Admin Routes ---
router.get("/admin/pending", protect, adminOnly, getPendingComments);
router.put("/admin/approve/:id", protect, adminOnly, approveComment);

// --- User Routes ---
router.route("/:postId").get(getCommentsForPost).post(protect, createComment);

router.route("/:id").put(protect, updateComment).delete(protect, deleteComment);
router.post('/delete-image', protect, deleteImageFile);

module.exports = router;