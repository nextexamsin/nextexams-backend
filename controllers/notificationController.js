// nextExams-backend/controllers/notificationController.js
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const User = require('../models/User.js');

// @desc    Get user's notifications
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Mark notifications as read
// @route   POST /api/notifications/mark-read
// @access  Private
const markNotificationsAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, isRead: false },
      { $set: { isRead: true } }
    );
    res.status(200).json({ message: 'Notifications marked as read' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Admin broadcasts a notification to all users
// @access  Private/Admin
// FIX 1: The 'export' keyword was removed from here.
const broadcastNotification = async (req, res) => {
  const { message, link, imageUrl, type } = req.body;

  if (!message || !link) {
    return res.status(400).json({ message: 'Message and link are required.' });
  }

  const defaultImageUrl = 'https://blogger.googleusercontent.com/img/a/AVvXsEjpUktpgBy9t73uP7pKn-cjzQzHrk_yb0O6xNf7jGKAkDR_rcJxY-8-GIpXrANCCiaHYDikO1ZFWoeN3ptxs-UkMFG-m_JSnX8KmtU2VMn3YOsLpSN-TjUZgmZiolu4y5Yya8SmfICY3mAhiUMDjXMCEnrIxlxDWf8GKwsbRu7U7twI0SyLbf36AbHZW94';
   const finalImageUrl = imageUrl || defaultImageUrl;

  try {
    const allUsers = await User.find({ role: 'user' }, '_id');
    const broadcastId = new mongoose.Types.ObjectId();

    for (const user of allUsers) {
      const notification = new Notification({
        user: user._id,
        message,
        link,
         imageUrl: finalImageUrl,
        broadcastId,
        type,
      });
      await notification.save();

      const userSocketId = req.onlineUsers[user._id.toString()];
      if (userSocketId) {
        req.io.to(userSocketId).emit("newNotification", notification);
      }
    }
    res.status(200).json({ message: `Broadcast sent to ${allUsers.length} users.` });
  } catch (error) {
    console.error('Broadcast Error:', error);
    res.status(500).json({ message: 'Server error during broadcast.' });
  }
};


// @desc    Admin gets all notifications
// @route   GET /api/admin/notifications
// @access  Private/Admin
const getAllNotifications = async (req, res) => {
  try {
    const broadcasts = await Notification.aggregate([
      // Group notifications by the broadcastId, message, and link
      {
        $group: {
          _id: "$broadcastId",
          message: { $first: "$message" },
          link: { $first: "$link" },
          imageUrl: { $first: "$imageUrl" },
          createdAt: { $first: "$createdAt" },
          count: { $sum: 1 } // Count how many users received it
        }
      },
      { $sort: { createdAt: -1 } } // Sort by creation date
    ]);
    res.json(broadcasts);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Admin deletes a notification
// @route   DELETE /api/admin/notifications/:id
// @access  Private/Admin
const deleteBroadcast = async (req, res) => {
  try {
    const { broadcastId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(broadcastId)) {
        return res.status(400).json({ message: 'Invalid Broadcast ID' });
    }
    await Notification.deleteMany({ broadcastId: broadcastId });
    res.json({ message: 'Broadcast notifications deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};


// @desc    Mark a single notification as read
// @route   POST /api/notifications/:id/read
// @access  Private
const markOneAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      user: req.user._id, // Security: ensure user owns this notification
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    notification.isRead = true;
    await notification.save();
    res.json(notification);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get all notifications for a user with pagination
// @route   GET /api/notifications/all
// @access  Private
const getAllUserNotifications = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  try {
    const totalNotifications = await Notification.countDocuments({ user: req.user._id });

    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      notifications,
      page,
      totalPages: Math.ceil(totalNotifications / limit),
      totalNotifications
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};


// FIX 2: Added 'broadcastNotification' to the module.exports object.
module.exports = {
  getNotifications,
  markNotificationsAsRead,
  broadcastNotification, 
   getAllNotifications,
  deleteBroadcast,
  markOneAsRead,
  getAllUserNotifications,
};