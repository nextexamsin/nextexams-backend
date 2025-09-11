const { validationResult } = require("express-validator"); // ✅ 1. Import this
const ExamFeedback = require('../models/ExamFeedback');
const GeneralFeedback = require('../models/GeneralFeedback');

// @desc    Submit feedback for a specific exam attempt
// @route   POST /api/feedback/exam
exports.submitExamFeedback = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    // ✅ CHANGED 'feedback' to 'message' to match the router
    const { testId, attemptId, rating, message } = req.body; 
    try {
        const newFeedback = new ExamFeedback({
            user: req.user.id,
            test: testId,
            attempt: attemptId,
            rating,
            message // ✅ Use the 'message' variable directly
        });
        await newFeedback.save();
        res.status(201).json({ message: "Feedback submitted successfully!" });
    } catch (error) {
        console.error(error.message);
        res.status(500).send("Server Error");
    }
};

exports.submitGeneralFeedback = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    // ✅ CHANGED 'feedback' to 'message' to match the router
    const { category, message } = req.body;
    try {
        const newFeedback = new GeneralFeedback({
            user: req.user.id,
            category,
            message // ✅ Use the 'message' variable directly
        });
        await newFeedback.save();
        res.status(201).json({ message: "Feedback submitted successfully!" });
    } catch (error) {
        // Log the specific Mongoose error for better debugging
        console.error('Feedback submission error:', error.message);
        res.status(500).send("Server Error");
    }
};


// @desc    Get the current user's submitted feedback history
// @route   GET /api/feedback/my-history
exports.getMyFeedbackHistory = async (req, res) => {
    try {
        const examFeedback = await ExamFeedback.find({ user: req.user.id })
            .populate('test', 'title')
            .sort({ createdAt: -1 });

        const generalFeedback = await GeneralFeedback.find({ user: req.user.id })
            .sort({ createdAt: -1 });

        res.json({ examFeedback, generalFeedback });
    } catch (error) {
        console.error(error.message);
        res.status(500).send("Server Error");
    }
};