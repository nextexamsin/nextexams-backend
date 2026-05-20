import TestSeriesGroup from '../models/testSeriesGroupModel.js';
import TestSeries from '../models/testSeriesModel.js';
// ✅ NEW: Import the standalone TestAttempt model
import TestAttempt from '../models/TestAttempt.js';

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
          from: 'testseries', // The name of the test series collection in MongoDB
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


// ✅ FIXED: Get group by ID and calculate ranks using TestAttempt collection
export const getTestSeriesGroupById = async (req, res) => {
    try {
        // 1. Fetch group without trying to populate 'attempts'
        const group = await TestSeriesGroup.findById(req.params.id).populate('testSeries');

        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        const userId = req.user?._id?.toString();
        const validTests = group.testSeries.filter(test => test && test._id);
        const testIds = validTests.map(t => t._id);

        // 2. Fetch User Attempts from the NEW TestAttempt collection
        const userAttempts = await TestAttempt.find({
            userId: userId,
            testSeriesId: { $in: testIds }
        }).lean();

        // 3. Fetch ALL completed attempts for these tests to calculate leaderboards instantly
        const allCompletedAttempts = await TestAttempt.find({
            testSeriesId: { $in: testIds },
            isCompleted: true
        }).select('_id testSeriesId attemptNumber score').lean();

        const groupWithUserStatus = {
            ...group.toObject(),
            testSeries: validTests.map(test => {
                const testObj = test.toObject();
                
                // Filter attempts for THIS specific test
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

                        // Calculate Rank in Memory (Lightning Fast)
                        const leaderboard = allCompletedAttempts
                            .filter(a => a.testSeriesId.toString() === test._id.toString() && a.attemptNumber === latestCompletedAttempt.attemptNumber)
                            .sort((a, b) => (b.score || 0) - (a.score || 0));
                        
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
                    ...testObj,
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
    res.json({ message: 'Group deleted' });
  } catch (err) {
    console.error('Delete TestSeriesGroup Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// Get full list of test series groups with populated test series
export const getFullTestSeriesGroups = async (req, res) => {
  try {
    const groups = await TestSeriesGroup.find()
      .populate('testSeries')
      .lean();

    res.json(groups);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load test series groups' });
  }
};

// ✅ FIXED: Get recent test groups based on user's latest attempts via TestAttempt
export const getRecentTestSeriesGroups = async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Fetch latest attempts from TestAttempt collection
    const recentAttempts = await TestAttempt.find({ userId })
      .sort({ updatedAt: -1 })
      .limit(10)
      .select('testSeriesId')
      .lean();

    const uniqueTestIds = [...new Set(recentAttempts.map(a => a.testSeriesId.toString()))];

    // 2. Find the tests to get their groupIds
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
            .sort({ createdAt: -1 }); 

        const activeGroups = groups.filter(group => group.testSeries.length > 0);

        res.json(activeGroups);
    } catch (err) {
        console.error('Error fetching published groups with tests:', err.message);
        res.status(500).json({ message: 'Server error while fetching test groups.' });
    }
};

export const getPublicTestSeriesGroupById = async (req, res) => {
    try {
        const group = await TestSeriesGroup.findById(req.params.id).select('name description imageUrl examCategory tags');

        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }
        res.json(group);
    } catch (err) {
        console.error('Get Public TestSeriesGroup Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};