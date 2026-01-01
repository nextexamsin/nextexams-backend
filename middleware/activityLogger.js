const ActivityLog = require('../models/ActivityLog');

const logHighValueEvent = (eventName) => {
    return (req, res, next) => {
        // We use res.on('finish') to log after the response is sent to the user
        res.on('finish', async () => {
            try {
                // Skip if user is admin or it's a bot (see Section 3)
                if (req.user?.role === 'admin' || req.isBot) return;

                await ActivityLog.create({
                    userId: req.user?._id,
                    event: eventName,
                    metadata: {
                        path: req.originalUrl,
                        method: req.method,
                        testId: req.body.testId || req.params.id
                    },
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                });
            } catch (err) {
                console.error("Logging failed:", err);
            }
        });
        next();
    };
};

module.exports = logHighValueEvent;