import TestSeriesGroup from '../models/testSeriesGroupModel.js';
import TestSeries from '../models/testSeriesModel.js';
import TestAttempt from '../models/TestAttempt.js';
import cacheMiddlewareObj from '../middleware/cacheMiddleware.js';
const clearCache = cacheMiddlewareObj.clearCache;

// Create new group
export const createTestSeriesGroup = async (req, res) => {
  try {
    const { name, description, imageUrl, testSeries, tags } = req.body;

    const newGroup = new TestSeriesGroup({
      name,
      description,
      imageUrl,
      testSeries: testSeries,
      tags: tags || [], 
    });

    const savedGroup = await newGroup.save();
    await clearCache('cache:/api/testseries-groups*');
    res.status(201).json(savedGroup);
  } catch (err) {
    console.error('Create TestSeriesGroup Error:', err.message);
    res.status(400).json({ error: err.message });
  }
};

// Get all groups
export const getAllTestSeriesGroups = async (req, res) => {
  try {
    const groupsWithCounts = await TestSeriesGroup.aggregate([
      {
        $sort: { createdAt: -1 }
      },
      {
        $lookup: {
          from: 'testseries',
          localField: 'testSeries',
          foreignField: '_id',
          as: 'testSeriesDetails'
        }
      },
      {
        $addFields: {
          freeCount: {
            $size: {
              $filter: {
                input: '$testSeriesDetails',
                as: 'ts',
                cond: { $eq: ['$$ts.isPaid', false] }
              }
            }
          },
          paidCount: {
            $size: {
              $filter: {
                input: '$testSeriesDetails',
                as: 'ts',
                cond: { $eq: ['$$ts.isPaid', true] }
              }
            }
          }
        }
      },
      {
        $project: {
          name: 1,
          description: 1,
          imageUrl: 1,
          tags: 1,
          testSeries: '$testSeriesDetails', 
          createdAt: 1,
          updatedAt: 1,
          freeCount: 1,
          paidCount: 1,
        }
      }
    ]);

    res.json(groupsWithCounts);
  } catch (err) {
    console.error('Get All TestSeriesGroups Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ✅ FIXED: N+1 Loop removed. Uses O(1) Hash Map lookups.
export const getTestSeriesGroupById = async (req, res) => {
    try {
        const group = await TestSeriesGroup.findById(req.params.id)
            .populate('testSeries')
            .lean();

        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        const userId = req.user?._id?.toString();
        const validTests = group.testSeries.filter(test => test && test._id);
        const testIds = validTests.map(t => t._id);

        const userAttempts = await TestAttempt.find({
            userId: userId,
            testSeriesId: { $in: testIds }
        }).lean();

        const allCompletedAttempts = await TestAttempt.find({
            testSeriesId: { $in: testIds },
            isCompleted: true
        }).select('_id testSeriesId attemptNumber score totalMarks').lean(); 

        // 🚀 THE FIX: Create Hash Map for instant lookups
        const leaderboardMap = new Map();
        allCompletedAttempts.forEach(attempt => {
            const key = `${attempt.testSeriesId.toString()}_${attempt.attemptNumber}`;
            if (!leaderboardMap.has(key)) {
                leaderboardMap.set(key, []);
            }
            leaderboardMap.get(key).push(attempt);
        });

        // 🚀 Sort each leaderboard once upfront instead of on every loop
        leaderboardMap.forEach(leaderboard => {
            leaderboard.sort((a, b) => (b.score || 0) - (a.score || 0));
        });

        const groupWithUserStatus = {
            ...group,
            testSeries: validTests.map(test => {
                const currentTestUserAttempts = userAttempts.filter(a => a.testSeriesId.toString() === test._id.toString());

                let status = 'not-started';
                let mainAttemptId = null;
                let attemptNumber = null;
                let userPerformance = {};
                let inProgressAttemptId = null;

                if (currentTestUserAttempts.length > 0) {
                    const inProgressAttempt = currentTestUserAttempts.find(a => !a.isCompleted);
                    const latestCompletedAttempt = currentTestUserAttempts
                        .filter(a => a.isCompleted)
                        .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))[0];
                    
                    if (latestCompletedAttempt) {
                        status = 'completed';
                        mainAttemptId = latestCompletedAttempt._id;
                        attemptNumber = latestCompletedAttempt.attemptNumber;

                        // 🚀 USE HASH MAP INSTEAD OF .filter()
                        const key = `${test._id.toString()}_${latestCompletedAttempt.attemptNumber}`;
                        const leaderboard = leaderboardMap.get(key) || [];
                        
                        const totalUsersInAttempt = leaderboard.length;
                        const rankIndex = leaderboard.findIndex(u => u._id.toString() === latestCompletedAttempt._id.toString());
                        const userRank = rankIndex > -1 ? rankIndex + 1 : '-';

                        userPerformance = {
                            marks: latestCompletedAttempt.score,
                            totalMarks: latestCompletedAttempt.totalMarks, 
                            rank: userRank,
                            totalUsers: totalUsersInAttempt,
                        };
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
                    ...userPerformance,
                    status,
                    attemptId: mainAttemptId,
                    attemptNumber,
                    inProgressAttemptId,
                };
            }),
        };

        res.json(groupWithUserStatus);
    } catch (err) {
        console.error('Get TestSeriesGroup Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// Update group
export const updateTestSeriesGroup = async (req, res) => {
  try {
    const updated = await TestSeriesGroup.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Group not found' });
    await clearCache('cache:/api/testseries-groups*');
    res.json(updated);
  } catch (err) {
    console.error('Update TestSeriesGroup Error:', err.message);
    res.status(400).json({ error: err.message });
  }
};

// Delete group
export const deleteTestSeriesGroup = async (req, res) => {
  try {
    const deleted = await TestSeriesGroup.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Group not found' });
    await clearCache('cache:/api/testseries-groups*');
    res.json({ message: 'Group deleted' });
  } catch (err) {
    console.error('Delete TestSeriesGroup Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

export const getFullTestSeriesGroups = async (req, res) => {
  try {
    if (!req.query.page) {
        const groups = await TestSeriesGroup.find()
            .populate({
                path: 'testSeries',
                select: 'title exam testType isPaid tags status subject isLiveTest' 
            })
            .sort({ createdAt: -1 })
            .lean();
        return res.json(groups);
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20; 
    const search = req.query.search || '';
    const tag = req.query.tag || 'All';
    const skip = (page - 1) * limit;

    const matchStage = {};
    if (search) {
      matchStage.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    if (tag && tag !== 'All') {
      matchStage.tags = tag;
    }

    const [allTags, metadata] = await Promise.all([
      TestSeriesGroup.distinct('tags'),
      TestSeriesGroup.aggregate([
        { $match: matchStage },
        { $count: "total" }
      ])
    ]);

    const total = metadata.length > 0 ? metadata[0].total : 0;

    const groups = await TestSeriesGroup.aggregate([
      { $match: matchStage },
      { $addFields: { testSeriesCount: { $size: { $ifNull: ["$testSeries", []] } } } },
      { $sort: { testSeriesCount: -1, createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'testseries', 
          localField: 'testSeries',
          foreignField: '_id',
          pipeline: [
            { $project: { title: 1, exam: 1, testType: 1, isPaid: 1, tags: 1, status: 1, subject: 1, isLiveTest: 1 } }
          ],
          as: 'testSeries'
        }
      }
    ]);

    res.json({
      groups,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      allTags: ['All', ...allTags.sort()] 
    });
  } catch (err) {
    console.error('Get Full Groups Error:', err);
    res.status(500).json({ message: 'Failed to load test series groups' });
  }
};

export const getRecentTestSeriesGroups = async (req, res) => {
  try {
    const userId = req.user._id;

    const recentAttempts = await TestAttempt.find({ userId })
      .sort({ updatedAt: -1 })
      .limit(10)
      .select('testSeriesId')
      .lean();

    const uniqueTestIds = [...new Set(recentAttempts.map(a => a.testSeriesId.toString()))];

    const recentTests = await TestSeries.find({ _id: { $in: uniqueTestIds } })
      .select('_id groupId title')
      .lean();

    const uniqueGroupIds = [
      ...new Set(recentTests.map(test => test.groupId?.toString()).filter(Boolean))
    ];

    const groups = await TestSeriesGroup.find({ _id: { $in: uniqueGroupIds } })
      .populate('testSeries')
      .lean();

    res.json(groups);
  } catch (err) {
    console.error('Get Recent TestSeriesGroups Error:', err.message);
    res.status(500).json({ error: 'Failed to load recent groups' });
  }
};

export const getPublishedGroupsWithTests = async (req, res) => {
    try {
        const groups = await TestSeriesGroup.find()
            .populate({
                path: 'testSeries',
                match: { status: 'published' },
                select: 'title description exam totalMarks isPaid status' 
            })
            .sort({ createdAt: -1 })
            .lean();

        const activeGroups = groups.filter(group => group.testSeries.length > 0);
        res.json(activeGroups);
    } catch (err) {
        console.error('Error fetching published groups with tests:', err.message);
        res.status(500).json({ message: 'Server error while fetching test groups.' });
    }
};

export const getPublicTestSeriesGroupById = async (req, res) => {
    try {
        const group = await TestSeriesGroup.findById(req.params.id).select('name description imageUrl examCategory tags').lean();
        if (!group) return res.status(404).json({ error: 'Group not found' });
        res.json(group);
    } catch (err) {
        console.error('Get Public TestSeriesGroup Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};