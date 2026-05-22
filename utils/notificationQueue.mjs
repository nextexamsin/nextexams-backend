import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import LiveRegistration from '../models/LiveRegistration.js';
import User from '../models/User.js';
import { sendTelegramAlert } from './telegramService.js';
import { sendWebPushAlert } from './webPushService.js'; // ✅ Import Web Push

const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null,
});

export const testAlertQueue = new Queue('testAlerts', { connection });

const worker = new Worker('testAlerts', async (job) => {
    const { testId, testTitle } = job.data;
    console.log(`🚀 Executing 15-min alert for Test: ${testTitle}`);

    try {
        const registrations = await LiveRegistration.find({ testSeriesId: testId }).populate('userId', 'name telegramChatId webPushSubscriptions');

        for (const reg of registrations) {
            const user = reg.userId;
            
            // 1. TELEGRAM ALERT
            if (user && user.telegramChatId) {
                const message = `🚨 <b>Live Test Alert!</b>\n\nHi ${user.name},\nYour test <b>"${testTitle}"</b> is starting in exactly 15 minutes.\n\nGood luck!`;
                await sendTelegramAlert(user.telegramChatId, message);
            }
            
            // 2. WEB PUSH ALERT
            if (user && user.webPushSubscriptions && user.webPushSubscriptions.length > 0) {
                const pushPayload = {
                    title: 'Live Test Starting Soon! 🚨',
                    body: `${testTitle} begins in exactly 15 minutes. Click to join the waiting room!`,
                    url: `/user/live-tests`, // Where they go when they click the notification
                    icon: '/icon-192x192.png' // Use your actual PWA icon path
                };

                // Loop through all devices the user allowed notifications on
                const validSubscriptions = [];
                for (const sub of user.webPushSubscriptions) {
                    const result = await sendWebPushAlert(sub, pushPayload);
                    if (result !== 'EXPIRED') {
                        validSubscriptions.push(sub);
                    }
                }

                // If any subscriptions expired, remove them from the DB
                if (validSubscriptions.length !== user.webPushSubscriptions.length) {
                    user.webPushSubscriptions = validSubscriptions;
                    await user.save();
                }
                console.log(`[WebPush] Alerted user ${user.name}`);
            }
        }
    } catch (err) {
        console.error(`❌ Error processing job ${job.id}:`, err);
    }
}, { connection });

worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job.id} failed with error ${err.message}`);
});