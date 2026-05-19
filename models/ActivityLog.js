const mongoose = require('mongoose');
const logConn = require('../config/dbLog');

const activityLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    event: { type: String, required: true }, // e.g., 'TEST_STARTED', 'TEST_FINISHED', 'TAB_SWITCHED'
    
    // ✅ NEW: Top-level flag for fast filtering of live test logs
    isLiveEvent: { type: Boolean, default: false }, 
    
    metadata: { type: Object }, // Store testId, marks, attemptId, isResultPending, etc.
    ip: String,
    userAgent: String,
    timestamp: { type: Date, default: Date.now }
}, { timestamps: false });

// Index for finding cheating/suspicious events during a specific live test time window
activityLogSchema.index({ isLiveEvent: 1, event: 1, timestamp: -1 });

// Compile model on the secondary connection
const ActivityLog = logConn.model('ActivityLog', activityLogSchema);

module.exports = ActivityLog;