const mongoose = require('mongoose');

// 1. Helper Schema for Localized Text
// This allows you to add 'bn' (Bengali), 'mr' (Marathi) later without changing the DB structure.
const localizedStringSchema = new mongoose.Schema({
  en: { type: String, required: true }, // English is mandatory
  hi: { type: String, default: '' }     // Hindi is optional
}, { _id: false });

// 2. Option Schema
const optionSchema = new mongoose.Schema({
  label: { type: String, required: true }, // e.g., 'a', 'b', '1', '2'
  text: { type: localizedStringSchema, default: {} }, 
  image: { type: String } 
});

// 3. Main Question Schema
const questionSchema = new mongoose.Schema({
  // --- Core Content ---
  questionText: { type: localizedStringSchema, required: true },
  questionImage: { type: String },
  questionType: {
    type: String,
    enum: ['mcq', 'multiple', 'numerical'],
    required: true
  },
  options: [optionSchema],

  // --- Answer & Explanation ---
  correctAnswer: {
    type: [mongoose.Schema.Types.Mixed], // Array of strings or numbers
    required: true,
    default: []
  },
  answerMin: { type: Number }, // For numerical range
  answerMax: { type: Number },
  
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
  // This array tells the frontend which languages are available for this specific question
  availableLanguages: {
    type: [String],
    default: ['en'] 
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

module.exports = mongoose.model('Question', questionSchema);