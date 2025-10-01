// models/testSeriesModel.js

const mongoose = require('mongoose');

// This sub-schema defines the complex, type-based marking scheme.
const markingSchemeSchema = new mongoose.Schema({
    mcq: {
        marks: { type: Number, default: 1 },
        negative: { type: Number, default: 0 }
    },
    multiple: {
        marks: { type: Number, default: 1 },
        negative: { type: Number, default: 0 }
    },
    numerical: {
        marks: { type: Number, default: 1 },
        negative: { type: Number, default: 0 }
    }
}, { _id: false });

const sectionSchema = new mongoose.Schema({
    title: { type: String, required: true },
    questions: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Question',
            required: true,
        }
    ],
    durationInMinutes: { type: Number, default: null },
    
    // Section-level scoring options
    marksPerQuestion: { type: Number, default: null },
    negativeMarking: { type: Number, default: null },
    markingScheme: { type: markingSchemeSchema, default: null },
});

const userAttemptSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    startedAt: { type: Date },
    endedAt: { type: Date },
    isCompleted: { type: Boolean, default: false },
    isPaused: { type: Boolean, default: false },
    attemptNumber: { type: Number, default: 1 },
    answers: [
        {
            questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
            selectedOptions: [String],
            timeTaken: { type: Number }
        }
    ],
    timeLeftInSeconds: { type: Number },
    currentSectionIndex: { type: Number, default: 0 },
    currentQuestionIndex: { type: Number, default: 0 },
    score: { type: Number },
    totalMarks: { type: Number },
    cutoff: {
        UR: { type: Number }, EWS: { type: Number },
        OBC: { type: Number }, SC: { type: Number }, ST: { type: Number }
    }
});


const testSeriesSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    exam: { type: String, required: true },
    subjectTags: [String],
    releaseDate: { type: Date },
    isPaid: { type: Boolean, default: false },
    
    // ✅ CHANGE: Replaced 'isPublished' with a more flexible 'status' field.
    // Every new test will now automatically be a 'draft'.
    status: {
        type: String,
        enum: ['draft', 'published', 'archived'],
        default: 'draft',
    },
    
    testType: {
        type: String,
        enum: ['full-length', 'sectional', 'quiz'],
        default: 'full-length',
    },

    testDurationInMinutes: { type: Number, default: null },
    allowSectionJump: { type: Boolean, default: true },

    marksPerQuestion: { type: Number, default: null },
    negativeMarking: { type: Number, default: null },
    markingScheme: { type: markingSchemeSchema, default: null },

    sections: [sectionSchema],
    attempts: [userAttemptSchema],
    
    cutoff: {
        UR: { type: Number, default: 0 }, EWS: { type: Number, default: 0 },
        OBC: { type: Number, default: 0 }, SC: { type: Number, default: 0 },
        ST: { type: Number, default: 0 },
    },

    totalMarks: { type: Number, default: 0 },

    originalId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestSeries' },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestSeriesGroup' },
}, { timestamps: true });


module.exports = mongoose.model('TestSeries', testSeriesSchema);