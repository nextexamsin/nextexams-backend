const Redis = require('ioredis');
const rateLimit = require('express-rate-limit');
const { sendEmail } = require('./emailService'); // Assuming this path is correct

// ====================================================================
// --- (NEW) API REQUEST RATE LIMITERS (for express-rate-limit) ---
// This new section fixes the "429 Too Many Requests" error.
// ====================================================================

/**
 * @description A strict rate limiter for unauthenticated routes like OTP and login.
 * This is crucial for preventing brute-force attacks.
 */
const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // Limit each IP to 10 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: 'Too many authentication attempts from this IP, please try again after 5 minutes.',
    },
});

/**
 * @description A more generous rate limiter for general API usage by logged-in users.
 */
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: 'Too many requests from this IP, please try again after 15 minutes.',
    },
});


// ====================================================================
// --- (EXISTING) EMAIL PROVIDER QUOTA LIMITER ---
// Your original, excellent logic for managing email sending limits.
// No changes were made to this section.
// ====================================================================

const redis = new Redis(process.env.UPSTASH_REDIS_REST_URL, { tls: {} });

const providers = [
    { name: 'Brevo', monthlyLimit: 9000, dailyLimit: 300 },
    { name: 'MailerSend', monthlyLimit: 3000, dailyLimit: Infinity },
    { name: 'Elastic Email', monthlyLimit: 3000, dailyLimit: 100 },
    { name: 'SMTP2GO', monthlyLimit: 1000, dailyLimit: Infinity },
];

const LAST_USED_PROVIDER_KEY = 'last_used_provider_index';

const getCurrentPeriod = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    return {
        monthKey: `${year}-${month}`,
        dayKey: `${year}-${month}-${day}`,
    };
};

const sendEmailWithRateLimit = async (emailOptions) => {
    const { monthKey, dayKey } = getCurrentPeriod();
    const lastUsedIndex = parseInt(await redis.get(LAST_USED_PROVIDER_KEY), 10) || -1;

    for (let i = 0; i < providers.length; i++) {
        const providerIndex = (lastUsedIndex + 1 + i) % providers.length;
        const provider = providers[providerIndex];

        const monthlyUsageKey = `email:${provider.name}:monthly:${monthKey}`;
        const dailyUsageKey = `email:${provider.name}:daily:${dayKey}`;

        const [monthlyCount, dailyCount] = await redis.mget(monthlyUsageKey, dailyUsageKey);

        const currentMonthly = parseInt(monthlyCount, 10) || 0;
        const currentDaily = parseInt(dailyCount, 10) || 0;

        if (currentMonthly < provider.monthlyLimit && currentDaily < provider.dailyLimit) {
            console.log(`✅ ${provider.name} is available. Preparing to send...`);
            try {
                await sendEmail(emailOptions, provider.name);

                console.log(`Usage for ${provider.name} incremented.`);
                redis.multi()
                    .set(LAST_USED_PROVIDER_KEY, providerIndex)
                    .incr(monthlyUsageKey)
                    .expire(monthlyUsageKey, 31 * 24 * 60 * 60)
                    .incr(dailyUsageKey)
                    .expire(dailyUsageKey, 24 * 60 * 60)
                    .exec();
                
                return;

            } catch (error) {
                console.error(`Email dispatch via ${provider.name} failed. Trying next provider.`, error.message);
            }
        } else {
            console.log(`🔶 ${provider.name} has reached its limit. Skipping.`);
        }
    }

    throw new Error("All email providers are currently over their free limit or unavailable.");
};


// --- (NEW) EXPORT EVERYTHING ---
module.exports = { 
    sendEmailWithRateLimit,
    authLimiter,
    apiLimiter 
};
