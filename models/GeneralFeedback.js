const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const generalFeedbackSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    category: {
        type: String,
        enum: ['Bug Report', 'Feature Request', 'UI/UX', 'Performance', 'Other'],
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
    },
    adminResponse: {
        type: String,
        default: ''
    }
}, { timestamps: true });

module.exports = mongoose.model('GeneralFeedback', generalFeedbackSchema);