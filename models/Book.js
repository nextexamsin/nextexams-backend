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
    // FIX: Changed 'link' to 'amazonLink' to match the frontend form
    amazonLink: {
        type: String,
        required: [true, 'Amazon link is required.'],
    },
    // FIX: Changed 'image' to 'coverImage' to match the frontend form
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
    }
}, {
    timestamps: true // Automatically adds createdAt and updatedAt fields
});

module.exports = mongoose.model('Book', bookSchema);

