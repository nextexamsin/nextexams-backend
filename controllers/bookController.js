const Book = require('../models/Book');

// @desc    Create a new book
// @route   POST /api/books
const createBook = async (req, res) => {
    try {
        const { title, author, amazonLink, coverImage, exam, category, tags } = req.body;

        // More explicit validation
        if (!title || !author || !amazonLink || !coverImage) {
            return res.status(400).json({ message: 'Title, Author, Amazon Link, and Cover Image are required fields.' });
        }

        const newBook = new Book({ title, author, amazonLink, coverImage, exam, category, tags });
        const savedBook = await newBook.save();
        res.status(201).json(savedBook);
    } catch (error) {
        // Mongoose validation errors will be caught here
        res.status(400).json({ message: 'Failed to create book. Please check your input.', error: error.message });
    }
};

// @desc    Get all books
// @route   GET /api/books
const getBooks = async (req, res) => {
    try {
        const books = await Book.find({}).sort({ createdAt: -1 });
        res.json(books);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching books' });
    }
};

// @desc    Update a book
// @route   PUT /api/books/:id
const updateBook = async (req, res) => {
    try {
        const updatedBook = await Book.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!updatedBook) {
            return res.status(404).json({ message: 'Book not found' });
        }
        res.json(updatedBook);
    } catch (error) {
        res.status(400).json({ message: 'Failed to update book. Please check your input.', error: error.message });
    }
};

// @desc    Delete a book
// @route   DELETE /api/books/:id
const deleteBook = async (req, res) => {
    try {
        const book = await Book.findByIdAndDelete(req.params.id);
        if (!book) {
            return res.status(404).json({ message: 'Book not found' });
        }
        res.json({ message: 'Book deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting book' });
    }
};

// Add this new function to bookController.js

// @desc    Get recommended books based on tags/category
// @route   GET /api/books/recommendations

const getRecommendedBooks = async (req, res) => {
    try {
        // 1. Get page and limit from query, set defaults
        const { tags, page = 1, limit = 10 } = req.query;

        if (!tags) return res.json([]);

        // Convert page/limit to numbers
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        // Split into array and trim whitespace
        const tagArray = tags.split(',').map(t => t.trim());

        // Create Case-Insensitive Regex for each tag
        const regexArray = tagArray.map(tag => new RegExp(tag, 'i'));

        const books = await Book.find({
            $or: [
                { exam: { $in: regexArray } },
                { category: { $in: regexArray } },
                { tags: { $in: regexArray } }
            ]
        })
        .skip(skip)      // Skip books from previous pages
        .limit(limitNum); // Use the dynamic limit (10) instead of 4

        res.json(books);
    } catch (error) {
        console.error("Recommendation Error:", error);
        res.status(500).json({ message: 'Error fetching recommendations' });
    }
};



module.exports = { createBook, getBooks, updateBook, deleteBook, getRecommendedBooks };