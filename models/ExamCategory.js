const mongoose = require('mongoose');

const examCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String, unique: true }, // ✅ Added Slug
  iconUrl: { type: String },
  description: { type: String },
  testSeriesGroups: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestSeriesGroup'
  }]
}, { timestamps: true });

module.exports = mongoose.model('ExamCategory', examCategorySchema);