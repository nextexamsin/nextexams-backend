const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const { protect, adminOnly } = require("../middleware/authMiddleware");
const rateLimit = require('express-rate-limit');

// NEW: Rate limiter for OTP requests to prevent spamming
const otpLimiter = rateLimit({
	windowMs: 5 * 60 * 1000, // 5 minutes
	max: 5, // Limit each IP to 5 requests per window
	message: 'Too many requests from this IP, please try again after 5 minutes',
	standardHeaders: true,
	legacyHeaders: false,
});

// --- Controller Imports (Updated) ---
const {
    sendOtp,        
    verifyOtpAndLogin, 
    getUserProfile,
    updateUserProfile,
    saveQuestion,
    unsaveQuestion,
    getSavedQuestions,
    enrollInTestSeriesGroup,
    getEnrolledTestSeriesGroups,
    unenrollFromTestSeriesGroup,
    getAttemptedTests,
    getAttemptedSummaries,
    googleAuthCallback,
} = require("../controllers/userController");

const { getPassHistory } = require("../controllers/passController");

// --- Public Routes ---

// The old '/register' and '/login' routes are now removed.

// --- NEW OTP AUTHENTICATION ROUTES ---
router.post(
    "/send-otp",
    otpLimiter, // Apply rate limiting
    [
        body("email", "Please include a valid email").isEmail().normalizeEmail(),
    ],
    sendOtp
);

router.post(
    "/verify-otp",
    otpLimiter, // Use the same limiter
    [
        body("email", "Please include a valid email").isEmail().normalizeEmail(),
        body("otp", "OTP must be a 6-digit number").isLength({ min: 6, max: 6 }).isNumeric(),
    ],
    verifyOtpAndLogin
);


// --- Protected Routes (User must be logged in) ---
// (No changes below this line)

router.route('/profile')
    .get(protect, getUserProfile)
    .patch(
        protect,
        [
            body('name').optional().trim().escape(),
            body('secondName').optional().trim().escape(),
            body('whatsapp').optional().isMobilePhone('en-IN'),
        ],
        updateUserProfile
    );

router.post('/save-question/:questionId', protect, saveQuestion);
router.post('/unsave-question/:questionId', protect, unsaveQuestion);
router.get('/saved-questions', protect, getSavedQuestions);
router.post('/enroll/:groupId', protect, enrollInTestSeriesGroup);
router.get('/enrolled', protect, getEnrolledTestSeriesGroups);
router.post('/unenroll/:groupId', protect, unenrollFromTestSeriesGroup);
router.get('/attempted-tests', protect, getAttemptedTests);
router.get('/attempted-tests-summary', protect, getAttemptedSummaries);
router.get('/profile/pass-history', protect, getPassHistory);
router.get('/auth/google/callback', googleAuthCallback);





module.exports = router;