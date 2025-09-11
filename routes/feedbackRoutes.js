    const express = require('express');
    const router = express.Router();
    const { body } = require('express-validator');
    const { protect } = require('../middleware/authMiddleware');

    const {
        submitExamFeedback,
        submitGeneralFeedback,
        getMyFeedbackHistory
    } = require('../controllers/feedbackController');

    // ✅ Corrected validation rules
    router.post(
        '/exam',
        protect,
        [
            body('testId', 'Test ID is required').isMongoId(),
            body('attemptId', 'Attempt ID is required').isMongoId(), // Added rule for attemptId
            body('rating', 'Rating must be a number between 1 and 5').isInt({ min: 1, max: 5 }),
            // Changed 'feedback' to 'message' to match the controller
            body('message', 'Feedback text is required').notEmpty().trim().escape(),
        ],
        submitExamFeedback
    );

    // ✅ Corrected validation rules
    router.post(
        '/general',
        protect,
        [
        // ✅ CORRECTED RULE for 'category'
        body('category', 'Category is required')
            .notEmpty()
            .trim()
            .isIn(['UI/UX', 'Bug Report', 'Feature Request', 'Other']) 
            .withMessage('Invalid category selected'), // This replaces .escape()

        body('message', 'Feedback text is required').notEmpty().trim().escape(),
    ],
        submitGeneralFeedback
    );

    router.get('/my-history', protect, getMyFeedbackHistory);

    module.exports = router;