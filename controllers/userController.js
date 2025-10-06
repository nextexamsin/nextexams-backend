const { validationResult } = require("express-validator");
const mongoose = require('mongoose');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const TestSeries = require('../models/testSeriesModel');
const Question = require('../models/Question');
const addDuration = require('../utils/addDuration');
const ExamFeedback = require('../models/ExamFeedback');
const GeneralFeedback = require('../models/GeneralFeedback');
const PassPurchase = require('../models/PassPurchase');
const { sendEmailWithRateLimit } = require('../utils/rateLimiter');
const Redis = require('ioredis');
const redis = new Redis(process.env.UPSTASH_REDIS_REST_URL, { tls: {} });
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');



// const createAdmin = async (req, res) => {
//     // The email address you want to make an admin
//     const adminEmail = "nextexamsin@gmail.com"; 

//     try {
//         // Find the user by their email
//         const user = await User.findOne({ email: adminEmail });

//         if (!user) {
//             // If the user doesn't exist, send a helpful error message
//             return res.status(404).json({
//                 message: `User with email ${adminEmail} not found. Please sign up with this email first, then run this again.`
//             });
//         }

//         // If the user is found, update their role to 'admin'
//         user.role = 'admin';
//         await user.save();
        
//         res.status(200).json({
//             message: `Success! User ${adminEmail} has been promoted to Admin.`
//         });

//     } catch (error) {
//         console.error("Admin promotion error:", error);
//         res.status(500).json({ message: "Error promoting user to admin" });
//     }
// };


// NEW OTP-BASED AUTHENTICATION FUNCTIONS


// --- THIS IS THE UPDATED "BACKDOOR" LOGIN FUNCTION ---
/**
 * @desc    Log in as a specific user for development purposes ONLY.
 * @route   POST /api/users/dev-login
 * @access  Public (but only enabled in development)
 */
const developerLogin = async (req, res) => {
    // This check ensures this route ONLY works in your local development environment
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).send('Not Found');
    }

    try {
        const { userType } = req.body; // Expects { "userType": "admin" } or { "userType": "user" }

        let devUserEmail;

        if (userType === 'admin') {
            devUserEmail = 'nextexamsin@gmail.com'; // Your admin email
        } else if (userType === 'user') {
            devUserEmail = 'ankitkece@gmail.com'; // Your standard user email
        } else {
            return res.status(400).json({ 
                message: "Invalid userType. Please send 'admin' or 'user' in the request body."
            });
        }

        const user = await User.findOne({ email: devUserEmail });

        if (!user) {
            return res.status(404).json({ 
                message: `Development user with email ${devUserEmail} not found. Please make sure this user exists in your database.`
            });
        }
        
        // Return the same full user object and token as a normal login
        console.log(`✅ Dev login successful as: ${user.email} (${user.role})`);
        res.json({
            _id: user._id,
            name: user.name,
            secondName: user.secondName,
            email: user.email,
            profilePicture: user.profilePicture,
            role: user.role,
            token: generateToken(user._id),
            passExpiry: user.passExpiry,
            category: user.category,
            primeAccessUntil: user.primeAccessUntil,
        });

    } catch (error) {
        console.error("Developer Login Error:", error);
        res.status(500).json({ message: 'Server error during developer login.' });
    }
};


// Function to generate a random 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

/**
 * @desc    Generate and send OTP for login or registration.
 * @route   POST /api/users/send-otp
 */
const sendOtp = async (req, res) => {
    const { email, name, secondName, whatsapp, isSignUp } = req.body;

    if (!email) {
        return res.status(400).json({ message: 'Email is required.' });
    }

    try {
        const adminEmail = "nextexamsin@gmail.com";
        let attemptsData = { attemptsUsed: 0, attemptsLeft: Infinity };

        // --- OTP Limit Logic for Non-Admin Users (Unchanged) ---
        if (email !== adminEmail) {
            const otpRequestKey = `otp-limit:email:${email}`;
            const otpRequestCount = parseInt(await redis.get(otpRequestKey), 10) || 0;

            if (otpRequestCount >= 5) {
                return res.status(429).json({ 
                    message: "You have exhausted your daily OTP limit. Please try again after 24 hours or contact support.",
                    contact: "contact@nextexams.in"
                });
            }
            
            const newCount = await redis.incr(otpRequestKey);
            if (newCount === 1) {
                await redis.expire(otpRequestKey, 24 * 60 * 60);
            }
            attemptsData = { attemptsUsed: newCount, attemptsLeft: 5 - newCount };
        }
        
        // --- Domain Validation for Sign-Up (Unchanged) ---
        if (isSignUp) {
            // ... (your existing domain validation logic is unchanged)
            const allowedDomains = [
                'gmail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
                'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk', 'yahoo.ca',
                'icloud.com', 'me.com', 'mac.com', 'aol.com', 'zoho.com', 
                'protonmail.com', 'gmx.com', 'yandex.com'
            ];
            const emailDomain = email.split('@')[1];
            if (!allowedDomains.includes(emailDomain)) {
                return res.status(400).json({ 
                    message: "To prevent spam, we only allow sign-ups from major email providers like Gmail, Outlook, Yahoo, and iCloud." 
                });
            }
        }

        // --- MODIFIED: Find or Create User Logic ---
        let user = await User.findOne({ email });

        if (isSignUp) {
            // This is the explicit "Sign Up" flow
            if (user && user.isVerified) { return res.status(400).json({ message: 'User with this email already exists. Please log in.' }); }
            if (!name) { return res.status(400).json({ message: 'First name is required for sign up.' }); }
            if (!user) { 
                user = new User({ name, secondName, email, whatsapp });
            } else { 
                user.name = name; 
                user.secondName = secondName || user.secondName; 
                user.whatsapp = whatsapp || user.whatsapp; 
            }
        } else {
            // This is the "Sign In" flow
            if (!user) {
                // --- NEW LOGIC: Implicit Sign-Up ---
                // User doesn't exist, but is trying to sign in. Create them seamlessly.
                const tempName = email.split('@')[0]; // Use email prefix as a temporary name
                user = new User({ name: tempName, email: email });
                console.log(`✅ Implicit sign-up for new email: ${email}`);
            } else if (user.isBlocked) {
                return res.status(403).json({ message: 'Your account is blocked.' });
            }
        }

        // --- Generate, Save, and Send OTP (Unchanged) ---
        const otp = generateOTP();
        user.emailOtp = otp;
        user.emailOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();

        await sendEmailWithRateLimit({
            to: email,
            subject: 'Your NextExams Verification Code',
            html: `<p>Your One-Time Password is: <strong>${otp}</strong>. It is valid for 10 minutes.</p>`,
        });

        // --- Final Response Logic (Unchanged) ---
        const { attemptsUsed } = attemptsData;
        if (email !== adminEmail && (attemptsUsed === 3 || attemptsUsed === 4)) {
            return res.status(200).json({ 
                message: `OTP sent successfully.`,
                warning: `Please be aware, you have used ${attemptsUsed} of your 5 daily OTP attempts.`,
                ...attemptsData
            });
        }

        res.status(200).json({ 
            message: `OTP sent successfully to ${email}`,
            ...attemptsData
        });

    } catch (error) {
        console.error('Send OTP Error:', error);
        res.status(500).json({ message: 'Error sending OTP. Please try again later.' });
    }
};

/**
 * @desc    Verify OTP, log in/register user, and return JWT.
 * @route   POST /api/users/verify-otp
 */
const verifyOtpAndLogin = async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ message: 'Email and OTP are required.' });
    }

    try {
        const user = await User.findOne({
            email,
            emailOtp: otp,
            emailOtpExpires: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired OTP. Please try again.' });
        }
        if (user.isBlocked) {
            return res.status(403).json({ message: 'Your account is blocked' });
        }

        user.isVerified = true;
        user.emailOtp = undefined;
        user.emailOtpExpires = undefined;
        await user.save();
        
        // --- FINALIZED RESPONSE ---
        // Return the user data along with the crucial isProfileComplete flag
        res.json({
            _id: user._id,
            name: user.name,
            secondName: user.secondName,
            email: user.email,
            profilePicture: user.profilePicture,
            whatsapp: user.whatsapp,
            isAdmin: user.isAdmin,
            role: user.role,
            token: generateToken(user),
            passExpiry: user.passExpiry,
            category: user.category,
            primeAccessUntil: user.primeAccessUntil,
            // This flag will be false for a new email-only user, triggering redirection
            isProfileComplete: !!user.whatsapp && !!user.firebaseUid, 
        });

    } catch (error)
 {
        console.error('Verify OTP Error:', error);
        res.status(500).json({ message: 'Server error during verification.' });
    }
};


const googleAuthCallback = async (req, res) => {
    const { code } = req.body;
    if (!code) {
        return res.status(400).json({ message: "Missing authorization code from client." });
    }
    try {
        // --- FINAL CORRECTED INITIALIZATION ---
        // The OAuth2Client must be created with all three parameters at once.
        const oAuth2Client = new OAuth2Client(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_OAUTH_FRONTEND_CALLBACK_URI // Pass the redirect_uri here
        );
        
        // --- The rest of the function continues as normal ---
        const { tokens } = await oAuth2Client.getToken(code);
        
        const ticket = await oAuth2Client.verifyIdToken({
            idToken: tokens.id_token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const { email, name, picture, given_name, family_name } = payload;
        
        let user = await User.findOne({ email });

        if (!user) {
            user = await User.create({
                name: given_name || name.split(' ')[0] || 'User',
                secondName: family_name || name.split(' ')[1] || '',
                email,
                profilePicture: picture,
                isVerified: true,
                authProvider: 'google',
            });
            console.log(`✅ Implicit sign-up for new Google user: ${email}`);
        } else {
            user.profilePicture = user.profilePicture || picture;
            await user.save();
        }

        // Return the unified response
        res.status(200).json({
            _id: user._id,
            name: user.name,
            secondName: user.secondName,
            email: user.email,
            role: user.role,
            profilePicture: user.profilePicture,
            whatsapp: user.whatsapp,
            token: generateToken(user._id),
            isProfileComplete: !!user.whatsapp && !!user.firebaseUid,
            passExpiry: user.passExpiry,
            category: user.category,
            primeAccessUntil: user.primeAccessUntil,
        });

    } catch (error) {
        console.error("❌ GOOGLE AUTH FAILURE:", error.response?.data || error.message || error);
        res.status(500).json({ message: "Google authentication failed on the server." });
    }
};






// --- NEW --- Controller function for Firebase Phone Auth
/**
 * @desc    Authenticate/Register user with Firebase Phone Auth
 * @route   POST /api/users/auth/firebase-phone
 * @access  Private (via protectFirebase middleware)
 */
const authWithFirebasePhone = async (req, res) => {
    const { uid, phone_number } = req.user;
    const { isSignUp, name, secondName } = req.body;
    const whatsappNumber = phone_number.substring(3);

    try {
        let userByFirebaseUid = await User.findOne({ firebaseUid: uid });
        
        if (userByFirebaseUid) {
            if (userByFirebaseUid.isBlocked) {
                return res.status(403).json({ message: 'Your account is blocked.' });
            }
            console.log(`✅ Login via Firebase UID: ${userByFirebaseUid.whatsapp}`);
            return res.json({
                _id: userByFirebaseUid._id, name: userByFirebaseUid.name, secondName: userByFirebaseUid.secondName,
                email: userByFirebaseUid.email, profilePicture: userByFirebaseUid.profilePicture, whatsapp: userByFirebaseUid.whatsapp,
                isAdmin: userByFirebaseUid.isAdmin, role: userByFirebaseUid.role, token: generateToken(userByFirebaseUid._id),
                passExpiry: userByFirebaseUid.passExpiry, category: userByFirebaseUid.category, primeAccessUntil: userByFirebaseUid.primeAccessUntil,
                isProfileComplete: userByFirebaseUid.whatsapp && userByFirebaseUid.email && !userByFirebaseUid.email.includes('@phone.nextexams.in'),
            });
        }

        let userByPhone = await User.findOne({ whatsapp: whatsappNumber });
        
        if (userByPhone) {
            userByPhone.firebaseUid = uid;
            userByPhone.authProvider = 'phone';
            userByPhone.isVerified = true;
            await userByPhone.save();
            
            console.log(`✅ Account Linked: Firebase UID added to existing user ${userByPhone.whatsapp}`);
            return res.json({
                _id: userByPhone._id, name: userByPhone.name, secondName: userByPhone.secondName,
                email: userByPhone.email, profilePicture: userByPhone.profilePicture, whatsapp: userByPhone.whatsapp,
                isAdmin: userByPhone.isAdmin, role: userByPhone.role, token: generateToken(userByPhone._id),
                passExpiry: userByPhone.passExpiry, category: userByPhone.category, primeAccessUntil: userByPhone.primeAccessUntil,
                isProfileComplete: userByPhone.whatsapp && userByPhone.email && !userByPhone.email.includes('@phone.nextexams.in'),
            });
        }

        // --- MODIFIED: Handles both explicit and implicit sign-up for new users ---
        if (isSignUp || (!userByFirebaseUid && !userByPhone)) {
            const tempName = name || `User_${whatsappNumber.slice(-4)}`;
            
            const newUser = await User.create({
                firebaseUid: uid,
                name: tempName,
                secondName,
                email: `${uid}@phone.nextexams.in`,
                whatsapp: whatsappNumber,
                isVerified: true,
                authProvider: 'phone',
            });

            console.log(`✅ New User Signed Up (Implicitly or Explicitly): ${newUser.whatsapp}`);
            return res.status(201).json({
                _id: newUser._id, name: newUser.name, secondName: newUser.secondName,
                email: newUser.email, profilePicture: newUser.profilePicture, whatsapp: newUser.whatsapp,
                isAdmin: newUser.isAdmin, role: newUser.role, token: generateToken(newUser._id),
                passExpiry: newUser.passExpiry, category: newUser.category, primeAccessUntil: newUser.primeAccessUntil,
                isProfileComplete: false, // It's a new phone-only user, so profile is incomplete
            });
        }
        // NOTE: The final "else" block that returned a 404 is no longer needed and has been removed.

    } catch (error) {
        console.error('Firebase Phone Auth Controller Error:', error);
        res.status(500).json({ message: 'Server error during phone authentication.' });
    }
};


// PATCH /api/users/profile
const updateUserProfile = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { name, secondName, category } = req.body;

    if (name) user.name = name;
    if (secondName !== undefined) user.secondName = secondName;
    if (category && ['UR', 'EWS', 'OBC', 'SC', 'ST'].includes(category)) {
      user.category = category;
    }

    await user.save();

    res.json({
      _id: user._id,
      name: user.name,
      secondName: user.secondName,
      category: user.category,
      email: user.email,
      role: user.role,
    });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ message: 'Failed to update profile' });
  }
};

// --- START: MODIFIED FUNCTION ---

const listUsers = async (req, res) => {
  try {
    // Destructure all query params, including the new 'activity' filter
    const { search = '', status, activity } = req.query;
    
    // Get the onlineUsers list from the request object (attached in server.js)
    const onlineUsers = req.onlineUsers || {};

    const query = {};

    // --- Database Query Stage ---
    // This part is similar to your old logic, but simplified.
    // We build a query to filter users in the database first.
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { secondName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { whatsapp: { $regex: search, $options: 'i' } },
      ];
    }
    
    if (status === 'prime') {
      query.primeAccessUntil = { $exists: true, $ne: null, $gte: new Date() };
    } else if (status === 'free') {
      query.primeAccessUntil = { $eq: null };
    }

    // Fetch users from DB. .lean() is a performance optimization for read-only queries.
    const usersFromDb = await User.find(query)
      .select('name secondName email whatsapp isBlocked primeAccessUntil joinedAt')
      .sort({ joinedAt: -1 })
      .lean();

    // --- In-Memory Processing Stage ---
    // Now, we process the results to add the live status and apply the activity filter.

    // 1. Add an 'isOnline' property to each user by checking against the live onlineUsers list
    let usersWithStatus = usersFromDb.map(user => ({
      ...user,
      // The user is online if their ID is a key in the onlineUsers object
      isOnline: onlineUsers.hasOwnProperty(user._id.toString())
    }));

    // 2. If the activity filter is used, filter the results in memory
    if (activity) {
      if (activity === 'active') {
        usersWithStatus = usersWithStatus.filter(user => user.isOnline);
      } else if (activity === 'inactive') {
        usersWithStatus = usersWithStatus.filter(user => !user.isOnline);
      }
    }

    res.json(usersWithStatus);

  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
};

// --- END: MODIFIED FUNCTION ---

const getUserDetails = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('enrolledGroups').populate('savedQuestions');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      _id: user._id,
      name: user.name,
      secondName: user.secondName,
      email: user.email,
      whatsapp: user.whatsapp,
      joinedAt: user.joinedAt,
      isBlocked: user.isBlocked,
      primeAccessUntil: user.primeAccessUntil,
      enrolledGroups: user.enrolledGroups,
      savedQuestions: user.savedQuestions,
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch user details' });
  }
};

// -------------------------------------------------------------------
// (No changes needed for the functions below, they remain the same)
// -------------------------------------------------------------------

const getUserStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const attempted = await TestSeries.aggregate([
      { $unwind: "$attempts" },
      { $match: { "attempts.userId": new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ["$attempts.isCompleted", true] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ["$attempts.isCompleted", false] }, 1, 0] } },
        },
      },
    ]);
    const stats = attempted[0] || { total: 0, completed: 0, inProgress: 0 };
    const fullName = req.user.name + (req.user.secondName ? ' ' + req.user.secondName : '');
    res.json({
      name: fullName,
      email: req.user.email,
      role: req.user.role,
      passExpiry: req.user.passExpiry,
      primeAccessUntil: req.user.primeAccessUntil,
      category: req.user.category,
      stats,
    });
  } catch (err) {
    console.error("User stats error:", err);
    res.status(500).json({ message: 'Failed to load user stats' });
  }
};

const saveQuestion = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const { questionId } = req.params;
    if (!user.savedQuestions.includes(questionId)) {
      user.savedQuestions.push(questionId);
      await user.save();
    }
    res.status(200).json({ success: true, savedQuestions: user.savedQuestions });
  } catch (err) {
    res.status(500).json({ message: 'Failed to save question' });
  }
};

const unsaveQuestion = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const { questionId } = req.params;
    user.savedQuestions = user.savedQuestions.filter((id) => id.toString() !== questionId);
    await user.save();
    res.status(200).json({ success: true, savedQuestions: user.savedQuestions });
  } catch (err) {
    res.status(500).json({ message: 'Failed to unsave question' });
  }
};

const getSavedQuestions = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('savedQuestions');
    res.status(200).json(user.savedQuestions);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch saved questions' });
  }
};

const enrollInTestSeriesGroup = async (req, res) => {
  try {
    const userId = req.user._id;
    const groupId = req.params.groupId;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.enrolledGroups.includes(groupId)) {
      return res.status(400).json({ message: 'Already enrolled' });
    }
    user.enrolledGroups.push(groupId);
    await user.save();
    res.json({ message: 'Enrolled successfully', enrolledGroups: user.enrolledGroups });
  } catch (err) {
    console.error('Enroll error:', err);
    res.status(500).json({ message: 'Enrollment failed' });
  }
};

const getEnrolledTestSeriesGroups = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'enrolledGroups',
      populate: {
        path: 'testSeries',
        select: 'title isPaid',
      },
    });
    res.json(user.enrolledGroups || []);
  } catch (err) {
    console.error('Fetch enrolled groups error:', err);
    res.status(500).json({ message: 'Failed to fetch enrolled groups' });
  }
};

const unenrollFromTestSeriesGroup = async (req, res) => {
  try {
    const userId = req.user._id;
    const groupId = req.params.groupId;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.enrolledGroups = user.enrolledGroups.filter((gId) => gId.toString() !== groupId);
    await user.save();
    res.json({ message: 'Unenrolled successfully', enrolledGroups: user.enrolledGroups });
  } catch (err) {
    console.error('Unenroll error:', err);
    res.status(500).json({ message: 'Unenrollment failed' });
  }
};

const getAttemptedTests = async (req, res) => {
  try {
    const userId = req.user._id;
    const attemptedTests = await TestSeries.aggregate([
      { $unwind: "$attempts" },
      { $match: { "attempts.userId": new mongoose.Types.ObjectId(userId) } },
      {
        $project: {
          _id: 0,
          testId: "$_id",
          testTitle: "$title",
          groupId: "$groupId",
          rank: "$attempts.rank",
          marks: "$attempts.score",
          totalMarks: { $sum: { $map: { input: "$sections", as: "section", in: { $multiply: [{ $size: "$$section.questions" }, "$$section.marksPerQuestion"] } } } },
          endedAt: "$attempts.endedAt",
          attemptNumber: "$attempts.attemptNumber",
          cutoff: "$cutoff",
        }
      },
      { $sort: { endedAt: -1 } }
    ]);
    res.json(attemptedTests);
  } catch (err) {
    console.error("getAttemptedTests error:", err);
    res.status(500).json({ message: "Failed to fetch attempted tests" });
  }
};

const getAttemptedSummaries = async (req, res) => {
  try {
    const userId = req.user._id;
    const tests = await TestSeries.find({ "attempts.userId": new mongoose.Types.ObjectId(userId) }).select('title attempts cutoff isPaid');
    const summaries = [];
    for (const test of tests) {
      const userAttemptsInTest = test.attempts.filter(a => a.userId.toString() === userId.toString());
      for (const userAttempt of userAttemptsInTest) {
        let userRank = '-';
        let totalUsersInAttempt = 0;
        if (userAttempt.isCompleted) {
          const leaderboard = test.attempts.filter(a => a.isCompleted && a.attemptNumber === userAttempt.attemptNumber).sort((a, b) => (b.score || 0) - (a.score || 0));
          totalUsersInAttempt = leaderboard.length;
          const rankIndex = leaderboard.findIndex(u => u._id.equals(userAttempt._id));
          userRank = rankIndex > -1 ? rankIndex + 1 : '-';
        }
        summaries.push({
          _id: userAttempt._id,
          testId: test._id,
          testTitle: test.title,
          attemptNumber: userAttempt.attemptNumber,
          endedAt: userAttempt.endedAt,
          marks: userAttempt.score,
          totalMarks: userAttempt.totalMarks,
          cutoff: test.cutoff,
          rank: userRank,
          totalUsers: totalUsersInAttempt,
          isPaid: test.isPaid,
        });
      }
    }
    summaries.sort((a, b) => {
      const dateA = a.endedAt ? new Date(a.endedAt) : new Date();
      const dateB = b.endedAt ? new Date(b.endedAt) : new Date();
      return dateB.getTime() - dateA.getTime();
    });
    res.json(summaries);
  } catch (err) {
    console.error('getAttemptedSummaries Error:', err);
    res.status(500).json({ message: 'Error fetching attempted tests summary' });
  }
};

const toggleBlockUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.isBlocked = !user.isBlocked;
    await user.save();
    res.json({ message: `User ${user.isBlocked ? 'blocked' : 'unblocked'}` });
  } catch (err) {
    res.status(500).json({ message: 'Failed to toggle block' });
  }
};

const grantPrimeAccess = async (req, res) => {
  try {
    const { duration } = req.body;
    const userId = req.params.id;
    const validDurations = ['1day', '1week', '1month', '6months'];
    if (!duration || !validDurations.includes(duration)) {
      return res.status(400).json({ message: 'Invalid or missing duration provided.' });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    let startDateForExtension;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (user.passExpiry && new Date(user.passExpiry) > today) {
      startDateForExtension = user.passExpiry;
    } else {
      startDateForExtension = new Date();
    }
    const newExpiry = addDuration(startDateForExtension, duration);
    const purchaseLog = new PassPurchase({
      userId,
      duration,
      expiryDate: newExpiry,
    });
    await purchaseLog.save();
    user.passExpiry = newExpiry;
    user.primeAccessUntil = newExpiry;
    await user.save();
    res.json({
      message: `Pass for ${duration} granted successfully.`,
      passExpiry: user.passExpiry,
      currentServerTime: new Date()
    });
  } catch (err) {
    console.error("Grant Access Error:", err);
    res.status(500).json({ message: 'Failed to grant access' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete user' });
  }
};

const getFeedback = async (req, res) => {
  try {
    const examFeedback = await ExamFeedback.find({}).populate('user', 'name email').populate('test', 'title').sort({ createdAt: -1 });
    const generalFeedback = await GeneralFeedback.find({}).populate('user', 'name email').sort({ createdAt: -1 });
    res.status(200).json({ examFeedback, generalFeedback });
  } catch (error) {
    console.error("Error fetching feedback:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const updateFeedbackStatus = async (req, res) => {
  const { status, type } = req.body;
  const { id } = req.params;
  if (!status || !type || !['Pending', 'In Progress', 'Resolved', 'Dismissed'].includes(status)) {
    return res.status(400).json({ message: "Invalid status or type provided." });
  }
  try {
    let feedback;
    const Model = type === 'exam' ? ExamFeedback : GeneralFeedback;
    feedback = await Model.findById(id);
    if (!feedback) {
      return res.status(404).json({ message: 'Feedback not found' });
    }
    feedback.status = status;
    await feedback.save();
    res.status(200).json(feedback);
  } catch (error) {
    console.error("Error updating feedback status:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

/**
 * @desc     Get all profile data for the logged-in user, including test stats.
 * @route    GET /api/users/profile
 * @access   Private
 */


const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).lean();

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // We no longer need the 'stats' object
        res.json({
            _id: user._id,
            name: user.name,
            secondName: user.secondName || '',
            email: user.email,
            profilePicture: user.profilePicture,
            role: user.role,
            primeAccessUntil: user.primeAccessUntil,
            passExpiry: user.passExpiry,
            category: user.category || 'UR',
        });
    } catch (error) {
        console.error("Get Profile Error:", error);
        res.status(500).json({ message: "Server error while fetching user profile." });
    }
};


const getUserAnalytics = async (req, res) => {
    try {
        const userId = req.user._id;

        // Query 1: Get all COMPLETED attempts and their associated data
        const testsWithCompletedAttempts = await TestSeries.find({
            'attempts.userId': userId,
            'attempts.isCompleted': true
        })
        .populate({
            path: 'sections.questions',
            model: 'Question',
            select: 'subject topic correctOptions'
        })
        .lean();
        
        // --- FIX 1: Add a new query to count in-progress tests ---
        const inProgressCount = await TestSeries.countDocuments({
            'attempts.userId': userId,
            'attempts.isCompleted': false
        });

        // If there are no attempts at all, return a default empty state
        if (testsWithCompletedAttempts.length === 0 && inProgressCount === 0) {
            return res.json({
                overallStats: { totalTestsAttempted: 0, completedTests: 0, inProgressTests: 0, averageScore: 0, overallAccuracy: 0 },
                performanceTrend: [],
                subjectWisePerformance: [],
                topicWisePerformance: [],
            });
        }

        let completedAttempts = [];
        testsWithCompletedAttempts.forEach(test => {
            test.attempts.forEach(attempt => {
                if (attempt.isCompleted && String(attempt.userId) === String(userId)) {
                    completedAttempts.push({
                        ...attempt,
                        testName: test.title,
                        questionsData: test.sections.flatMap(s => s.questions)
                    });
                }
            });
        });
        
        // --- FIX 2: Correctly calculate all stats ---
        const completedTestsCount = completedAttempts.length;
        const totalTestsAttempted = completedTestsCount + inProgressCount;
        
        const totalScore = completedAttempts.reduce((sum, a) => sum + (a.score || 0), 0);
        const totalPossibleMarks = completedAttempts.reduce((sum, a) => sum + (a.totalMarks || 0), 0);
        const overallAccuracy = totalPossibleMarks > 0 ? (totalScore / totalPossibleMarks) * 100 : 0;

        const overallStats = {
            totalTestsAttempted,
            completedTests: completedTestsCount,
            inProgressTests: inProgressCount,
            averageScore: completedTestsCount > 0 ? (totalScore / completedTestsCount) : 0,
            overallAccuracy,
        };

        // --- The rest of the function remains the same ---
        const performanceTrend = completedAttempts
            .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))
            .slice(0, 10)
            .map(a => ({
                testName: a.testName,
                score: a.score || 0,
                accuracy: a.totalMarks > 0 ? ((a.score || 0) / a.totalMarks) * 100 : 0,
                endedAt: a.endedAt
            }))
            .reverse();

        const performanceBySubject = {};
        const performanceByTopic = {};

        completedAttempts.forEach(attempt => {
            (attempt.answers || []).forEach(answer => {
                const question = (attempt.questionsData || []).find(q => q && String(q._id) === String(answer.questionId));
                if (!question || !question.subject || !question.topic) return;

                const subject = question.subject;
                const topic = question.topic;
                
                const correct = (question.correctOptions ?? []).sort();
                const selected = (answer.selectedOptions || []).sort();
                const isCorrect = correct.length === selected.length && correct.every((value, index) => value === selected[index]);

                if (!performanceBySubject[subject]) performanceBySubject[subject] = { correct: 0, total: 0 };
                if (!performanceByTopic[topic]) performanceByTopic[topic] = { correct: 0, total: 0, subject: subject };

                performanceBySubject[subject].total++;
                performanceByTopic[topic].total++;
                if (isCorrect) {
                    performanceBySubject[subject].correct++;
                    performanceByTopic[topic].correct++;
                }
            });
        });
        
        const subjectWisePerformance = Object.entries(performanceBySubject).map(([subject, data]) => ({
            subject,
            accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
            questionsAttempted: data.total,
        })).sort((a, b) => b.accuracy - a.accuracy);

        const topicWisePerformance = Object.entries(performanceByTopic).map(([topic, data]) => ({
            topic,
            subject: data.subject,
            accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
            correct: data.correct,
            total: data.total,
        })).sort((a, b) => a.accuracy - b.accuracy);

        const analyticsData = {
            overallStats,
            performanceTrend,
            subjectWisePerformance,
            topicWisePerformance,
        };

        res.json(analyticsData);

    } catch (err) {
        console.error("Get User Analytics Error:", err);
        res.status(500).json({ message: "Server error while fetching analytics." });
    }
};

/**
 * @desc    Sends an OTP to a new email address for an existing, logged-in user.
 * @route   POST /api/users/profile/send-link-email-otp
 * @access  Private
 */
const sendLinkEmailOtp = async (req, res) => {
    const { email } = req.body;
    const userId = req.user._id;

    if (!email) {
        return res.status(400).json({ message: 'Email is required.' });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Check if the new email is already in use by another account
        const emailExists = await User.findOne({ email });
        if (emailExists) {
            return res.status(400).json({ message: 'This email is already registered to another account.' });
        }

        const otp = generateOTP();
        user.emailOtp = otp;
        user.emailOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minute expiry
        await user.save();

        await sendEmailWithRateLimit({
            to: email,
            subject: 'Your NextExams Verification Code',
            html: `<p>Your One-Time Password to link this email to your account is: <strong>${otp}</strong>. It is valid for 10 minutes.</p>`,
        });

        res.status(200).json({ message: 'OTP sent successfully.' });

    } catch (error) {
        console.error('Send Link Email OTP Error:', error);
        res.status(500).json({ message: 'Error sending OTP.' });
    }
};


// Paste this new function into your file

/**
 * @desc    Add and verify a missing contact method (email or phone) to an existing user's profile
 * @route   PATCH /api/users/profile/add-contact
 * @access  Private (requires user to be logged in)
 */
const addContactInfo = async (req, res) => {
    // req.user comes from the 'protect' middleware, so we know who is logged in
    const userId = req.user._id;
    // Get all possible data from the frontend request body
    const { email, otp, firebaseIdToken, name, secondName } = req.body;

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // --- UPDATE NAME AND SECOND NAME (if provided) ---
        if (name) {
            user.name = name;
        }
        if (secondName !== undefined) { // Check for undefined to allow setting an empty string
            user.secondName = secondName;
        }

        // --- CASE 1: USER IS ADDING AND VERIFYING THEIR EMAIL ---
        if (email && otp) {
            if (user.emailOtp !== otp || !user.emailOtpExpires || user.emailOtpExpires < Date.now()) {
                return res.status(400).json({ message: 'Invalid or expired email OTP.' });
            }
            const existingEmailUser = await User.findOne({ email });
            if (existingEmailUser) {
                return res.status(400).json({ message: 'This email is already registered to another account.' });
            }

            user.email = email;
            user.emailOtp = undefined;
            user.emailOtpExpires = undefined;
        }
        // --- CASE 2: USER IS ADDING AND VERIFYING THEIR PHONE ---
        else if (firebaseIdToken) {
            // This part is for the future, if an email user needs to add a phone
            // You can leave this logic here for when you build that feature
            const admin = require('firebase-admin'); // Local require for Firebase Admin
            const decodedToken = await admin.auth().verifyIdToken(firebaseIdToken);
            const { uid, phone_number } = decodedToken;
            const whatsappNumber = phone_number.substring(3);

            const existingPhoneUser = await User.findOne({ whatsapp: whatsappNumber });
            if (existingPhoneUser) {
                return res.status(400).json({ message: 'This phone number is already registered to another account.' });
            }

            user.firebaseUid = uid;
            user.whatsapp = whatsappNumber;
        } else {
             // If they are only updating their name without adding a contact
            if (!name && secondName === undefined) {
                 return res.status(400).json({ message: 'Invalid request. Please provide contact information to link.' });
            }
        }

        await user.save();
        // Return the complete, updated user object
        res.json({ message: 'Profile updated successfully!', user });

    } catch (error) {
        console.error('Add Contact Info Error:', error);
        // Add more specific error handling for invalid Firebase tokens
        if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
            return res.status(401).json({ message: 'Invalid or expired phone verification session.' });
        }
        res.status(500).json({ message: 'Server error while updating profile.' });
    }
};

/**
 * @desc    Initiates a change of a primary contact method (email or phone)
 * @route   POST /api/users/profile/initiate-contact-change
 * @access  Private
 */
const initiateContactChange = async (req, res) => {
    const { changeType, newValue } = req.body; // changeType will be 'email' or 'phone'
    const userId = req.user._id;

    if (!changeType || !newValue) {
        return res.status(400).json({ message: "Change type and new value are required." });
    }

    try {
        // Check if the new email or phone is already in use by another account
        const query = (changeType === 'email') ? { email: newValue } : { whatsapp: newValue };
        const existingUser = await User.findOne(query);
        if (existingUser && existingUser._id.toString() !== userId.toString()) {
            return res.status(400).json({ message: `This ${changeType} is already associated with another account.` });
        }

        const user = await User.findById(userId);
        const otp = generateOTP();

        // Send OTP to the NEW contact method
        if (changeType === 'email') {
            await sendEmailWithRateLimit({
                to: newValue,
                subject: 'Verify Your New Email Address',
                html: `<p>Your verification code to change your email is: <strong>${otp}</strong>.</p>`,
            });
        } else {
            // Placeholder for sending SMS OTP via Firebase/Twilio etc.
            // For now, we assume this is handled on the frontend for phone changes.
            return res.status(501).json({ message: "Phone number changes are not yet implemented." });
        }
        
        // Store the pending change on the user document
        user.pendingContactChange = {
            changeType,
            newValue,
            otp,
            expires: new Date(Date.now() + 10 * 60 * 1000), // OTP expires in 10 minutes
        };
        await user.save();

        res.json({ message: `Verification OTP has been sent to ${newValue}.` });

    } catch (error) {
        console.error("Initiate Contact Change Error:", error);
        res.status(500).json({ message: "Server error while initiating change." });
    }
};


/**
 * @desc    Verifies an OTP to finalize a contact method change
 * @route   POST /api/users/profile/verify-contact-change
 * @access  Private
 */
const verifyContactChange = async (req, res) => {
    const { otp } = req.body;
    const userId = req.user._id;

    if (!otp) {
        return res.status(400).json({ message: "OTP is required." });
    }

    try {
        const user = await User.findById(userId);

        if (!user.pendingContactChange || !user.pendingContactChange.otp) {
            return res.status(400).json({ message: "No pending change request found." });
        }

        const { changeType, newValue, expires } = user.pendingContactChange;

        if (user.pendingContactChange.otp !== otp || expires < Date.now()) {
            return res.status(400).json({ message: "Invalid or expired OTP." });
        }

        // Add the old value to history
        user.contactHistory.push({
            changeType,
            oldValue: user[changeType], // user['email'] or user['whatsapp']
        });

        // Update the primary contact field
        if (changeType === 'email') {
            user.email = newValue;
        } else if (changeType === 'phone') {
            user.whatsapp = newValue;
            // You might need to update firebaseUid here as well if the new number is verified via Firebase
        }
        
        // Clear the pending change
        user.pendingContactChange = undefined;
        await user.save();

        // Return the full, updated profile
        res.json({ 
            message: `${changeType.charAt(0).toUpperCase() + changeType.slice(1)} updated successfully.`,
            profile: {
                _id: user._id, name: user.name, secondName: user.secondName,
                email: user.email, profilePicture: user.profilePicture, role: user.role,
                primeAccessUntil: user.primeAccessUntil, passExpiry: user.passExpiry,
                category: user.category,
            }
        });

    } catch (error) {
        console.error("Verify Contact Change Error:", error);
        res.status(500).json({ message: "Server error while verifying change." });
    }
};


module.exports = {
  sendOtp,         
  verifyOtpAndLogin,
  googleAuthCallback,
   authWithFirebasePhone,
  // createAdmin,
  getUserStats,
  saveQuestion,
  unsaveQuestion,
  getSavedQuestions,
  enrollInTestSeriesGroup,
  getEnrolledTestSeriesGroups,
  unenrollFromTestSeriesGroup,
  getAttemptedTests,
  updateUserProfile,
  getAttemptedSummaries,
  listUsers,
  getUserDetails,
  toggleBlockUser,
  deleteUser,
  grantPrimeAccess,
  getFeedback,
  updateFeedbackStatus,
  getUserProfile,
  developerLogin,
  getUserAnalytics,
  sendLinkEmailOtp,
  addContactInfo,
  initiateContactChange,
  verifyContactChange,
};
