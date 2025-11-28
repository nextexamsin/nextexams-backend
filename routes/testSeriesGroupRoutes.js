const express = require('express');
const router = express.Router();

const {
  createTestSeriesGroup,
  getAllTestSeriesGroups,
  getTestSeriesGroupById,
  getPublicTestSeriesGroupById, // ✅ Import the new public controller
  updateTestSeriesGroup,
  deleteTestSeriesGroup,
  getFullTestSeriesGroups,
  getRecentTestSeriesGroups,
  getPublishedGroupsWithTests,
} = require('../controllers/testSeriesGroupController');

const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/full', getFullTestSeriesGroups);
router.post('/', protect, adminOnly, createTestSeriesGroup);

// Public Routes
router.get('/', getAllTestSeriesGroups); // Already public (List of all groups)
router.get('/public/:id', getPublicTestSeriesGroupById); // ✅ NEW: Public Group Details (No Auth)
router.get('/published', getPublishedGroupsWithTests);

// Protected User Routes
router.get('/recent', protect, getRecentTestSeriesGroups);
router.get('/:id', protect, getTestSeriesGroupById); // Keeps logic for user progress calculation

// Admin Routes
router.put('/:id', protect, adminOnly, updateTestSeriesGroup);
router.delete('/:id', protect, adminOnly, deleteTestSeriesGroup);

module.exports = router;