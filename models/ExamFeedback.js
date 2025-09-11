const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const examFeedbackSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    test: {
        type: Schema.Types.ObjectId,
        ref: 'TestSeries', // Make sure this matches your testSeriesModel name
        required: true
    },
    attempt: {
        type: Schema.Types.ObjectId,
        ref: 'Attempt', // This assumes you have an Attempt sub-document or model
        required: true
    },
    rating: {
        type: Number,
        min: 1,
        max: 5,
        required: true
    },
    message: {
        type: String,
        trim: true,
        required: true
    },
    status: {
        type: String,
        enum: ['Pending', 'In Progress', 'Resolved', 'Dismissed'],
        default: 'Pending'
    }
}, { timestamps: true });

module.exports = mongoose.model('ExamFeedback', examFeedbackSchema);