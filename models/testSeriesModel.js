const mongoose = require('mongoose');

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
    
    marksPerQuestion: { type: Number, default: null },
    negativeMarking: { type: Number, default: null },
    markingScheme: { type: markingSchemeSchema, default: null },

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
    tags: { type: [String], default: [] },
    subject: { type: String, trim: true, lowercase: true, default: null },
    filter1: { type: String, trim: true, default: null },
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

    isLiveTest: { type: Boolean, default: false },
    liveTestType: { 
        type: String, 
        enum: ['fixed', 'flexible'], 
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
    registeredUsersCount: { type: Number, default: 0 }, 

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

// Existing compound indexes
testSeriesSchema.index({ testType: 1, subCategory: 1, subject: 1, filter1: 1 });
testSeriesSchema.index({ isLiveTest: 1, liveTestStatus: 1 });
testSeriesSchema.index({ status: 1 });
testSeriesSchema.index({ groupId: 1 });

// 🚀 NEW HIGH-PERFORMANCE INDEXES
testSeriesSchema.index({ status: 1, isLiveTest: 1 });
testSeriesSchema.index({ exam: 1 });
testSeriesSchema.index({ isPaid: 1 });
testSeriesSchema.index({ createdAt: -1 });
testSeriesSchema.index({ releaseDate: 1 });
testSeriesSchema.index({ status: 1, isPaid: 1 });
testSeriesSchema.index({ '_id': 1, 'testType': 1 });

module.exports = mongoose.model('TestSeries', testSeriesSchema);