const mongoose = require('mongoose');
const logConn = require('../config/dbLog');

const activityLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    event: { type: String, required: true }, // e.g., 'TEST_STARTED', 'TEST_FINISHED'
    metadata: { type: Object }, // Store testId, marks, etc.
    ip: String,
    userAgent: String,
    timestamp: { type: Date, default: Date.now }
}, { timestamps: false });

// Compile model on the secondary connection
const ActivityLog = logConn.model('ActivityLog', activityLogSchema);

module.exports = ActivityLog;