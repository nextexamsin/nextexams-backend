import TelegramBot from 'node-telegram-bot-api';
import User from '../models/User.js';

const token = process.env.TELEGRAM_BOT_TOKEN;

// Create a bot.
// If we are in production (Render), run polling: true so it can receive messages.
// If we are local, run polling: false to prevent the 409 conflict, UNLESS we specifically want to test it locally.
const isProduction = process.env.NODE_ENV === 'production';
const shouldPoll = isProduction; // Set to true manually if you need to test the link locally!

let bot;

if (token) {
    // Only turn on polling if shouldPoll is true
    bot = new TelegramBot(token, { polling: shouldPoll });
    console.log(`✅ Telegram Bot Initialized (Polling: ${shouldPoll}).`);

    // -------------------------------------------------------------
    // LISTEN FOR USERS STARTING A CHAT (The Opt-In)
    // -------------------------------------------------------------
    // Note: This block will only trigger if polling is true!
    if (shouldPoll) {
        bot.onText(/\/start (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const userId = match[1];

            try {
                const user = await User.findById(userId);
                
                if (user) {
                    user.telegramChatId = chatId;
                    await user.save();

                    bot.sendMessage(chatId, `🎉 Welcome, ${user.name}! Your NextExams account is successfully linked. You will now receive free alerts 15 minutes before your Live Tests begin.`);
                    console.log(`🔗 Linked Telegram Chat ID ${chatId} to User ${userId}`);
                } else {
                    bot.sendMessage(chatId, `❌ Error: We couldn't find a NextExams account matching that link. Please try clicking the button in your dashboard again.`);
                }
            } catch (error) {
                console.error('Error linking Telegram:', error);
                bot.sendMessage(chatId, `❌ An error occurred while linking your account. Please try again later.`);
            }
        });

        bot.onText(/\/start$/, (msg) => {
            bot.sendMessage(msg.chat.id, `👋 Welcome to NextExams Alerts! To link your account, please click the "Link Telegram" button inside your NextExams Dashboard.`);
        });
    }
} else {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN not found in .env. Telegram features disabled.');
}

// Export the sender function for BullMQ and Broadcasts
// We can ALWAYS send messages, even if polling is false!
export const sendTelegramAlert = async (chatId, message) => {
    if (!bot) return;
    try {
        await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } catch (error) {
        console.error(`Failed to send Telegram message to ${chatId}:`, error.message);
    }
};