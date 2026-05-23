const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const TestSeries = require('../models/testSeriesModel');
const TestAttempt = require('../models/TestAttempt');
const User = require('../models/User');

const router = express.Router();

router.get('/live-tests-summary', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const now = new Date();

        // 1️⃣ Fetch tests WITH ALL REQUIRED DATES
        const tests = await TestSeries.find({
            status: 'published',
            isLiveTest: true,
            $or: [
                { liveStartTime: { $lte: now } }, 
                { registrationStartTime: { $gte: now } }, 
                { liveTestType: 'flexible' },
                { testWindowEndTime: { $gte: now } } // Ensure active tests are caught
            ]
        })
            .select(`
                title exam totalMarks isPaid isLiveTest testDurationInMinutes 
                testWindowStartTime testWindowEndTime resultPublishTime releaseDate 
                liveStartTime liveEndTime registrationStartTime registrationEndTime 
                instructions subject testType
            `)
            .lean()
            .sort({ createdAt: -1 })
            .limit(50);

        // 2️⃣ Fetch user attempts
        const testIds = tests.map(t => t._id);
        const userAttempts = await TestAttempt.find({
            userId: userId,
            testSeriesId: { $in: testIds }
        })
            .select('testSeriesId isCompleted score attemptNumber endedAt')
            .lean();

        // 3️⃣ Create lookup map
        const attemptMap = {};
        userAttempts.forEach(attempt => {
            if (!attemptMap[attempt.testSeriesId.toString()]) {
                attemptMap[attempt.testSeriesId.toString()] = [];
            }
            attemptMap[attempt.testSeriesId.toString()].push(attempt);
        });

        // 4️⃣ Enrich tests ensuring exact data shape for the UI
        const enrichedTests = tests.map(test => {
            const currentTestUserAttempts = attemptMap[test._id.toString()] || [];
            
            let status = 'not-started';
            let mainAttemptId = null;
            let inProgressAttemptId = null;

            if (currentTestUserAttempts.length > 0) {
                const inProgressAttempt = currentTestUserAttempts.find(a => !a.isCompleted);
                const latestCompletedAttempt = currentTestUserAttempts
                    .filter(a => a.isCompleted)
                    .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))[0];
                
                if (latestCompletedAttempt) {
                    status = 'completed';
                    mainAttemptId = latestCompletedAttempt._id;
                }

                if (inProgressAttempt) {
                    inProgressAttemptId = inProgressAttempt._id;
                    if (!latestCompletedAttempt) {
                        status = 'in-progress';
                        mainAttemptId = inProgressAttempt._id;
                    }
                }
            }

            return {
                ...test,
                status,
                attemptId: mainAttemptId,
                inProgressAttemptId
            };
        });

        res.json({ tests: enrichedTests });

    } catch (err) {
        console.error('Dashboard API Error:', err.message);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

module.exports = router;