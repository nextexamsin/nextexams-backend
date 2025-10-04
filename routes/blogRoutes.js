const express = require("express");
const router = express.Router();
const {
  getPublishedPosts,
  getPostBySlug,
  createPost,
  updatePost,
  deletePost,
  getAllPostsAsAdmin,
  getPopularPosts,
  getAllCategories,
  searchPosts,
  getRelatedPosts,
  getPostByIdForAdmin, // Make sure this is imported from your controller
  getPostForPreview,
  getPostsByCategory,
} = require("../controllers/blogController");

const { protect, adminOnly } = require("../middleware/authMiddleware");

// --- 🔓 Public Routes (Specific Paths First) ---
router.get("/", getPublishedPosts);
router.get("/popular", getPopularPosts);
router.get("/categories", getAllCategories);
router.get("/search", searchPosts);

// --- 🔐 Admin Routes ---
// These specific admin routes must also come before the general /:slug route
router.post("/", protect, adminOnly, createPost);
router.get("/all", protect, adminOnly, getAllPostsAsAdmin);
router.get("/admin/:id", protect, adminOnly, getPostByIdForAdmin);
router.get("/preview/:id", protect, adminOnly, getPostForPreview);
router.put("/:id", protect, adminOnly, updatePost);
router.delete("/:id", protect, adminOnly, deletePost);

// --- 🔓 Public Routes (Parameterized/General Paths Last) ---
// IMPORTANT: Parameterized routes like /:slug must be defined last
// so they don't accidentally catch specific paths like /all or /popular.
router.get("/category/:slug", getPostsByCategory);
router.get("/related/:slug", getRelatedPosts);
router.get("/:slug", getPostBySlug);


module.exports = router;