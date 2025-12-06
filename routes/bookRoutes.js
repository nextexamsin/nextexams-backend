const express = require('express');
const router = express.Router();
const {
    createBook,
    getBooks,
    updateBook,
    deleteBook,
    getRecommendedBooks
} = require('../controllers/bookController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Public route to get all books
router.get('/', getBooks);
router.get('/recommendations', getRecommendedBooks);

// Admin-only routes for creating, updating, and deleting
router.post('/', protect, adminOnly, createBook);
router.put('/:id', protect, adminOnly, updateBook);
router.delete('/:id', protect, adminOnly, deleteBook);


module.exports = router;