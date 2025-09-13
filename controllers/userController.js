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

        if (isSignUp) {
    const allowedDomains = [
        // Google
        'gmail.com',
        // Microsoft
        'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
        // Yahoo
        'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk', 'yahoo.ca',
        // Apple
        'icloud.com', 'me.com', 'mac.com',
        // Other popular providers
        'aol.com', 'zoho.com', 'protonmail.com', 'gmx.com', 'yandex.com'
    ];
    
    const emailDomain = email.split('@')[1];

    if (!allowedDomains.includes(emailDomain)) {
        return res.status(400).json({ 
            // --- UPDATED MESSAGE ---
            message: "To prevent spam, we only allow sign-ups from major email providers like Gmail, Outlook, Yahoo, and iCloud." 
        });
    }
}


        const otpRequestKey = `otp-limit:email:${email}`;
        const otpRequestCount = parseInt(await redis.get(otpRequestKey), 10) || 0;

        // --- MODIFIED RATE LIMIT LOGIC ---
        if (otpRequestCount >= 5) {
            return res.status(429).json({ 
                message: "You have exhausted your daily OTP limit. Please try again after 24 hours or contact support.",
                contact: "contact@nextexams.in"
            });
        }
        
        let user = await User.findOne({ email });
        // ... (your existing user finding/creation logic remains the same) ...
        if (isSignUp) {
            if (user && user.isVerified) { return res.status(400).json({ message: 'User with this email already exists. Please log in.' }); }
            if (!name) { return res.status(400).json({ message: 'First name is required for sign up.' }); }
            if (!user) { user = new User({ name, secondName, email, whatsapp });
            } else { user.name = name; user.secondName = secondName || user.secondName; user.whatsapp = whatsapp || user.whatsapp; }
        } else {
            if (!user || !user.isVerified) { return res.status(404).json({ message: 'No registered user found with this email. Please sign up.' }); }
        }

        const otp = generateOTP();
        user.emailOtp = otp;
        user.emailOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();

        await sendEmailWithRateLimit({
            to: email,
            subject: 'Your NextExams Verification Code',
            html: `<p>Your One-Time Password is: <strong>${otp}</strong>. It is valid for 10 minutes.</p>`,
        });

        // Increment the count and set expiry
        const newCount = await redis.incr(otpRequestKey);
        if (newCount === 1) { // Set expiry only on the first request of the day
            await redis.expire(otpRequestKey, 24 * 60 * 60);
        }
        
        // --- NEW CONDITIONAL RESPONSE ---
        // On the 3rd or 4th attempt, send a warning.
        if (newCount === 3 || newCount === 4) {
            return res.status(200).json({ 
                message: `OTP sent successfully.`,
                warning: `Please be aware, you have used ${newCount} of your 5 daily OTP attempts.`,
                attemptsUsed: newCount,
                attemptsLeft: 5 - newCount
            });
        }

        // For all other successful attempts
        res.status(200).json({ 
            message: `OTP sent successfully to ${email}`,
            attemptsUsed: newCount,
            attemptsLeft: 5 - newCount
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
        
        // Return the same data structure as your old login function
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            token: generateToken(user), // Assuming generateToken uses user object or user._id
            role: user.role,
            passExpiry: user.passExpiry,
            category: user.category,
            primeAccessUntil: user.primeAccessUntil,
        });

    } catch (error) {
        console.error('Verify OTP Error:', error);
        res.status(500).json({ message: 'Server error during verification.' });
    }
};

const googleAuthCallback = async (req, res) => {
  const { code } = req.body;

  console.log("========== GOOGLE AUTH DEBUG ==========");
  console.log(">> Code received:", code);
  console.log("=======================================");

  if (!code) {
    return res.status(400).json({ message: "Missing authorization code" });
  }

  try {
    // 🔴 Hardcode redirectUri here
    const redirectUri = "https://nextexams-api.onrender.com/api/users/auth/google/callback";

    const oAuth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    console.log(">> Using redirect_uri:", redirectUri);

    // ✅ Pass the same redirectUri when exchanging code
    const { tokens } = await oAuth2Client.getToken({
      code,
      redirect_uri: redirectUri,
    });

    oAuth2Client.setCredentials(tokens);

    const ticket = await oAuth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture } = payload;
    const [firstName, ...lastNameParts] = name.split(" ");
    const lastName = lastNameParts.join(" ");

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name: firstName,
        secondName: lastName,
        email,
        profilePicture: picture,
        isVerified: true,
      });
    }

    const appToken = generateToken(user);

    res.status(200).json({
      token: appToken,
      user: {
        id: user._id,
        name: user.name,
        secondName: user.secondName,
        email: user.email,
        profilePicture: user.profilePicture,
      },
    });
  } catch (error) {
    console.error("❌ Google Auth Error:", error.response?.data || error);
    res
      .status(500)
      .json({ message: "Google authentication failed.", error: error.message });
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


const getUserProfile = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      primeAccessUntil: user.primeAccessUntil,
      category: user.category,
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
};

module.exports = {
  sendOtp,         
  verifyOtpAndLogin,
  googleAuthCallback,
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
  getUserProfile
};
