const express = require('express');
const router = express.Router();

const {
  createTestSeriesGroup,
  getAllTestSeriesGroups,
  getTestSeriesGroupById,
  updateTestSeriesGroup,
  deleteTestSeriesGroup,
  getFullTestSeriesGroups,
  getRecentTestSeriesGroups,
  getPublishedGroupsWithTests,
} = require('../controllers/testSeriesGroupController');

const { protect, adminOnly } = require('../middleware/authMiddleware'); // ✅ import protect

router.get('/full', getFullTestSeriesGroups);
router.post('/', protect, adminOnly, createTestSeriesGroup); // optional: protect create
router.get('/', getAllTestSeriesGroups);
router.get('/recent', protect, getRecentTestSeriesGroups);
router.get('/:id', protect, getTestSeriesGroupById); // ✅ protect this route!
router.put('/:id', protect, adminOnly, updateTestSeriesGroup);
router.delete('/:id', protect, adminOnly, deleteTestSeriesGroup);
router.get('/published', getPublishedGroupsWithTests);

module.exports = router;
