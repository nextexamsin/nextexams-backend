const mongoose = require('mongoose');

const testSeriesGroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  imageUrl: { type: String, trim: true },
  tags: { 
    type: [String], 
    default: [],
    index: true 
  },
  testSeries: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestSeries',
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('TestSeriesGroup', testSeriesGroupSchema);
