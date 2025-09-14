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
            secure: false,
            auth: { user: process.env.MAILERSEND_USER, pass: process.env.MAILERSEND_PASS },
            tls: { minVersion: 'TLSv1.2' },
            connectionTimeout: 10000, // 10 seconds is a good balance
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
            secure: false,
            auth: { user: process.env.BREVO_USER, pass: process.env.BREVO_PASS },
            tls: { minVersion: 'TLSv1.2' },
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
            secure: false,
            auth: { user: process.env.ELASTIC_USER, pass: process.env.ELASTIC_PASS },
            tls: { minVersion: 'TLSv1.2' },
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
            secure: false,
            auth: { user: process.env.SMTP2GO_USER, pass: process.env.SMTP2GO_PASS },
            tls: { minVersion: 'TLSv1.2' },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
        }),
        from: () => `"NextExams" <${process.env.SMTP2GO_FROM_EMAIL}>`,
    },
];

// --- (MAIN CHANGE) DYNAMIC TRANSPORTER INITIALIZATION ---
const transporters = {};

console.log('--- Initializing Email Providers ---');
providerBlueprints.forEach(provider => {
    // Check if all required environment variables for this provider are set
    const isConfigured = provider.requiredEnv.every(envVar => process.env[envVar]);

    if (isConfigured) {
        // If configured, create and store the transporter
        transporters[provider.name] = {
            transporter: nodemailer.createTransport(provider.createConfig()),
            from: provider.from(),
        };
        console.log(`✅ ${provider.name}: Configured and ready.`);
    } else {
        // If not, skip it and log a warning
        console.log(`- ${provider.name}: Skipped (missing environment variables).`);
    }
});
console.log('------------------------------------');
// --- END OF MAIN CHANGE ---


/**
 * Sends an email using a specified provider.
 * @param {object} emailOptions - Contains to, subject, and html properties.
 * @param {string} providerName - The name of the provider to use (e.g., 'MailerSend').
 * @returns {Promise<void>}
 */
const sendEmail = async (emailOptions, providerName) => {
    const provider = transporters[providerName];
    if (!provider) {
        // This error now correctly implies the provider was either not found or not configured.
        throw new Error(`Email provider "${providerName}" is not available.`);
    }

    try {
        console.log(`Attempting to send email via ${providerName} to ${emailOptions.to}...`);
        await provider.transporter.sendMail({
            from: provider.from, // The 'from' address is now stored with the transporter
            to: emailOptions.to,
            subject: emailOptions.subject,
            html: emailOptions.html,
        });
        console.log(`✅ Email sent successfully via ${providerName} to ${emailOptions.to}`);
    } catch (error) {
        // Add more context to the error before throwing it
        console.error(`❌ Failed to send email via ${providerName}:`, error.message);
        const enhancedError = new Error(`[${providerName} Error]: ${error.message}`);
        enhancedError.originalError = error; // Preserve original error if needed
        throw enhancedError;
    }
};

// We also export the list of available provider names
const availableProviders = Object.keys(transporters);

module.exports = { sendEmail, availableProviders };
