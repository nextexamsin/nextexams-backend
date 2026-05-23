const mongoose = require('mongoose');

const testAttemptSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    testSeriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestSeries', required: true, index: true },
    
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date },
    isCompleted: { type: Boolean, default: false },
    isPaused: { type: Boolean, default: false },
    attemptNumber: { type: Number, default: 1 },
    
    answers: [
        {
            questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
            selectedOptions: [String],
            timeTaken: { type: Number, default: 0 },
            isMarked: { type: Boolean, default: false },
            isVisited: { type: Boolean, default: false }
        }
    ],
    
    timeLeftInSeconds: { type: Number },
    currentSectionIndex: { type: Number, default: 0 },
    currentQuestionIndex: { type: Number, default: 0 },
    
    score: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },
    cutoff: { UR: Number, EWS: Number, OBC: Number, SC: Number, ST: Number },

    isLiveAttempt: { type: Boolean, default: false },
    isResultPending: { type: Boolean, default: false },
    rank: { type: Number, default: null },
    percentile: { type: Number, default: null }

}, { timestamps: true });

// Existing compound indexes
testAttemptSchema.index({ testSeriesId: 1, userId: 1 });
testAttemptSchema.index({ testSeriesId: 1, isCompleted: 1, score: -1 });
testAttemptSchema.index({ userId: 1, updatedAt: -1 });

// 🚀 NEW HIGH-PERFORMANCE INDEXES
testAttemptSchema.index({ testSeriesId: 1, isCompleted: 1 });
testAttemptSchema.index({ userId: 1, isCompleted: 1 });
testAttemptSchema.index({ testSeriesId: 1, attemptNumber: 1, score: -1 });
testAttemptSchema.index({ userId: 1, createdAt: -1 });
testAttemptSchema.index({ isCompleted: 1, attemptNumber: 1 });

module.exports = mongoose.model('TestAttempt', testAttemptSchema);