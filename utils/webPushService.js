// nextExams-backend/utils/webPushService.js
const webpush = require('web-push');
require('dotenv').config();

// Configure Web Push with your VAPID keys
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@nextexams.in',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
    console.log('✅ Web Push Service Initialized.');
} else {
    console.warn('⚠️ VAPID keys missing in .env. Web Push disabled.');
}

const sendWebPushAlert = async (subscription, payload) => {
    try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        return 'SUCCESS';
    } catch (error) {
        // If status is 410 (Gone), the user revoked permission or the subscription expired
        if (error.statusCode === 410) {
            console.log('Push subscription has unsubscribed or expired.');
            return 'EXPIRED';
        }
        console.error('Error sending web push:', error);
        return 'ERROR';
    }
};

module.exports = {
    sendWebPushAlert
};