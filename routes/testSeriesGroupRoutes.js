const express = require('express');
const router = express.Router();

const {
  createTestSeriesGroup,
  getAllTestSeriesGroups,
  getTestSeriesGroupById,
  getPublicTestSeriesGroupById, 
  updateTestSeriesGroup,
  deleteTestSeriesGroup,
  getFullTestSeriesGroups,
  getRecentTestSeriesGroups,
  getPublishedGroupsWithTests,
} = require('../controllers/testSeriesGroupController');

const { protect, adminOnly } = require('../middleware/authMiddleware');

// 🚀 IMPORT CACHE MIDDLEWARE
const cacheMiddleware = require('../middleware/cacheMiddleware'); // Make sure path matches where you saved it

// 🚀 APPLIED CACHE: 5 minutes (300 seconds) for the heavy paginated endpoint
router.get('/full', cacheMiddleware(300), getFullTestSeriesGroups);

router.post('/', protect, adminOnly, createTestSeriesGroup);

// Public Routes
// 🚀 APPLIED CACHE: 10 minutes (600 seconds) for public endpoints
router.get('/', cacheMiddleware(600), getAllTestSeriesGroups);
router.get('/public/:id', cacheMiddleware(300), getPublicTestSeriesGroupById); 
router.get('/published', cacheMiddleware(600), getPublishedGroupsWithTests);

// Protected User Routes (No caching here as these return user-specific progress data)
router.get('/recent', protect, getRecentTestSeriesGroups);
router.get('/:id', protect, getTestSeriesGroupById); 

// Admin Routes
router.put('/:id', protect, adminOnly, updateTestSeriesGroup);
router.delete('/:id', protect, adminOnly, deleteTestSeriesGroup);

module.exports = router;