// nextExams-backend/models/Question.js

const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema({
  label: { type: String, required: true },
  text: { type: String },
  image: { type: String }
});

const questionSchema = new mongoose.Schema({
  // --- Core Content ---
  questionText: { type: String, required: true },
  questionImage: { type: String },
  questionType: {
    type: String,
    enum: ['mcq', 'multiple', 'numerical'],
    required: true
  },
  options: [optionSchema],

  // --- Answer & Explanation ---
  correctAnswer: {
    type: [mongoose.Schema.Types.Mixed],
    required: true,
    default: []
  },
  answerMin: { type: Number },
  answerMax: { type: Number },
  explanation: { type: String }, // Kept as 'explanation' per your request

  // --- Scoring ---
  marks: {
    type: Number,
    required: true,
    default: 1
  },
  negativeMarks: {
    type: Number,
    required: true,
    default: 0
  },

  // --- Metadata & Tagging ---
  exam: { type: String, required: true },     // Kept per your request
  year: { type: String },                     // Kept per your request
  subject: { type: String, required: true },
  chapter: { type: String, required: true },  // ✅ ADDED for granularity
  topic: { type: String },                    // ✅ ADDED for more detail
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    required: true,
    default: 'medium'
  },
  tags: [String],
  
  // --- Optional additions for future scalability ---
  status: {                                     // To manage question lifecycle
    type: String,
    enum: ['draft', 'active', 'archived'],
    default: 'active'
  },
  language: {                                   // For multilingual support
      type: String,
      default: 'en' // 'en' for English, 'hi' for Hindi etc.
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // ✅ This is the correct reference
}

}, { timestamps: true });

module.exports = mongoose.model('Question', questionSchema);