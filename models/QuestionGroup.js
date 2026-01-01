// backend/models/QuestionGroup.js
const mongoose = require('mongoose');

// Reuse the localized string schema pattern you use elsewhere
const localizedStringSchema = new mongoose.Schema({
  en: { type: String, required: true }, 
  hi: { type: String, default: '' } 
}, { _id: false });

const questionGroupSchema = new mongoose.Schema({
  // e.g., "Reading Comprehension - Solar Energy" (Internal use for Admin)
  title: { type: String, required: true }, 
  
  // The actual content displayed on the Left Panel
  directionText: { type: localizedStringSchema, required: true }, 
  
  // For Data Interpretation (Graphs/Charts)
  directionImage: { type: String }, 

  // Helpful for UI formatting
  type: {
    type: String,
    enum: ['comprehension', 'data-interpretation', 'puzzle', 'case-study'], 
    default: 'comprehension'
  },
  
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('QuestionGroup', questionGroupSchema);