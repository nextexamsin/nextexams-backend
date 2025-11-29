const express = require('express');
const router = express.Router();
const { 
  createCategory, 
  getAllCategories, 
  getCategoryById,
  updateCategory, 
  deleteCategory 
} = require('../controllers/examCategoryController');

const { protect, adminOnly } = require('../middleware/authMiddleware');

// Public Routes
router.get('/', getAllCategories);
router.get('/:id', getCategoryById);

// Admin Only Routes
router.post('/', protect, adminOnly, createCategory);
router.put('/:id', protect, adminOnly, updateCategory);
router.delete('/:id', protect, adminOnly, deleteCategory);

module.exports = router;