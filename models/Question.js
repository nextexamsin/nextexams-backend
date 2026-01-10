// backend/models/Question.js
const mongoose = require('mongoose');

// 1. Helper Schema for Localized Text
// ✅ UPDATED: Removed 'required: true' from 'en'. 
// This allows Explanations to be empty (optional).
const localizedStringSchema = new mongoose.Schema({
  en: { type: String, default: '' }, 
  hi: { type: String, default: '' } 
}, { _id: false });

// 2. Option Schema
const optionSchema = new mongoose.Schema({
  label: { type: String, required: true }, 
  text: { type: localizedStringSchema, default: {} }, 
  image: { type: String } 
});

// 3. Main Question Schema
const questionSchema = new mongoose.Schema({
  // --- Core Content ---
  // ✅ We still want Question Text to be mandatory, so we enforce it here if needed, 
  // but usually Frontend validation handles the "required" aspect for logic.
  questionText: { type: localizedStringSchema, required: true },
  
  questionImage: { type: String },
  questionType: {
    type: String,
    enum: ['mcq', 'multiple', 'numerical'],
    required: true
  },
  options: [optionSchema],

  // --- Link to Passage/Group ---
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuestionGroup', 
    default: null 
  },

  // --- Answer & Explanation ---
  correctAnswer: {
    type: [mongoose.Schema.Types.Mixed], 
    required: true,
    default: []
  },
  answerMin: { type: Number }, 
  answerMax: { type: Number },
  
  // ✅ Explanation is now optional because localizedStringSchema no longer requires 'en'
  explanation: { type: localizedStringSchema, default: {} },
  explanationImage: { type: String, default: '' },

  // --- Scoring ---
  marks: { type: Number, required: true, default: 1 },
  negativeMarks: { type: Number, required: true, default: 0 },

  // --- Metadata & Tagging ---
  exam: { type: String, required: true },
  year: { type: String },
  subject: { type: String, required: true },
  chapter: { type: String, required: true },
  topic: { type: String },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    required: true,
    default: 'medium'
  },
  tags: [String],

  // --- Status & Localization ---
  status: {
    type: String,
    enum: ['draft', 'active', 'archived'],
    default: 'active'
  },
  
  // Support for Reporting Logic
  reportStatus: {
    type: String,
    enum: ['pending', 'in progress', 'resolved', 'dismissed', 'rejected', null],
    default: null
  },

  availableLanguages: {
    type: [String],
    default: ['en'] 
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });



questionSchema.index({ exam: 1, subject: 1, chapter: 1, difficulty: 1 });




questionSchema.index({ questionType: 1 });


questionSchema.index({ "questionText.en": "text", "questionText.hi": "text" });

module.exports = mongoose.model('Question', questionSchema);