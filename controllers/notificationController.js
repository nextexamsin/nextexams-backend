// nextExams-backend/controllers/notificationController.js
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const User = require('../models/User.js');

// ✅ Import the new messaging services
const { sendTelegramAlert } = require('../utils/telegramService');
const { sendWebPushAlert } = require('../utils/webPushService');

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
const broadcastNotification = async (req, res) => {
  const { message, link, imageUrl, type, sendToTelegram, sendToWebPush } = req.body;

  if (!message || !link) {
    return res.status(400).json({ message: 'Message and link are required.' });
  }

  const defaultImageUrl = 'https://blogger.googleusercontent.com/img/a/AVvXsEjpUktpgBy9t73uP7pKn-cjzQzHrk_yb0O6xNf7jGKAkDR_rcJxY-8-GIpXrANCCiaHYDikO1ZFWoeN3ptxs-UkMFG-m_JSnX8KmtU2VMn3YOsLpSN-TjUZgmZiolu4y5Yya8SmfICY3mAhiUMDjXMCEnrIxlxDWf8GKwsbRu7U7twI0SyLbf36AbHZW94';
  const finalImageUrl = imageUrl || defaultImageUrl;

  try {
    const allUsers = await User.find({ role: 'user' }, '_id name telegramChatId webPushSubscriptions');
    const broadcastId = new mongoose.Types.ObjectId();
    const clientUrl = process.env.CLIENT_URL || 'https://nextexams.in';
    const absoluteLink = link.startsWith('http') ? link : `${clientUrl}${link}`;

    let telegramCount = 0;
    let pushCount = 0;

    // We collect all notification docs into an array first
    const notificationsToInsert = [];

    for (const user of allUsers) {
      // TELEGRAM NOTIFICATION
      if (sendToTelegram && user.telegramChatId) {
          const teleMsg = `📢 <b>Announcement</b>\n\nHi ${user.name || 'Student'},\n${message}\n\n👉 <a href="${absoluteLink}">Click here to view</a>`;
          sendTelegramAlert(user.telegramChatId, teleMsg);
          telegramCount++;
      }

      // WEB PUSH NOTIFICATION
      if (sendToWebPush && user.webPushSubscriptions && user.webPushSubscriptions.length > 0) {
          const pushPayload = { title: '📢 NextExams Update', body: message, url: link, icon: finalImageUrl };
          const validSubscriptions = [];
          for (const sub of user.webPushSubscriptions) {
              const result = await sendWebPushAlert(sub, pushPayload);
              if (result !== 'EXPIRED') validSubscriptions.push(sub);
          }
          if (validSubscriptions.length !== user.webPushSubscriptions.length) {
              user.webPushSubscriptions = validSubscriptions;
              await user.save();
          }
          pushCount++;
      }

      // Prepare In-App Notification Doc
      notificationsToInsert.push({
        user: user._id,
        message, link, imageUrl: finalImageUrl, broadcastId, type,
        // ✅ We attach the final counts to EVERY document for easy aggregation
        telegramCount: 0, 
        webPushCount: 0
      });

      const userSocketId = req.onlineUsers[user._id.toString()];
      if (userSocketId) req.io.to(userSocketId).emit("newNotification", { message, link, imageUrl: finalImageUrl, type });
    }

    // Attach the FINAL counts to the documents before saving
    if (notificationsToInsert.length > 0) {
        notificationsToInsert[0].telegramCount = telegramCount;
        notificationsToInsert[0].webPushCount = pushCount;
        await Notification.insertMany(notificationsToInsert);
    }
    
    res.status(200).json({ message: `Broadcast sent: In-App (${allUsers.length}), Telegram (${telegramCount}), Web Push (${pushCount}).` });
  } catch (error) {
    console.error('Broadcast Error:', error);
    res.status(500).json({ message: 'Server error during broadcast.' });
  }
};

const getAllNotifications = async (req, res) => {
  try {
    const broadcasts = await Notification.aggregate([
      {
        $group: {
          _id: "$broadcastId",
          message: { $first: "$message" },
          link: { $first: "$link" },
          imageUrl: { $first: "$imageUrl" },
          createdAt: { $first: "$createdAt" },
          count: { $sum: 1 },
          // ✅ Extract the Telegram and WebPush counts (we stored them on the first doc)
          telegramCount: { $max: "$telegramCount" },
          webPushCount: { $max: "$webPushCount" }
        }
      },
      { $sort: { createdAt: -1 } }
    ]);
    res.json(broadcasts);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

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

const markOneAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      user: req.user._id,
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

module.exports = {
  getNotifications,
  markNotificationsAsRead,
  broadcastNotification, 
  getAllNotifications,
  deleteBroadcast,
  markOneAsRead,
  getAllUserNotifications,
};