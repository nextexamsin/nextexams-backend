const express = require('express');
const router = express.Router();
const multer = require('multer');

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
    getPublicTestsByGroupId,
    getFilterOptions 
} = require('../controllers/testSeriesController');

const { protect, adminOnly } = require('../middleware/authMiddleware');

// ✅ IMPORT LOGGING MIDDLEWARE (New)
const logHighValueEvent = require('../middleware/activityLogger');

// Configure multer to store the file in memory
const upload = multer({ storage: multer.memoryStorage() });

// --- Admin-Only Routes ---
router.post('/', protect, adminOnly, createTestSeries);
router.post('/generate-dynamic', protect, adminOnly, generateDynamicTestSeries);
router.put('/:id/status', protect, adminOnly, updateTestStatus);

// Bulk upload route
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

router.get('/filters', getFilterOptions); 

router.get('/', getAllTestSeries);
router.get('/recent', protect, getRecentTestSeriesForUser);
router.get('/attempted-summary', protect, getLatestAttemptSummaries);

// ✅ UPDATED: Added Logging for "Start Test"
// 'protect' ensures user is logged in -> 'logHighValueEvent' records the start -> 'startTestSecure' runs logic
router.post('/start', protect, logHighValueEvent('TEST_STARTED'), startTestSecure);

// Public Test List Route (No Auth)
router.get('/public/group/:groupId', getPublicTestsByGroupId);

// Routes with parameters
router.get('/result/:attemptId', protect, getDetailedResult);
router.post('/:testId/save-progress', protect, saveTestProgress);

// ✅ UPDATED: Added Logging for "Complete Test"
router.post('/:testId/complete', protect, logHighValueEvent('TEST_COMPLETED'), completeTest);

router.get('/:testId/score', protect, getScore);
router.get('/:testId/solution', protect, getSolutionForTest);
router.get('/:testId/leaderboard', protect, getLeaderboard);
router.get('/:testId/all-attempts-summary', getAllAttemptsSummary);
router.get('/:testId/attempts/user', protect, getUserAttemptForTest);

// Generic route comes last
router.get('/:id', getTestSeriesById);

module.exports = router;