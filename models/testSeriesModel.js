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

    // Languages allowed in this specific section
    languages: {
        type: [String],
        enum: ['en', 'hi'],
        default: ['en'] 
    }
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
    
    // Legacy generic tags (Keep this for extra metadata)
    subjectTags: [String],

    // ✅ NEW: Global Book Tags (Matches with Book.tags)
    tags: { 
        type: [String], 
        default: [] 
    },

    // ✅ NEW: Level 3 Filter (Subject)
    // Stores "physics", "gk", etc. directly as a string.
    subject: { 
        type: String, 
        trim: true,
        lowercase: true,
        default: null 
    },

    filter1: { 
        type: String, 
        trim: true, 
        default: null 
    },

    releaseDate: { type: Date },
    isPaid: { type: Boolean, default: false },
    
    status: {
        type: String,
        enum: ['draft', 'published', 'archived'],
        default: 'draft',
    },
    
    // Level 1 Filter: Test Type
    testType: {
        type: String,
        enum: ['full-length', 'sectional', 'quiz'],
        default: 'full-length',
        index: true // ✅ Indexed for faster filtering
    },

    // ✅ NEW: Level 2 Filter (Sub Category)
    // Stores "5min", "10min", "Mock", "PYQ" directly as a string.
    subCategory: {
        type: String,
        trim: true,
        default: null,
        index: true // ✅ Indexed for faster filtering
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

// Compound index to speed up the "Filter inside Filter" queries
testSeriesSchema.index({ testType: 1, subCategory: 1, subject: 1, filter1: 1 });

module.exports = mongoose.model('TestSeries', testSeriesSchema);