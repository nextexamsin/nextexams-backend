const Book = require('../models/Book');

// @desc    Create a new book
// @route   POST /api/books
const createBook = async (req, res) => {
    try {
        const { title, author, amazonLink, coverImage, exam, category } = req.body;

        // More explicit validation
        if (!title || !author || !amazonLink || !coverImage) {
            return res.status(400).json({ message: 'Title, Author, Amazon Link, and Cover Image are required fields.' });
        }

        const newBook = new Book({ title, author, amazonLink, coverImage, exam, category });
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

module.exports = { createBook, getBooks, updateBook, deleteBook };