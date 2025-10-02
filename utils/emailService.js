const nodemailer = require('nodemailer');

// --- PROVIDER BLUEPRINTS ---
// This array defines the configuration for all potential email providers.
const providerBlueprints = [
    {
        name: 'MailerSend',
        requiredEnv: ['MAILERSEND_HOST', 'MAILERSEND_PORT', 'MAILERSEND_USER', 'MAILERSEND_PASS', 'MAILERSEND_FROM_EMAIL'],
        createConfig: () => ({
            host: process.env.MAILERSEND_HOST,
            port: process.env.MAILERSEND_PORT,
            // --- (IMPROVEMENT) Dynamic 'secure' setting ---
            // This will be 'true' only if you use port 465 in the future.
            secure: process.env.MAILERSEND_PORT === '465',
            auth: { user: process.env.MAILERSEND_USER, pass: process.env.MAILERSEND_PASS },
            tls: {
                minVersion: 'TLSv1.2',
                ciphers: 'HIGH:!aNULL:!MD5' // Enhanced security
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
        }),
        from: () => `"NextExams" <${process.env.MAILERSEND_FROM_EMAIL}>`,
    },
    {
        name: 'Brevo',
        requiredEnv: ['BREVO_HOST', 'BREVO_PORT', 'BREVO_USER', 'BREVO_PASS', 'BREVO_FROM_EMAIL'],
        createConfig: () => ({
            host: process.env.BREVO_HOST,
            port: process.env.BREVO_PORT,
            secure: process.env.BREVO_PORT === '465', // Dynamic 'secure'
            auth: { user: process.env.BREVO_USER, pass: process.env.BREVO_PASS },
            tls: {
                minVersion: 'TLSv1.2',
                ciphers: 'HIGH:!aNULL:!MD5'
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
        }),
        from: () => `"NextExams" <${process.env.BREVO_FROM_EMAIL}>`,
    },
    {
        name: 'Elastic Email',
        requiredEnv: ['ELASTIC_HOST', 'ELASTIC_PORT', 'ELASTIC_USER', 'ELASTIC_PASS', 'ELASTIC_FROM_EMAIL'],
        createConfig: () => ({
            host: process.env.ELASTIC_HOST,
            port: process.env.ELASTIC_PORT,
            secure: process.env.ELASTIC_PORT === '465', // Dynamic 'secure'
            auth: { user: process.env.ELASTIC_USER, pass: process.env.ELASTIC_PASS },
            tls: {
                minVersion: 'TLSv1.2',
                ciphers: 'HIGH:!aNULL:!MD5'
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
        }),
        from: () => `"NextExams" <${process.env.ELASTIC_FROM_EMAIL}>`,
    },
    {
        name: 'SMTP2GO',
        requiredEnv: ['SMTP2GO_HOST', 'SMTP2GO_PORT', 'SMTP2GO_USER', 'SMTP2GO_PASS', 'SMTP2GO_FROM_EMAIL'],
        createConfig: () => ({
            host: process.env.SMTP2GO_HOST,
            port: process.env.SMTP2GO_PORT,
            secure: process.env.SMTP2GO_PORT === '465', // Dynamic 'secure'
            auth: { user: process.env.SMTP2GO_USER, pass: process.env.SMTP2GO_PASS },
            tls: {
                minVersion: 'TLSv1.2',
                ciphers: 'HIGH:!aNULL:!MD5'
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
        }),
        from: () => `"NextExams" <${process.env.SMTP2GO_FROM_EMAIL}>`,
    },
];

// --- TRANSPORTER INITIALIZATION ---
// (No changes below this line, your logic is perfect)
const transporters = {};


providerBlueprints.forEach(provider => {
    const isConfigured = provider.requiredEnv.every(envVar => process.env[envVar]);
    if (isConfigured) {
        transporters[provider.name] = {
            transporter: nodemailer.createTransport(provider.createConfig()),
            from: provider.from(),
        };
       
    } else {
        console.log(`- ${provider.name}: Skipped (missing environment variables).`);
    }
});
console.log('------------------------------------');

const sendEmail = async (emailOptions, providerName) => {
    const provider = transporters[providerName];
    if (!provider) {
        throw new Error(`Email provider "${providerName}" is not available.`);
    }
    try {
        console.log(`Attempting to send email via ${providerName} to ${emailOptions.to}...`);
        await provider.transporter.sendMail({
            from: provider.from,
            to: emailOptions.to,
            subject: emailOptions.subject,
            html: emailOptions.html,
        });
        console.log(`✅ Email sent successfully via ${providerName} to ${emailOptions.to}`);
    } catch (error) {
        console.error(`❌ Failed to send email via ${providerName}:`, error.message);
        const enhancedError = new Error(`[${providerName} Error]: ${error.message}`);
        enhancedError.originalError = error;
        throw enhancedError;
    }
};

const availableProviders = Object.keys(transporters);

module.exports = { sendEmail, availableProviders };

