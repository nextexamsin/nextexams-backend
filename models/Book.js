const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    author: String,
    image: String,
    link: { type: String, required: true }, // Amazon affiliate link
    exam: String,     // e.g., JEE, NEET
    category: String, // e.g., Physics, Chemistry
  },
  { timestamps: true }
);

module.exports = mongoose.model('Book', bookSchema);
