const express = require('express');
const router = express.Router();
const {
  createTestSeries,
  getAllTestSeries,
  getTestSeriesById,
  updateTestSeries,
  deleteTestSeries,
  getRecentTestSeriesForUser,
  startTestSecure,
  saveTestProgress,
  completeTest,
  getScore,
  getDetailedResult,
  getLeaderboard,
  getAllAttemptsSummary,
  getUserAttemptForTest,
  getSolutionForTest,
  getLatestAttemptSummaries,
  generateDynamicTestSeries,
} = require('../controllers/testSeriesController');

// ✅ 2. Import adminOnly middleware
const { protect, adminOnly } = require('../middleware/authMiddleware');

// --- Admin-Only Routes ---
router.post('/', protect, adminOnly, createTestSeries);
router.post('/generate-dynamic', protect, adminOnly, generateDynamicTestSeries); // ✅ 3. Add the new route
router.put('/:id', protect, adminOnly, updateTestSeries);
router.delete('/:id', protect, adminOnly, deleteTestSeries);

// --- User-Facing Routes ---
router.get('/', getAllTestSeries); // Publicly viewable list of tests
router.get('/recent', protect, getRecentTestSeriesForUser);
router.get('/attempted-summary', protect, getLatestAttemptSummaries);
router.post('/start', protect, startTestSecure);

// Routes with parameters
router.get('/result/:attemptId', protect, getDetailedResult);
router.post('/:testId/save-progress', protect, saveTestProgress);
router.post('/:testId/complete', protect, completeTest);
router.get('/:testId/score', protect, getScore);
router.get('/:testId/solution', protect, getSolutionForTest);
router.get('/:testId/leaderboard', protect, getLeaderboard);
router.get('/:testId/all-attempts-summary', getAllAttemptsSummary); // Can be public or protected
router.get('/:testId/attempts/user', protect, getUserAttemptForTest);


// Generic route comes last
router.get('/:id', getTestSeriesById);

module.exports = router;