// nextExams-backend/routes/notificationRoutes.js

const express = require('express');
const router = express.Router();
const { getNotifications, markNotificationsAsRead,markOneAsRead,getAllUserNotifications, } = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware'); // Assuming your auth middleware is named 'protect'

router.route('/').get(protect, getNotifications);
router.route('/all').get(protect, getAllUserNotifications);
router.route('/mark-read').post(protect, markNotificationsAsRead);
router.route('/:id/read').post(protect, markOneAsRead);


module.exports = router;