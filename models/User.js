const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    secondName: { type: String, required: false },
    email: { type: String, unique: true, required: true },
    profilePicture: { type: String },

     firebaseUid: {
        type: String,
        unique: true,
        sparse: true
    },

    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    passExpiry: { type: Date },
    whatsapp: { type: String, unique: true, sparse: true },
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
    isVerified: {
        type: Boolean,
        default: false
    },
    isPhoneVerified: {
        type: Boolean,
        default: false
    },
    emailOtp: {
        type: String,
        default: null
    },
    emailOtpExpires: {
        type: Date,
        default: null
    },

    pendingContactChange: {
        changeType: { type: String, enum: ['email', 'phone'] },
        newValue: { type: String },
        otp: { type: String },
        expires: { type: Date }
    },

    // Add this field to keep a history of old contact info
    contactHistory: [{
        changeType: { type: String, enum: ['email', 'phone'] },
        oldValue: { type: String },
        changedAt: { type: Date, default: Date.now }
    }],

    
    // Add authProvider to track how the user signed up
    authProvider: {
        type: String,
        enum: ['email', 'google', 'phone'],
        default: 'email'
    }
});

module.exports = mongoose.model('User', userSchema);
