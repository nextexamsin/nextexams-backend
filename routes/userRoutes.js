const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const { protect } = require("../middleware/authMiddleware");

// --- (CHANGE 1) REMOVE the old inline rate limiter ---
// const rateLimit = require('express-rate-limit'); // No longer needed here
// const otpLimiter = rateLimit({ ... }); // This is now handled centrally

// --- (CHANGE 2) IMPORT the new authLimiter from our utils file ---
const { authLimiter } = require("../utils/rateLimiter");

// --- Controller Imports ---
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
    completeGoogleSignup,
     developerLogin,
} = require("../controllers/userController");

const { getPassHistory } = require("../controllers/passController");

// --- 🔓 Public Routes with Strict Rate Limiting ---

router.post(
    "/send-otp",
    authLimiter, // (CHANGE 3) APPLY the new, centralized limiter
    [
        body("email", "Please include a valid email").isEmail().normalizeEmail(),
    ],
    sendOtp
);

router.post(
    "/verify-otp",
    authLimiter, // APPLY the same strict limiter here
    [
        body("email", "Please include a valid email").isEmail().normalizeEmail(),
        body("otp", "OTP must be a 6-digit number").isLength({ min: 6, max: 6 }).isNumeric(),
    ],
    verifyOtpAndLogin
);
router.post('/complete-google-signup', completeGoogleSignup);

// APPLY the strict limiter to the Google callback as well to prevent abuse
router.post('/auth/google/callback', authLimiter, googleAuthCallback);
router.get('/auth/google/callback', authLimiter, googleAuthCallback);


// --- 🔐 Protected Routes (User must be logged in) ---
// These routes are now covered by the more generous `apiLimiter` in server.js,
// so no additional limiters are needed here.

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

router.post('/dev-login', developerLogin);
router.post('/save-question/:questionId', protect, saveQuestion);
router.post('/unsave-question/:questionId', protect, unsaveQuestion);
router.get('/saved-questions', protect, getSavedQuestions);
router.post('/enroll/:groupId', protect, enrollInTestSeriesGroup);
router.get('/enrolled', protect, getEnrolledTestSeriesGroups);
router.post('/unenroll/:groupId', protect, unenrollFromTestSeriesGroup);
router.get('/attempted-tests', protect, getAttemptedTests);
router.get('/attempted-tests-summary', protect, getAttemptedSummaries);
router.get('/profile/pass-history', protect, getPassHistory);

module.exports = router;

