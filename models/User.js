// nextExams-backend/models/User.js

const mongoose = require('mongoose');
// const bcrypt = require('bcryptjs'); // <-- REMOVED: No longer needed for OTP auth

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    secondName: { type: String, required: false },
    email: { type: String, unique: true, required: true },
    // password: { type: String, required: true }, // <-- REMOVED: Replaced by OTP
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    passExpiry: { type: Date },
    whatsapp: { type: String, unique: true }, // Note: 'required' might be too strict if it's optional on the signup form
    countryCode: { type: String, default: "+91" },
    isBlocked: { type: Boolean, default: false },
    primeAccessUntil: { type: Date, default: null },
    joinedAt: { type: Date, default: Date.now },
    category: {
        type: String,
        enum: ['UR', 'EWS', 'OBC', 'SC', 'ST'],
        default: 'UR'
    },
    savedQuestions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    enrolledGroups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TestSeriesGroup' }],

    // --- NEW FIELDS FOR OTP AUTHENTICATION ---
    isVerified: {
        type: Boolean,
        default: false // Tracks if the user has confirmed their email at least once
    },
    emailOtp: {
        type: String,
        default: null
    },
    emailOtpExpires: {
        type: Date,
        default: null
    },
});



module.exports = mongoose.model('User', userSchema);