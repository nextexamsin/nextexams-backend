const express = require('express');
const router = express.Router();
const { body } = require('express-validator');

// Import 'adminOnly' matching your authMiddleware.js export
const { protect, adminOnly } = require('../middleware/authMiddleware'); 

const {
    submitExamFeedback,
    submitGeneralFeedback,
    getMyFeedbackHistory,
    reportQuestion,
    getAllFeedback,
    updateFeedbackStatus,
    deleteFeedback
} = require('../controllers/feedbackController');

// ============================================================
// 👤 USER ROUTES
// ============================================================

// Submit Exam Feedback
router.post(
    '/exam',
    protect,
    [
        body('testId', 'Test ID is required').isMongoId(),
        body('attemptId', 'Attempt ID is required').isMongoId(),
        body('rating', 'Rating must be a number between 1 and 5').isInt({ min: 1, max: 5 }),
        body('message', 'Feedback text is required').notEmpty().trim().escape(),
    ],
    submitExamFeedback
);

// Submit General Feedback
router.post(
    '/general',
    protect,
    [
        body('category', 'Category is required')
            .notEmpty()
            .trim()
            .isIn(['UI/UX', 'Bug Report', 'Feature Request', 'Other'])
            .withMessage('Invalid category selected'),
        body('message', 'Feedback text is required').notEmpty().trim().escape(),
    ],
    submitGeneralFeedback
);

// Report a specific Question
router.post('/question', protect, reportQuestion);

// Get User's Own History
router.get('/my-history', protect, getMyFeedbackHistory);

// ✅ Delete Route (Matches frontend call to /api/feedback/report/:id)
router.delete('/report/:id', protect, deleteFeedback);


// ============================================================
// 🔒 ADMIN ROUTES
// ============================================================

// Get ALL feedback (Exam, General, Question Reports)
router.get('/admin', protect, adminOnly, getAllFeedback);

// Update Feedback Status
router.patch('/admin/:id', protect, adminOnly, updateFeedbackStatus);

module.exports = router;