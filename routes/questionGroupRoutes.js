// backend/routes/questionGroupRoutes.js
const express = require('express');

// ✅ Import 'adminOnly' matching your authMiddleware.js export
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { createGroup, getGroups, deleteGroup } = require('../controllers/questionGroupController');

const router = express.Router();

router.route('/')
  .post(protect, adminOnly, createGroup)
  .get(protect, adminOnly, getGroups);

router.route('/:id')
  .delete(protect, adminOnly, deleteGroup);

module.exports = router;