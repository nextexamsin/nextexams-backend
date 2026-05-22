import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import LiveRegistration from '../models/LiveRegistration.js';
import User from '../models/User.js';
import { sendTelegramAlert } from './telegramService.js'; // ✅ Add this import

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
            
            // ✅ EXECUTE TELEGRAM LOGIC
            if (user && user.telegramChatId) {
                const message = `🚨 <b>Live Test Alert!</b>\n\nHi ${user.name},\nYour test <b>"${testTitle}"</b> is starting in exactly 15 minutes.\n\nGood luck!`;
                await sendTelegramAlert(user.telegramChatId, message);
                console.log(`[Telegram] Alerted user ${user.name} for ${testTitle}`);
            }
            
            if (user && user.webPushSubscriptions && user.webPushSubscriptions.length > 0) {
               // TODO: Execute WebPush logic
               console.log(`[WebPush] Alerting user ${user._id} for ${testTitle}`);
            }
        }
    } catch (err) {
        console.error(`❌ Error processing job ${job.id}:`, err);
    }
}, { connection });

worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job.id} failed with error ${err.message}`);
});