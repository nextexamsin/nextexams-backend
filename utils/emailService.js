// nextExams-backend/utils/emailService.js

const nodemailer = require('nodemailer');

const emailProviders = [
    {
        name: 'MailerSend',
        config: {
            host: process.env.MAILERSEND_HOST,
            port: process.env.MAILERSEND_PORT,
            secure: false,
            auth: { user: process.env.MAILERSEND_USER, pass: process.env.MAILERSEND_PASS },
            tls: { minVersion: 'TLSv1.2' }
        },
        from: `"NextExams" <${process.env.MAILERSEND_FROM_EMAIL}>`,
    },
    {
        name: 'Brevo',
        config: {
            host: process.env.BREVO_HOST,
            port: process.env.BREVO_PORT,
            secure: false,
            auth: { user: process.env.BREVO_USER, pass: process.env.BREVO_PASS },
            tls: { minVersion: 'TLSv1.2' }
        },
        from: `"NextExams" <${process.env.BREVO_FROM_EMAIL}>`,
    },
    {
        name: 'Elastic Email',
        config: {
            host: process.env.ELASTIC_HOST,
            port: process.env.ELASTIC_PORT,
            secure: false,
            auth: { user: process.env.ELASTIC_USER, pass: process.env.ELASTIC_PASS },
            tls: { minVersion: 'TLSv1.2' }
        },
        from: `"NextExams" <${process.env.ELASTIC_FROM_EMAIL}>`,
    },
    {
        name: 'SMTP2GO',
        config: {
            host: process.env.SMTP2GO_HOST,
            port: process.env.SMTP2GO_PORT,
            secure: false,
            auth: { user: process.env.SMTP2GO_USER, pass: process.env.SMTP2GO_PASS },
            tls: { minVersion: 'TLSv1.2' }
        },
        from: `"NextExams" <${process.env.SMTP2GO_FROM_EMAIL}>`,
    },
];

const transporters = {};
emailProviders.forEach(provider => {
    transporters[provider.name] = {
        transporter: nodemailer.createTransport(provider.config),
        from: provider.from,
    };
});

const sendEmail = async (emailOptions, providerName) => {
    const provider = transporters[providerName];
    if (!provider) {
        throw new Error(`Email provider "${providerName}" not found or configured.`);
    }

    try {
        console.log(`Attempting to send email via ${providerName}...`);
        await provider.transporter.sendMail({
            from: provider.from,
            to: emailOptions.to,
            subject: emailOptions.subject,
            html: emailOptions.html,
        });
        console.log(`Email sent successfully via ${providerName} to ${emailOptions.to}`);
    } catch (error) {
        throw error;
    }
};

module.exports = { sendEmail };