const { Redis } = require('@upstash/redis');

// Initialize Upstash Redis exactly like your server.js
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

/**
 * Cache middleware for GET requests
 * @param {number} ttl - Time to live in seconds (default: 300 = 5 mins)
 */
const cacheMiddleware = (ttl = 300) => {
    return async (req, res, next) => {
        // Only cache GET requests
        if (req.method !== 'GET') {
            return next();
        }

        const key = `cache:${req.originalUrl}`;
        
        try {
            // Try to fetch from Redis
            const cached = await redis.get(key);
            if (cached) {
                res.set('X-Cache', 'HIT');
                // Upstash automatically parses JSON, but we handle string fallback just in case
                const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
                return res.json(data);
            }
        } catch (err) {
            console.warn('Redis Cache read error:', err.message);
        }

        // Intercept res.json to cache the response before sending it
        const originalJson = res.json.bind(res);
        res.json = function(data) {
            try {
                // Save to Redis (Upstash syntax uses { ex: seconds })
                redis.set(key, JSON.stringify(data), { ex: ttl })
                    .catch(err => console.warn('Redis Cache write error:', err.message));
            } catch (err) {
                console.warn('Cache serialization error:', err.message);
            }
            
            res.set('X-Cache', 'MISS');
            return originalJson(data);
        };

        next();
    };
};

module.exports = cacheMiddleware;