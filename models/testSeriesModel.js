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


const testSeriesSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    exam: { type: String, required: true },
    
    subjectTags: [String],

    tags: { 
        type: [String], 
        default: [] 
    },

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
    
    testType: {
        type: String,
        enum: ['full-length', 'sectional', 'quiz'],
        default: 'full-length',
        index: true 
    },

    subCategory: {
        type: String,
        trim: true,
        default: null,
        index: true 
    },

    testDurationInMinutes: { type: Number, default: null },
    allowSectionJump: { type: Boolean, default: true },

    marksPerQuestion: { type: Number, default: null },
    negativeMarking: { type: Number, default: null },
    markingScheme: { type: markingSchemeSchema, default: null },

    // ✅ NEW: LIVE TEST CONFIGURATION
    isLiveTest: { type: Boolean, default: false },
    liveTestType: { 
        type: String, 
        enum: ['fixed', 'flexible'], // Fixed = exact start/end time. Flexible = anytime within window
        default: 'flexible'
    },
    liveTestStatus: {
        type: String,
        enum: ['Upcoming', 'RegistrationOpen', 'Live', 'Completed', 'ResultsPublished'],
        default: 'Upcoming'
    },
    registrationStartTime: { type: Date, default: null },
    registrationEndTime: { type: Date, default: null },
    testWindowStartTime: { type: Date, default: null },
    testWindowEndTime: { type: Date, default: null },
    resultPublishTime: { type: Date, default: null },
    registeredUsersCount: { type: Number, default: 0 }, // Denormalized count for fast UI rendering

    sections: [sectionSchema],
    
    cutoff: {
        UR: { type: Number, default: 0 }, EWS: { type: Number, default: 0 },
        OBC: { type: Number, default: 0 }, SC: { type: Number, default: 0 },
        ST: { type: Number, default: 0 },
    },

    totalMarks: { type: Number, default: 0 },

    originalId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestSeries' },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestSeriesGroup' },
}, { timestamps: true });

// Compound indexes to speed up the "Filter inside Filter" queries
testSeriesSchema.index({ testType: 1, subCategory: 1, subject: 1, filter1: 1 });
// Index for fetching Live Tests quickly
testSeriesSchema.index({ isLiveTest: 1, liveTestStatus: 1 });
testSeriesSchema.index({ status: 1 });
testSeriesSchema.index({ groupId: 1 });

module.exports = mongoose.model('TestSeries', testSeriesSchema);