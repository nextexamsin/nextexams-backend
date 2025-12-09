const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const { protect, protectFirebase } = require("../middleware/authMiddleware");
const { authLimiter } = require("../utils/rateLimiter");

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
    getUserAnalytics,
    authWithFirebasePhone,
    sendLinkEmailOtp,
    addContactInfo,
    initiateContactChange,
    verifyContactChange,
    logoutUser, // <--- 1. ADDED THIS IMPORT
} = require("../controllers/userController");

const { getPassHistory } = require("../controllers/passController");

// --- 🔓 Public Routes with Strict Rate Limiting ---

router.post(
    "/send-otp",
    authLimiter, 
    [
        body("email", "Please include a valid email").isEmail().normalizeEmail(),
    ],
    sendOtp
);

router.post(
    "/verify-otp",
    authLimiter, 
    [
        body("email", "Please include a valid email").isEmail().normalizeEmail(),
        body("otp", "OTP must be a 6-digit number").isLength({ min: 6, max: 6 }).isNumeric(),
    ],
    verifyOtpAndLogin
);

// --- 2. ADDED LOGOUT ROUTE HERE ---
// This enables the frontend to POST /api/users/logout
router.post('/logout', logoutUser);

// APPLY the strict limiter to the Google callback as well to prevent abuse
router.post('/auth/google/callback', authLimiter, googleAuthCallback);
router.get('/auth/google/callback', authLimiter, googleAuthCallback);
router.post('/auth/firebase-phone', authLimiter, protectFirebase, authWithFirebasePhone);


// --- 🔐 Protected Routes (User must be logged in) ---

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
router.get('/analytics', protect, getUserAnalytics);
router.post('/profile/send-link-email-otp', protect, sendLinkEmailOtp);
router.patch('/profile/add-contact', protect, addContactInfo);
router.post('/profile/initiate-contact-change', protect, initiateContactChange);
router.post('/profile/verify-contact-change', protect, verifyContactChange);

module.exports = router;


///////


// helo

///////