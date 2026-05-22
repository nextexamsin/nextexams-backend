import webpush from 'web-push';
import dotenv from 'dotenv';
dotenv.config();

// Configure Web Push with your VAPID keys
webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

export const sendWebPushAlert = async (subscription, payload) => {
    try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
    } catch (error) {
        // If status is 410 (Gone), the user revoked permission or the subscription expired
        if (error.statusCode === 410) {
            console.log('Push subscription has unsubscribed or expired.');
            return 'EXPIRED';
        }
        console.error('Error sending web push:', error);
        throw error;
    }
};