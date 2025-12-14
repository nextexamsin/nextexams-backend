const mongoose = require('mongoose');

const questionReportSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true
  },
  testId: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestSeries'
  },
  issueType: {
    type: String,
    enum: [
      'Question is incorrect',
      'Options are incorrect', 
      'Wrong Answer Key',
      'Explanation is unclear/wrong',
      'Formatting/Image issue',
      'Other'
    ],
    required: true
  },
  description: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'resolved', 'rejected'],
    default: 'pending'
  },
  adminResponse: {
    type: String,
    trim: true,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('QuestionReport', questionReportSchema);