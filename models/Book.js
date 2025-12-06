const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Book title is required.'],
        trim: true,
    },
    author: {
        type: String,
        required: [true, 'Author name is required.'],
        trim: true,
    },
    amazonLink: {
        type: String,
        required: [true, 'Amazon link is required.'],
    },
    coverImage: {
        type: String,
        required: [true, 'Cover image URL is required.'],
    },
    exam: {
        type: String,
        trim: true,
    },
    category: {
        type: String,
        trim: true,
    },
    // ✅ NEW: Global Tags for connecting to Test Series
    tags: {
        type: [String],
        default: [],
        index: true
    }
}, {
    timestamps: true 
});

module.exports = mongoose.model('Book', bookSchema);