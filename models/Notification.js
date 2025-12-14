// nextExams-backend/models/Notification.js

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  link: { // Optional: URL to navigate to on click
    type: String,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  imageUrl: { type: String },
  broadcastId: { type: mongoose.Schema.Types.ObjectId },
    type: {
    type: String,
    enum: ['toast', 'banner', 'system'], // Only allow these two types
    default: 'toast',
  },
}, { timestamps: true }); // timestamps adds createdAt and updatedAt

const Notification = mongoose.model('Notification', notificationSchema);
module.exports = Notification;