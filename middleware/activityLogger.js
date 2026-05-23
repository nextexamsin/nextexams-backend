const ActivityLog = require('../models/ActivityLog');

// 🚀 OPTIMIZATION: In-Memory Batch Queue
// Collects logs and writes them in a single batch to prevent DB connection exhaustion
let logQueue = [];
const BATCH_INTERVAL_MS = 5000; // Flush to DB every 5 seconds

// Background worker that runs every 5 seconds
setInterval(async () => {
    if (logQueue.length === 0) return;
    
    // Copy current queue and instantly clear it to accept new logs
    const batch = [...logQueue]; 
    logQueue = []; 
    
    try {
        // Bulk insert uses only 1 DB operation instead of hundreds
        await ActivityLog.insertMany(batch);
    } catch (err) {
        console.error("Bulk logging failed:", err);
    }
}, BATCH_INTERVAL_MS);

const logHighValueEvent = (eventName) => {
    return (req, res, next) => {
        // We use res.on('finish') to log after the response is sent to the user
        res.on('finish', () => {
            try {
                // Skip if user is admin or it's a bot
                if (req.user?.role === 'admin' || req.isBot) return;

                // 🚀 OPTIMIZATION: Push to RAM queue instantly instead of waiting for DB
                logQueue.push({
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
                console.error("Logging queue failed:", err);
            }
        });
        next();
    };
};

module.exports = logHighValueEvent;