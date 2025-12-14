const { validationResult } = require("express-validator");
const ExamFeedback = require('../models/ExamFeedback');
const GeneralFeedback = require('../models/GeneralFeedback');
const QuestionReport = require('../models/QuestionReport'); 
const Notification = require('../models/Notification');

// --- USER FUNCTIONS ---

const submitExamFeedback = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { testId, attemptId, rating, message } = req.body; 
    try {
        const newFeedback = new ExamFeedback({
            user: req.user.id,
            test: testId,
            attempt: attemptId,
            rating,
            message
        });
        await newFeedback.save();
        res.status(201).json({ message: "Feedback submitted successfully!" });
    } catch (error) {
        console.error(error.message);
        res.status(500).send("Server Error");
    }
};

const submitGeneralFeedback = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { category, message } = req.body;
    try {
        const newFeedback = new GeneralFeedback({
            user: req.user.id,
            category,
            message
        });
        await newFeedback.save();
        res.status(201).json({ message: "Feedback submitted successfully!" });
    } catch (error) {
        console.error('Feedback submission error:', error.message);
        res.status(500).json({ message: "Server Error" });
    }
};

const getMyFeedbackHistory = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id; 
        
        // 1. Exam Feedback 
        const examFeedback = await ExamFeedback.find({ user: userId })
            .populate('test', 'title _id')
            .sort({ createdAt: -1 })
            .lean(); 
            
        // 2. General Feedback 
        const generalFeedback = await GeneralFeedback.find({ user: userId })
            .sort({ createdAt: -1 })
            .lean(); 
            
        // 3. Question Reports: 
        const questionReports = await QuestionReport.find({ userId })
            .select('issueType description status createdAt adminResponse') 
            .populate('questionId', 'questionText')
            .sort({ createdAt: -1 })
            .lean(); 

        res.json({ examFeedback, generalFeedback, questionReports }); 
    } catch (error) {
        console.error('Get Feedback History Error:', error.message);
        res.status(500).send("Server Error");
    }
};

const reportQuestion = async (req, res) => {
    try {
        const { questionId, testId, issueType, description } = req.body;
        const userId = req.user._id || req.user.id;

        // ✅ FIX: Check for 'pending' (lowercase) to match DB Schema default
        const existing = await QuestionReport.findOne({ 
            userId, 
            questionId, 
            status: 'pending' 
        });

        if (existing) {
            return res.status(400).json({ message: 'You have already reported this question. We are reviewing it.' });
        }

        const report = new QuestionReport({ userId, questionId, testId, issueType, description });
        await report.save();
        res.status(201).json({ message: 'Report submitted successfully.' });
    } catch (error) {
        console.error('Report Question Error:', error);
        res.status(500).json({ message: 'Failed to submit report.' });
    }
};

const deleteFeedback = async (req, res) => {
    try {
        const feedbackId = req.params.id;
        // Handle _id vs id safely
        const userId = req.user._id || req.user.id;

        // 1. Find and Delete
        // We match:
        // - _id: The Report ID
        // - userId: Must belong to the logged-in user (security)
        // - status: Must be 'pending' (lowercase). Processed reports cannot be deleted.
        const report = await QuestionReport.findOneAndDelete({ 
            _id: feedbackId, 
            userId: userId,
            status: 'pending' 
        });

        if (!report) {
            return res.status(404).json({ 
                message: 'Report not found or cannot be deleted (already processed).' 
            });
        }

        res.json({ message: 'Report deleted successfully.' });
    } catch (error) {
        console.error("Delete Feedback Error:", error);
        res.status(500).json({ message: "Server Error" });
    }
};
// --- ADMIN FUNCTIONS ---

const getAllFeedback = async (req, res) => {
    try {
        const examFeedback = await ExamFeedback.find().populate('user', 'name email').populate('test', 'title').sort({ createdAt: -1 }).lean();
        const generalFeedback = await GeneralFeedback.find().populate('user', 'name email').sort({ createdAt: -1 }).lean();
        const questionReports = await QuestionReport.find().populate('userId', 'name email').populate('questionId', 'questionText').populate('testId', 'title').sort({ createdAt: -1 }).lean();

        res.json({ examFeedback, generalFeedback, questionReports });
    } catch (error) {
        console.error("Admin Fetch Error:", error.message);
        res.status(500).send("Server Error");
    }
};

const updateFeedbackStatus = async (req, res) => {
    const { status, type, adminResponse } = req.body; 
    const { id } = req.params;

    try {
        let Model;

        if (type === 'exam') Model = ExamFeedback;
        else if (type === 'general') Model = GeneralFeedback;
        else if (type === 'question') Model = QuestionReport;

        const updateData = { status };
        if (adminResponse !== undefined) updateData.adminResponse = adminResponse;

        // 1. PERFORM UPDATE AND GET THE UPDATED DOCUMENT
        let updatedDoc = await Model.findByIdAndUpdate(id, updateData, { new: true });

        if (!updatedDoc) {
            return res.status(404).json({ message: 'Feedback item not found' });
        }

        // --- 🔔 SEND NOTIFICATION ---
        const targetUserId = updatedDoc.userId || updatedDoc.user; 
        
        if (targetUserId) {
            const notification = new Notification({
                user: targetUserId,
                message: `Your ${type} report has been marked as ${status}. ${adminResponse ? 'Admin note: ' + adminResponse : ''}`,
                link: '/user/feedback',
                type: 'system'
            });
            
            const savedNotification = await notification.save();

            // Real-time socket notification (if user is online)
            if (req.onlineUsers && req.onlineUsers[targetUserId.toString()]) {
                const socketId = req.onlineUsers[targetUserId.toString()];
                req.io.to(socketId).emit("newNotification", savedNotification.toObject());
            }
        }

        // 2. RETURN THE UPDATED DOCUMENT
        res.json(updatedDoc.toObject()); 

    } catch (error) {
        console.error("Update Status Error:", error.message);
        res.status(500).send("Server Error");
    }
};

module.exports = {
    submitExamFeedback,
    submitGeneralFeedback,
    getMyFeedbackHistory,
    reportQuestion,
    getAllFeedback,
    updateFeedbackStatus,
    deleteFeedback
};