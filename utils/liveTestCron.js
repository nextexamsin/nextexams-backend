import cron from 'node-cron';
import TestSeries from '../models/testSeriesModel.js';
import TestAttempt from '../models/TestAttempt.js';
import calcScore from './calcScore.js';

// Pass redis instance from server.js to this function when initializing
export const initializeLiveTestCron = (redis) => {
    
    // ⏱️ Runs every minute to manage Live Test states
    cron.schedule('* * * * *', async () => {
        const now = new Date();
        
        try {
            // ---------------------------------------------------------
            // TASK 1: UPDATE STATUS (Upcoming -> Live -> Completed)
            // ---------------------------------------------------------
            // Start tests that have hit their window
            await TestSeries.updateMany(
                { isLiveTest: true, liveTestStatus: 'Upcoming', testWindowStartTime: { $lte: now } },
                { $set: { liveTestStatus: 'Live' } }
            );

            // Close tests that have ended
            await TestSeries.updateMany(
                { isLiveTest: true, liveTestStatus: 'Live', testWindowEndTime: { $lte: now } },
                { $set: { liveTestStatus: 'Completed' } }
            );


            // ---------------------------------------------------------
            // TASK 2: PROCESS & PUBLISH RESULTS (The Heavy Lifter)
            // ---------------------------------------------------------
            const testsToPublish = await TestSeries.find({
                isLiveTest: true,
                liveTestStatus: { $ne: 'ResultsPublished' },
                resultPublishTime: { $lte: now }
            }).populate('sections.questions'); // Need questions to grade auto-submits

            for (const test of testsToPublish) {
                console.log(`[Cron] Publishing results for Live Test: ${test.title}`);

                // A. Force Submit unsubmitted attempts (Users whose internet dropped)
                const unsubmittedAttempts = await TestAttempt.find({ testSeriesId: test._id, isCompleted: false });
                
                for (let attempt of unsubmittedAttempts) {
                    const { score, total } = calcScore(attempt.answers, test);
                    attempt.isCompleted = true;
                    attempt.endedAt = test.testWindowEndTime || now;
                    attempt.score = score;
                    attempt.totalMarks = total;
                    await attempt.save();
                }

                // B. Fetch all completed attempts to calculate Ranks
                const allAttempts = await TestAttempt.find({ testSeriesId: test._id, isCompleted: true })
                    .select('_id score answers timeTaken')
                    .lean();

                // C. Sort Logic with Tie-Breaker (Score DESC, TimeTaken ASC)
                allAttempts.sort((a, b) => {
                    if (b.score !== a.score) return b.score - a.score; // Highest score first
                    
                    // Tie-Breaker: Whoever took less time gets a better rank
                    const timeA = a.timeTaken || a.answers?.reduce((sum, ans) => sum + (ans.timeTaken || 0), 0) || 0;
                    const timeB = b.timeTaken || b.answers?.reduce((sum, ans) => sum + (ans.timeTaken || 0), 0) || 0;
                    return timeA - timeB; 
                });

                // D. Prepare BulkWrite for extreme performance (Updates 10,000 attempts in 1 DB call)
                const bulkOps = allAttempts.map((attempt, index) => {
                    const rank = index + 1;
                    const percentile = ((allAttempts.length - rank) / allAttempts.length) * 100;

                    return {
                        updateOne: {
                            filter: { _id: attempt._id },
                            update: { $set: { rank, percentile, isResultPending: false } }
                        }
                    };
                });

                if (bulkOps.length > 0) {
                    await TestAttempt.bulkWrite(bulkOps);
                }

                // E. Finalize Test Status
                test.liveTestStatus = 'ResultsPublished';
                await test.save();

                // F. Clear Redis Caches so the frontend sees the fresh results
                if (redis) {
                    const pipeline = redis.pipeline();
                    pipeline.del(`TEST_CONTENT_V1:${test._id}`);
                    pipeline.del(`SOLUTION_STATIC_V1:${test._id}`);
                    pipeline.del(`LEADERBOARD_V1:${test._id}`);
                    await pipeline.exec();
                }

                console.log(`✅ Results Published for ${test.title}. Processed ${allAttempts.length} users.`);
            }

        } catch (error) {
            console.error('[Cron] Live Test Automation Error:', error);
        }
    });

    console.log('✅ Live Test Automation Engine (Cron) Initialized.');
};