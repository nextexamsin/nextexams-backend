const express = require('express');
const router = express.Router();
const multer = require('multer'); // 👈 1. Import multer

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
    bulkUploadTestSeries,
    updateTestStatus, 
    getPublicTestsByGroupId
} = require('../controllers/testSeriesController');

const { protect, adminOnly } = require('../middleware/authMiddleware');

// Configure multer to store the file in memory
const upload = multer({ storage: multer.memoryStorage() }); // 👈 3. Initialize multer

// --- Admin-Only Routes ---
router.post('/', protect, adminOnly, createTestSeries);
router.post('/generate-dynamic', protect, adminOnly, generateDynamicTestSeries);
router.put('/:id/status', protect, adminOnly, updateTestStatus);

// 👇 4. Add the new bulk upload route here
router.post(
    '/bulk-upload',
    protect,
    adminOnly,
    upload.single('file'),
    bulkUploadTestSeries
);

router.put('/:id', protect, adminOnly, updateTestSeries);
router.delete('/:id', protect, adminOnly, deleteTestSeries);


// --- User-Facing Routes ---
router.get('/', getAllTestSeries);
router.get('/recent', protect, getRecentTestSeriesForUser);
router.get('/attempted-summary', protect, getLatestAttemptSummaries);
router.post('/start', protect, startTestSecure);

// ✅ NEW: Public Test List Route (No Auth)
router.get('/public/group/:groupId', getPublicTestsByGroupId);

// Routes with parameters
router.get('/result/:attemptId', protect, getDetailedResult);
router.post('/:testId/save-progress', protect, saveTestProgress);
router.post('/:testId/complete', protect, completeTest);
router.get('/:testId/score', protect, getScore);
router.get('/:testId/solution', protect, getSolutionForTest);
router.get('/:testId/leaderboard', protect, getLeaderboard);
router.get('/:testId/all-attempts-summary', getAllAttemptsSummary);
router.get('/:testId/attempts/user', protect, getUserAttemptForTest);

// Generic route comes last
router.get('/:id', getTestSeriesById);

module.exports = router;