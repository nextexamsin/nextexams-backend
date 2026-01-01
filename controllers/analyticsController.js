const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const path = require('path');

// --- 1. Initialize Client safely from FILE ---
let analyticsDataClient;
try {
    // Points to: nextExams-backend/config/google-analytics-key.json
    const keyPath = path.join(__dirname, '../config/google-analytics-key.json');
    
    analyticsDataClient = new BetaAnalyticsDataClient({
        keyFilename: keyPath,
    });
    console.log("✅ Analytics Client Initialized from File");
} catch (error) {
    console.error("❌ Analytics Init Failed:", error.message);
}

const propertyId = process.env.GA4_PROPERTY_ID; 

// --- 2. Main Report Function (Historical Data) ---
const getGA4Report = async (req, res) => {
    if (!analyticsDataClient) return res.status(503).json({ message: "Analytics not ready." });

    try {
        const { startDate = '30daysAgo', endDate = 'today' } = req.query;

        // Run 3 Reports in Parallel
        const [trendReport, countryReport, pageReport] = await Promise.all([
            analyticsDataClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate, endDate }],
                dimensions: [{ name: 'date' }],
                metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
                orderBys: [{ dimension: { dimensionName: 'date' } }]
            }),
            analyticsDataClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate, endDate }],
                dimensions: [{ name: 'country' }],
                metrics: [{ name: 'activeUsers' }],
                limit: 5
            }),
            analyticsDataClient.runReport({
                property: `properties/${propertyId}`,
                dateRanges: [{ startDate, endDate }],
                dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
                metrics: [{ name: 'screenPageViews' }],
                limit: 5
            })
        ]);

        // Process Data
        const chartData = (trendReport[0].rows || []).map(row => ({
            date: row.dimensionValues[0].value,
            users: parseInt(row.metricValues[0].value),
            sessions: parseInt(row.metricValues[1].value),
        }));

        const countries = (countryReport[0].rows || []).map(row => ({
            name: row.dimensionValues[0].value,
            users: parseInt(row.metricValues[0].value)
        }));

        const pages = (pageReport[0].rows || []).map(row => ({
            path: row.dimensionValues[0].value,
            title: row.dimensionValues[1].value,
            views: parseInt(row.metricValues[0].value)
        }));

        const totalUsers = chartData.reduce((acc, curr) => acc + curr.users, 0);
        const totalSessions = chartData.reduce((acc, curr) => acc + curr.sessions, 0);

        res.json({ chartData, countries, pages, summary: { totalUsers, totalSessions } });

    } catch (error) {
        console.error("GA4 Report Error:", error.message);
        res.status(500).json({ message: "Failed to fetch analytics" });
    }
};

// --- 3. Real-Time Report (Fixed Logic) ---
const getRealtimeReport = async (req, res) => {
    try {
        // 1. Get Logged-in Users Map
        const onlineUsersMap = req.onlineUsers || {};
        
        // ✅ FAST MAPPING: Convert Map to lightweight Array (Name & Email only)
        // This ensures the response is small and loads quickly on the frontend
        const userList = Object.values(onlineUsersMap).map(u => ({
            name: u.name || 'Unknown',
            email: u.email || ''
        }));

        const registeredCount = userList.length;

        // 2. Get Total Connections
        const totalCount = req.totalConnections || registeredCount;

        // 3. Calculate Guests
        const guestCount = Math.max(0, totalCount - registeredCount);

        res.json({ 
            activeUsers: totalCount,
            registered: registeredCount,
            guests: guestCount,
            userList: userList // ✅ CRITICAL: Sending the list so the Modal isn't empty
        });

    } catch (error) {
        console.error("Realtime Error:", error);
        res.status(500).json({ message: "Failed to fetch live count" });
    }
};

module.exports = { getGA4Report, getRealtimeReport };

module.exports = { getGA4Report, getRealtimeReport };