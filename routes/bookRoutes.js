const express = require('express');
const router = express.Router();
const {
  getAllBooks,
  createBook,
  updateBook,
  deleteBook,
} = require('../controllers/bookController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Optionally use adminAuth middleware here
router.get('/', getAllBooks);
router.post('/', protect, adminOnly, createBook);
router.put('/:id', protect, adminOnly, updateBook);
router.delete('/:id', protect, adminOnly, deleteBook);

module.exports = router;
