// middleware/cacheMiddleware.js
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
        if (req.method !== 'GET') {
            return next();
        }

        const key = `cache:${req.originalUrl}`;
        
        try {
            const cached = await redis.get(key);
            if (cached) {
                res.set('X-Cache', 'HIT');
                const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
                return res.json(data);
            }
        } catch (err) {
            console.warn('Redis Cache read error:', err.message);
        }

        const originalJson = res.json.bind(res);
        res.json = function(data) {
            try {
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

// 🚀 NEW: Function to clear cache from Upstash Redis
const clearCache = async (pattern = 'cache:*') => {
    try {
        // Find all keys matching the pattern (e.g., 'cache:/api/testseries-groups*')
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
            await redis.del(...keys); // Delete all matched keys
            console.log(`✅ Cleared ${keys.length} cache entries for pattern: ${pattern}`);
        }
    } catch (err) {
        console.error('❌ Redis Cache clear error:', err.message);
    }
};

// Export the middleware as default, and attach clearCache to it
module.exports = cacheMiddleware;
module.exports.clearCache = clearCache;