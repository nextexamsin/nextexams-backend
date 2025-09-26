import TestSeriesGroup from '../models/testSeriesGroupModel.js';
import TestSeries from '../models/testSeriesModel.js';

// Create new group
export const createTestSeriesGroup = async (req, res) => {
  try {
    const { name, description, testSeries } = req.body;

    const newGroup = new TestSeriesGroup({ name, description });
    const savedGroup = await newGroup.save();

    const clonedTestSeriesIds = [];

    for (const tsId of testSeries) {
      const original = await TestSeries.findById(tsId).lean();
      if (!original) continue;

      // Remove _id, timestamps, and attempts before cloning
      const { _id, attempts, createdAt, updatedAt, ...rest } = original;

      const cloned = new TestSeries({
        ...rest,
        originalId: _id,
        groupId: savedGroup._id 
      });

      const savedClone = await cloned.save();
      clonedTestSeriesIds.push(savedClone._id);
    }

    // Update the group with cloned test series
    savedGroup.testSeries = clonedTestSeriesIds;
    await savedGroup.save();

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
      // Stage 1: Sort the groups first
      {
        $sort: { createdAt: -1 }
      },
      // Stage 2: Perform the equivalent of populate('testSeries')
      {
        $lookup: {
          from: 'testseries', // The name of the test series collection in MongoDB
          localField: 'testSeries',
          foreignField: '_id',
          as: 'testSeriesDetails'
        }
      },
      // Stage 3: Add the new fields for free and paid counts
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
      // Stage 4: Clean up the output to match your original structure
      {
        $project: {
          name: 1,
          description: 1,
          testSeries: '$testSeriesDetails', // Send the populated test series
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


// ✅ Corrected: Get group by ID
export const getTestSeriesGroupById = async (req, res) => {
    try {
        const group = await TestSeriesGroup.findById(req.params.id).populate({
            path: 'testSeries',
            populate: { path: 'attempts.userId', select: '_id' },
        });

        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        const userId = req.user?._id?.toString();
        const validTests = group.testSeries.filter(test => test && test._id);

        const groupWithUserStatus = {
            ...group.toObject(),
            testSeries: validTests.map(test => {
                const testObj = test.toObject();
                const userAttempts =
                    test.attempts?.filter(a => a.userId?._id?.toString() === userId) ||
                    [];

                let status = 'not-started';
                let mainAttemptId = null;
                let attemptNumber = null;
                let userPerformance = {};
                let inProgressAttemptId = null;

                if (userAttempts.length > 0) {
                    const inProgressAttempt = userAttempts.find(a => !a.isCompleted);
                    const latestCompletedAttempt = userAttempts
                        .filter(a => a.isCompleted)
                        .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))[0];
                    
                    if (latestCompletedAttempt) {
                        status = 'completed';
                        mainAttemptId = latestCompletedAttempt._id;
                        attemptNumber = latestCompletedAttempt.attemptNumber;

                        const leaderboard = test.attempts
                            .filter(a => a.isCompleted && a.attemptNumber === latestCompletedAttempt.attemptNumber)
                            .sort((a, b) => (b.score || 0) - (a.score || 0));
                        
                        const totalUsersInAttempt = leaderboard.length;
                        const rankIndex = leaderboard.findIndex(u => u._id.equals(latestCompletedAttempt._id));
                        const userRank = rankIndex > -1 ? rankIndex + 1 : '-';

                        // --- THIS IS THE FIX ---
                        // We are now adding the correct `totalMarks` from the user's attempt
                        // to the data we send to the frontend.
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



// ✅ Get recent test groups based on user's latest attempts
export const getRecentTestSeriesGroups = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get the latest 8 attempts by the user
    const recentTests = await TestSeries.find({ 'attempts.userId': userId })
      .sort({ updatedAt: -1 })
      .limit(10)
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
