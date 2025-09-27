// nextExams-backend/controllers/testSeriesController.js
import mongoose from 'mongoose';
import xlsx from 'xlsx';
import Question from '../models/Question.js';
import TestSeries from '../models/testSeriesModel.js';
import TestSeriesGroup from '../models/testSeriesGroupModel.js'
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import calcScore from '../utils/calcScore.js';

const detailedQuestionPopulation = {
  path: 'sections.questions',
  model: 'Question',
  select: 'questionType correctAnswer answerMin answerMax marks negativeMarks'
};


export const createTestSeries = async (req, res) => {
    try {
        const { sections, testDurationInMinutes } = req.body;

        if (!testDurationInMinutes && sections?.length > 0) {
            req.body.testDurationInMinutes = sections.reduce((sum, sec) => {
                return sum + (Number(sec.durationInMinutes) || 0);
            }, 0);
        }

        const test = new TestSeries(req.body);

        await test.populate('sections.questions');
        const { total } = calcScore([], test);
        test.totalMarks = total;

        const savedTest = await test.save();

        const questionIds = savedTest.sections.flatMap(sec => sec.questions.map(q => q._id));
        const sourceTag = `source_test_${savedTest._id}`;

        await Question.updateMany(
            { _id: { $in: questionIds } },
            { $addToSet: { tags: sourceTag } }
        );

        // --- Notification Logic ---
        try {
            if (savedTest.isPublished) {
                const message = `🚀 New Test Available: ${savedTest.title}`;
                const link = `/tests/${savedTest._id}`;
                const allUsers = await User.find({ role: 'user' }, '_id');

                if (allUsers.length > 0) {
                    const notifications = allUsers.map(user => ({
                        user: user._id,
                        message,
                        link
                    }));
                    await Notification.insertMany(notifications);

                    allUsers.forEach(user => {
                        if (req.onlineUsers && req.onlineUsers[user._id.toString()]) {
                           const userSocketId = req.onlineUsers[user._id.toString()];
                           req.io.to(userSocketId).emit("newNotification", { message, link });
                        }
                    });
                }
            }
        } catch (notificationError) {
            console.error("Failed to send notifications:", notificationError);
        }

        res.status(201).json(savedTest);
    } catch (err) {
        console.error('Create TestSeries Error:', err.message, err.stack);
        res.status(400).json({ error: err.message });
    }
};

export  const generateDynamicTestSeries = async (req, res) => {
    try {
        const { name: title, sections: sectionRules, ...testDetails } = req.body;

        if (!title || !testDetails.exam || !sectionRules || !Array.isArray(sectionRules) || sectionRules.length === 0) {
            return res.status(400).json({ error: 'Test series title, exam, and at least one section rule are required.' });
        }

        const allGeneratedQuestionIds = new Set();
        const finalSections = [];

        for (const section of sectionRules) {
            const sectionQuestionIds = [];
            
            for (const rule of section.rules) {
                const query = {};
                if (rule.subject) query.subject = rule.subject;
                if (rule.chapter) query.chapter = rule.chapter;
                if (rule.topic) query.topic = rule.topic;
                if (rule.difficulty) query.difficulty = rule.difficulty;

                if (allGeneratedQuestionIds.size > 0) {
                    query._id = { $nin: [...allGeneratedQuestionIds].map(id => new mongoose.Types.ObjectId(id)) };
                }

                const sourceTag = (rule.tags || []).find(tag => tag.startsWith('source_test_'));
                if (sourceTag) {
                    const sourceTestId = sourceTag.replace('source_test_', '');
                    const sourceTest = await TestSeries.findById(sourceTestId).lean();
                    
                    if (sourceTest && Array.isArray(sourceTest.sections)) {
                        const sourceQuestionIds = sourceTest.sections.flatMap(sec => sec.questions);
                        query._id = { ...query._id, $in: sourceQuestionIds };
                    } else {
                        query._id = { ...query._id, $in: [] }; 
                    }
                }

                const questions = await Question.aggregate([
                    { $match: query },
                    { $sample: { size: Number(rule.count) || 0 } },
                    { $project: { _id: 1 } }
                ]);

                const questionIds = questions.map(q => q._id);

                if (questionIds.length < rule.count) {
                    const ruleDescription = `${rule.subject || 'Any Subject'} > ${rule.chapter || 'Any Chapter'}`;
                    return res.status(400).json({ 
                        error: `Not enough questions for rule: [${ruleDescription}]. Found ${questionIds.length}, needed ${rule.count}.`
                    });
                }
                
                questionIds.forEach(id => {
                    sectionQuestionIds.push(id);
                    allGeneratedQuestionIds.add(id.toString());
                });
            }

            finalSections.push({
                title: section.title,
                durationInMinutes: section.durationInMinutes,
                questions: sectionQuestionIds,
                marksPerQuestion: section.marksPerQuestion,
                negativeMarking: section.negativeMarking,
                markingScheme: section.markingScheme,
            });
        }
        
        const newTestSeries = new TestSeries({
            title,
            sections: finalSections,
            ...testDetails,
            createdBy: req.user._id, 
        });
        
        await newTestSeries.populate('sections.questions');
        const { total } = calcScore([], newTestSeries);
        newTestSeries.totalMarks = total;

        const savedTest = await newTestSeries.save();
        
        // --- Notification Logic ---
        // (Can be refactored into a helper function to avoid repetition)
        try {
            if (savedTest.isPublished) {
                const message = `🚀 New Test Available: ${savedTest.title}`;
                const link = `/tests/${savedTest._id}`;
                const allUsers = await User.find({ role: 'user' }, '_id');
                if (allUsers.length > 0) {
                    const notifications = allUsers.map(user => ({ user: user._id, message, link }));
                    await Notification.insertMany(notifications);
                    allUsers.forEach(user => {
                         if (req.onlineUsers && req.onlineUsers[user._id.toString()]) {
                           const userSocketId = req.onlineUsers[user._id.toString()];
                           req.io.to(userSocketId).emit("newNotification", { message, link });
                        }
                    });
                }
            }
        } catch (notificationError) {
            console.error("Failed to send notifications for dynamic test:", notificationError);
        }

        res.status(201).json(savedTest);
    } catch (error) {
        console.error('Error generating dynamic test:', error);
        res.status(500).json({ error: error.message || 'Server error while generating test.' });
    }
};


export const bulkUploadTestSeries = async (req, res) => {
    const { groupId } = req.body; // Can be an empty string
    if (!req.file) {
        return res.status(400).json({ message: 'No Excel file uploaded.' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const detailsSheet = workbook.Sheets['TestSeries_Details'];
        const questionsSheet = workbook.Sheets['Questions'];
        if (!detailsSheet || !questionsSheet) throw new Error("Excel file must contain 'TestSeries_Details' and 'Questions' sheets.");
        
        const testDetailsJSON = xlsx.utils.sheet_to_json(detailsSheet);
        const questionsJSON = xlsx.utils.sheet_to_json(questionsSheet);

        if (testDetailsJSON.length !== 1) throw new Error("'TestSeries_Details' sheet must have exactly one row of data.");
        if (questionsJSON.length === 0) throw new Error("'Questions' sheet cannot be empty.");
        
        const details = testDetailsJSON[0];
        
        const questionsToCreate = questionsJSON.map(q => ({
            questionText: q['Question Text'],
            questionImage: q['Question Image'] || null,
            questionType: q['Question Type']?.toLowerCase(),
            options: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(opt => ({ label: opt, text: q[`Option ${opt}`] })).filter(opt => opt.text != null && String(opt.text).trim() !== ''),
            correctAnswer: q['Correct Answer']?.toString().split(',').map(s => s.trim()),
            explanation: q.Explanation,
            exam: details['Exam'],
            subject: q.Subject,
            chapter: q.Chapter,
            topic: q.Topic,
            difficulty: q.Difficulty?.toLowerCase(),
            // ✅ FIX #2: Add descriptive tags automatically
            tags: [q.Subject, q.Chapter, q.Topic, q.Difficulty, details.Exam].filter(Boolean) // filter(Boolean) removes any empty/null values
        }));
        
        const createdQuestionDocs = await Question.insertMany(questionsToCreate, { session });

        const sectionsMap = new Map();
        createdQuestionDocs.forEach((doc, index) => {
            const sectionTitle = questionsJSON[index]['Section Title'];
            if (!sectionsMap.has(sectionTitle)) sectionsMap.set(sectionTitle, []);
            sectionsMap.get(sectionTitle).push(doc._id);
        });

        const finalSections = Array.from(sectionsMap.entries()).map(([title, questions]) => ({ title, questions }));

        const newTest = new TestSeries({
            title: details['Test Title'],
            testType: details['Test Type']?.toLowerCase() || 'full-length',
            exam: details['Exam'],
            description: details['Description'],
            testDurationInMinutes: details['Duration (Mins)'] || null,
            allowSectionJump: details['Allow Section Jump']?.toUpperCase() === 'YES',
            isPaid: details['Is Paid?']?.toUpperCase() === 'YES',
            isPublished: details['Is Published?']?.toUpperCase() === 'YES',
            releaseDate: details['Release Date'] ? new Date(details['Release Date']) : null,
            sections: finalSections,
            groupId: groupId || null, // Assign groupId if it exists
        });
        
        const tempTestForCalc = { ...newTest.toObject(), sections: newTest.sections.map(sec => ({...sec, questions: sec.questions.map(qId => createdQuestionDocs.find(doc => doc._id.equals(qId))) })) };
        const { total } = calcScore([], tempTestForCalc);
        newTest.totalMarks = total;

        const savedTest = await newTest.save({ session });
        
        const sourceTag = `source_test_${savedTest._id}`;
        const questionIdsToTag = createdQuestionDocs.map(q => q._id);
        await Question.updateMany({ _id: { $in: questionIdsToTag } }, { $addToSet: { tags: sourceTag } }, { session });

        // ✅ FIX #1: If a group was selected, add this test to the group's list
        if (groupId) {
            await TestSeriesGroup.updateOne(
                { _id: groupId },
                { $addToSet: { testSeries: savedTest._id } },
                { session }
            );
        }

        await session.commitTransaction();
        res.status(201).json({ message: `Test "${savedTest.title}" uploaded successfully!`, test: savedTest });
    } catch (error) {
        await session.abortTransaction();
        console.error('Bulk Upload Error:', error);
        res.status(500).json({ message: error.message || 'An error occurred during the upload.' });
    } finally {
        session.endSession();
    }
};

// GET: All test series
export const getAllTestSeries = async (req, res) => {
  try {
    const tests = await TestSeries.find().sort({ createdAt: -1 });
    const uniqueTests = tests.filter((test, index, self) =>
      index === self.findIndex(t => t._id.toString() === test._id.toString())
    );
    res.json(uniqueTests);
  } catch (err) {
    console.error('Get All TestSeries Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};


// GET: Single test series by ID
export const getTestSeriesById = async (req, res) => {
  try {
    const test = await TestSeries.findById(req.params.id)
      .populate('sections.questions', 'questionText questionImage options marks negativeMarks questionType')
      .populate('attempts.userId', 'name email');
    if (!test) return res.status(404).json({ error: 'TestSeries not found' });
    res.json(test);
  } catch (err) {
    console.error('Get TestSeries By ID Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ✅ CHANGE: Refactored update function to correctly calculate totalMarks upon update.
export const updateTestSeries = async (req, res) => {
  try {
    const testToUpdate = await TestSeries.findById(req.params.id);
    if (!testToUpdate) {
        return res.status(404).json({ error: 'TestSeries not found' });
    }

    // Apply the updates from the request body
    Object.assign(testToUpdate, req.body);

    // Recalculate and set totalMarks
    await testToUpdate.populate('sections.questions');
    const { total } = calcScore([], testToUpdate);
    testToUpdate.totalMarks = total;
    
    const updatedTest = await testToUpdate.save();
    res.json(updatedTest);

  } catch (err) {
    console.error('Update TestSeries Error:', err.message);
    res.status(400).json({ error: err.message });
  }
};



// DELETE: Delete test series
// In testSeriesController.js

export const deleteTestSeries = async (req, res) => {
  try {
    const masterTestId = req.params.id;

    // Step 1: Delete the master test series template
    const deletedMaster = await TestSeries.findByIdAndDelete(masterTestId);

    if (!deletedMaster) {
      return res.status(404).json({ error: 'Master TestSeries not found' });
    }

    // Step 2: Delete all instances that were cloned from this master
    // This is the "cascading delete" part.
    await TestSeries.deleteMany({ originalId: masterTestId });

    res.json({ message: 'Master TestSeries and all its instances have been deleted.' });
    
  } catch (err) {
    console.error('Delete TestSeries Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};


// Get recent test series for a user
export const getRecentTestSeriesForUser = async (req, res) => {
  try {
    const userId = req.user._id;
    const recent = await TestSeries.find({ 'attempts.userId': userId })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select('title exam subjectTags releaseDate');
    res.json(recent);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching recent test series' });
  }
};




export const startTestSecure = async (req, res) => {
  const userId = req.user._id;
  const { testId } = req.body;

  try {
    const test = await TestSeries.findOne({
      $or: [
        { _id: testId },
        { originalId: testId }
      ]
    });

    if (!test) return res.status(404).json({ message: 'Test not found' });

    if (test.isPaid) {
      const user = await User.findById(userId);
      const now = new Date();
      if (!user.passExpiry || new Date(user.passExpiry) < now) {
        return res.status(403).json({ message: 'This is a paid test. Please purchase a pass.' });
      }
    }

    const previousAttempts = test.attempts.filter(a => a.userId.toString() === userId.toString());
    const completedAttempts = previousAttempts.filter(a => a.isCompleted);

    if (test.isPaid && completedAttempts.length >= 1) {
      const user = await User.findById(userId);
      const now = new Date();
      if (!user.passExpiry || new Date(user.passExpiry) < now) {
        return res.status(403).json({ message: 'Only Prime members can reattempt paid tests.' });
      }
    }

    let existingAttempt = test.attempts.find(a => !a.isCompleted && a.userId.toString() === userId.toString());

    if (!existingAttempt) {
      const newAttempt = {
        userId,
        startedAt: new Date(),
        isCompleted: false,
        attemptNumber: completedAttempts.length + 1,
        answers: [],
      };
      test.attempts.push(newAttempt);
      await test.save();
      existingAttempt = test.attempts[test.attempts.length - 1];
    }

    const populatedTest = await TestSeries.findById(testId)
      .populate({
        path: 'sections.questions',
        select: 'questionText questionImage options questionType',
      });

    res.status(200).json({
      message: 'Access granted',
      testId,
      test: populatedTest,
      attemptId: existingAttempt._id,
      attempt: existingAttempt
    });
  } catch (err) {
    console.error('Start Test Error:', err.message);
    res.status(500).json({ message: 'Server error while starting test' });
  }
};


export const saveTestProgress = async (req, res) => {
  const userId = req.user._id;
  const { testId } = req.params;
  const { answers, timeLeftInSeconds, currentSectionIndex, currentQuestionIndex } = req.body;

  try {
    const test = await TestSeries.findById(testId);
    if (!test) return res.status(404).json({ message: 'Test not found' });

    const attempt = test.attempts.find(
      a => a.userId.toString() === userId.toString() && !a.isCompleted
    );

    if (!attempt) return res.status(404).json({ message: 'Attempt not found or already completed' });

    if (timeLeftInSeconds !== undefined) attempt.timeLeftInSeconds = timeLeftInSeconds;
    if (currentSectionIndex !== undefined) attempt.currentSectionIndex = currentSectionIndex;
    if (currentQuestionIndex !== undefined) attempt.currentQuestionIndex = currentQuestionIndex;

    answers.forEach((newAns) => {
      const existing = attempt.answers.find(a => a.questionId.toString() === newAns.questionId);
      if (existing) {
        existing.selectedOptions = newAns.selectedOptions;
        existing.timeTaken = newAns.timeTaken || 0;
      } else {
        attempt.answers.push({
          questionId: newAns.questionId,
          selectedOptions: newAns.selectedOptions,
          timeTaken: newAns.timeTaken || 0,
        });
      }
    });

    await test.save();
    res.status(200).json({ message: 'Progress saved' });
  } catch (err) {
    console.error('Save Progress Error:', err.message);
    res.status(500).json({ message: 'Failed to save progress' });
  }
};



export const completeTest = async (req, res) => {
  const userId = req.user._id;
  const { testId } = req.params;

  try {
    const test = await TestSeries.findById(testId).populate(detailedQuestionPopulation);
    if (!test) return res.status(404).json({ message: 'Test not found' });

    if (!test.sections || !Array.isArray(test.sections)) {
      return res.status(400).json({ message: 'Test sections missing or invalid' });
    }

    const attempt = test.attempts.find(
      a => a.userId.toString() === userId.toString() && !a.isCompleted
    );
    if (!attempt) return res.status(404).json({ message: 'Attempt not found' });

    attempt.isCompleted = true;
    attempt.endedAt = new Date();

    const { score, total } = calcScore(attempt.answers, test);
    attempt.score = score;
    attempt.totalMarks = total;
    attempt.cutoff = test.cutoff || {};

    await test.save();

    res.status(200).json({ message: 'Test completed successfully' });
  } catch (err) {
    console.error('Complete Test Error:', err.message);
    res.status(500).json({ message: 'Failed to complete test' });
  }
};



export const getScore = async (req, res) => {
  const userId = req.user._id;
  const { testId } = req.params;

  try {
    const test = await TestSeries.findById(testId).populate('sections.questions');
    const attempt = test.attempts.find(a => a.userId.toString() === userId.toString());

    if (!attempt || !attempt.isCompleted) {
      return res.status(400).json({ message: "Test not submitted or attempt not found." });
    }

    const {
      score,
      totalMarks,
      correct,
      incorrect,
      unattempted
    } = calcScore(attempt.answers, test);

    const totalQuestions = test.sections.reduce((acc, sec) => acc + sec.questions.length, 0);
    const attempted = attempt.answers.filter(a => a.selectedOptions?.length).length;

    res.json({
      testTitle: test.title,
      totalQuestions,
      attempted,
      correct,
      wrong: incorrect,
      score,
      totalMarks,
      attemptNumber: attempt.attemptNumber
    });
  } catch (err) {
    console.error('Score error:', err);
    res.status(500).json({ message: "Error fetching score" });
  }
};

const calculateDistributionStats = (scores, totalMarks) => {
  if (!scores || scores.length === 0) {
    return { medianScore: 0, marksDistribution: [] };
  }
  const sortedScores = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sortedScores.length / 2);
  const medianScore = sortedScores.length % 2 !== 0
    ? sortedScores[mid]
    : (sortedScores[mid - 1] + sortedScores[mid]) / 2;
  const marksDistribution = [];
  const numBins = 10;
  const binSize = Math.max(1, Math.ceil(totalMarks / numBins));
  for (let i = 0; i < numBins; i++) {
    const rangeStart = i * binSize;
    if (rangeStart >= totalMarks && totalMarks > 0) break;
    const rangeEnd = rangeStart + binSize;
    marksDistribution.push({
      range: `${rangeStart} to ${rangeEnd}`,
      students: 0,
    });
  }
  if (marksDistribution.length === 0) {
    marksDistribution.push({ range: `0 to ${binSize}`, students: 0 });
  }
  sortedScores.forEach(score => {
    const scoreToBin = Math.max(0, score);
    let binIndex = Math.floor(scoreToBin / binSize);
    binIndex = Math.min(binIndex, marksDistribution.length - 1);
    if (marksDistribution[binIndex]) {
      marksDistribution[binIndex].students++;
    }
  });
  return { 
    medianScore: +medianScore.toFixed(2), 
    marksDistribution 
  };
};



export const getDetailedResult = async (req, res) => {
  const userId = req.user._id;
  const { attemptId } = req.params;

  try {
    const test = await TestSeries.findOne({ 'attempts._id': attemptId })
      .populate({
        path: 'sections.questions',
        model: 'Question',
        select: 'questionType correctAnswer answerMin answerMax marks negativeMarks subject chapter topic'
      });

    if (!test) {
      return res.status(404).json({ message: 'Test not found for this attempt' });
    }

    const attempt = test.attempts.find(a => a._id.toString() === attemptId);
    if (!attempt || !attempt.isCompleted) {
      return res.status(400).json({ message: 'Attempt not found or not completed' });
    }

    const allUsersPerformance = test.attempts
      .filter(a => a.isCompleted && a.attemptNumber === attempt.attemptNumber)
      .map(a => {
        const result = calcScore(a.answers, test);
        const timeTaken = a.answers.reduce((sum, ans) => sum + (ans.timeTaken || 0), 0);
        return {
          userId: a.userId.toString(),
          ...result,
          timeTaken,
        };
      });

    if (allUsersPerformance.length === 0) {
        return res.status(404).json({ message: 'No completed attempts found for this test session.' });
    }

    const userPerformance = allUsersPerformance.find(p => p.userId === userId.toString());
    if (!userPerformance) {
        return res.status(404).json({ message: 'Could not find your result in this test session.' });
    }

    const topperPerformance = [...allUsersPerformance].sort((a, b) => b.score - a.score)[0];

    const totalUsers = allUsersPerformance.length;
    const avgStats = allUsersPerformance.reduce((acc, curr) => {
        acc.score += curr.score;
        acc.timeTaken += curr.timeTaken;
        acc.accuracy += curr.accuracy;
        acc.correct += curr.correct;
        acc.incorrect += curr.incorrect;
        return acc;
    }, { score: 0, timeTaken: 0, accuracy: 0, correct: 0, incorrect: 0 });

    const averagePerformance = {
        avgScore: +(avgStats.score / totalUsers).toFixed(2),
        avgTime: Math.round(avgStats.timeTaken / totalUsers),
        avgAccuracy: Math.round(avgStats.accuracy / totalUsers),
        avgCorrect: +(avgStats.correct / totalUsers).toFixed(2),
        avgIncorrect: +(avgStats.incorrect / totalUsers).toFixed(2),
    };

    const sortedByScore = allUsersPerformance.map(p => ({ userId: p.userId, score: p.score })).sort((a, b) => b.score - a.score);
    const userRank = sortedByScore.findIndex(s => s.userId === userId.toString()) + 1;
    
  const topUserIds = sortedByScore.slice(0, 10).map(entry => entry.userId);
const users = await User.find({ _id: { $in: topUserIds } }).select('name');
const userMap = new Map(users.map(u => [u._id.toString(), u.name]));

const rankList = sortedByScore.slice(0, 10).map(entry => ({
    name: userMap.get(entry.userId) || 'Unknown',
    score: entry.score
}));
    
    const allStudentScores = sortedByScore.map(s => s.score);
    const { medianScore, marksDistribution } = calculateDistributionStats(allStudentScores, userPerformance.total);

    const questionDetails = test.sections.flatMap(section => 
        section.questions.map(q => {
            const userAns = attempt.answers.find(a => a.questionId.toString() === q._id.toString());
            const isAttempted = userAns && userAns.selectedOptions && userAns.selectedOptions.length > 0;
            let isCorrect = false;
            if (isAttempted) {
                if (q.questionType === 'numerical') {
                    const userAnswer = parseFloat(userAns.selectedOptions[0]);
                    if (!isNaN(userAnswer) && q.answerMin != null && q.answerMax != null) {
                        isCorrect = userAnswer >= q.answerMin && userAnswer <= q.answerMax;
                    }
                } else {
                    isCorrect = [...userAns.selectedOptions].sort().join(',') === [...q.correctAnswer].sort().join(',');
                }
            }
            return {
                questionId: q._id,
                subject: q.subject,
                chapter: q.chapter,
                topic: q.topic,
                isCorrect,
                isAttempted
            };
        })
    );

    res.json({
      testTitle: test.title,
      userName: req.user.name,
      scoreSummary: {
        userScore: userPerformance.score,
        timeTaken: userPerformance.timeTaken,
        accuracy: userPerformance.accuracy,
        correct: userPerformance.correct,
        incorrect: userPerformance.incorrect,
        unattempted: userPerformance.unattempted,
        totalMarks: userPerformance.total,
        ...averagePerformance,
        topScore: topperPerformance.score,
        topTime: topperPerformance.timeTaken,
        topAccuracy: topperPerformance.accuracy,
        topCorrect: topperPerformance.correct,
        topIncorrect: topperPerformance.incorrect,
      },
      sectionStats: userPerformance.sectionStats,
      rank: userRank,
      rankList,
      marksDistribution,
      medianScore,
      cutoff: test.cutoff || {},
      questionDetails
    });

  } catch (err) {
    console.error('getDetailedResult Error:', err.message);
    res.status(500).json({ message: 'Error fetching detailed result' });
  }
};





export const getLeaderboard = async (req, res) => {
  const currentUserId = req.user._id.toString();
  const { testId } = req.params;
  const { attempt: attemptQuery, best = 'false', latest = 'false' } = req.query;

  try {
    // Step 1: Fetch the test. We don't need to populate questions for the leaderboard.
    const test = await TestSeries.findById(testId);
    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }

    // Step 2: Group all completed attempts by user ID.
    const groupedByUser = {};
    test.attempts.forEach(attempt => {
      if (!attempt.isCompleted) return; // Skip incomplete attempts
      const uid = attempt.userId.toString();
      if (!groupedByUser[uid]) {
        groupedByUser[uid] = [];
      }
      groupedByUser[uid].push(attempt);
    });

    // Step 3: Select the relevant attempt for each user based on query params.
    const leaderboardData = [];
    for (const [userId, attempts] of Object.entries(groupedByUser)) {
      let selectedAttempt;

      if (attemptQuery) {
        // Find a specific attempt number
        selectedAttempt = attempts.find(a => a.attemptNumber === parseInt(attemptQuery));
      } else if (best === 'true') {
        // Find the attempt with the highest score
        // ✅ OPTIMIZATION: Uses the pre-calculated 'score' field, does not call calcScore()
        selectedAttempt = attempts.reduce((bestSoFar, current) => {
          return current.score > (bestSoFar ? bestSoFar.score : -Infinity) ? current : bestSoFar;
        }, null);
      } else if (latest === 'true') {
        // Find the most recent attempt
        selectedAttempt = attempts.reduce((latestSoFar, current) => {
          return current.startedAt > latestSoFar.startedAt ? current : latestSoFar;
        }, attempts[0]);
      } else {
        // Default to the first attempt if no filter is specified
        selectedAttempt = attempts.find(a => a.attemptNumber === 1);
      }

      if (selectedAttempt) {
        leaderboardData.push({
          userId: userId,
          score: selectedAttempt.score || 0, // Use the saved score
        });
      }
    }

    // Step 4: Sort the results by score in descending order.
    leaderboardData.sort((a, b) => b.score - a.score);

    // Step 5: Efficiently fetch user names for the leaderboard.
    // ✅ BUG FIX & PERFORMANCE: Fixes the N+1 query problem.
    const userIds = leaderboardData.map(entry => entry.userId);
    const users = await User.find({ _id: { $in: userIds } }).select('name');
    const userMap = new Map(users.map(u => [u._id.toString(), u.name]));

    // Step 6: Construct the final rank list.
    const rankList = leaderboardData.map((entry, index) => ({
      rank: index + 1,
      name: userMap.get(entry.userId) || 'Unknown User',
      score: entry.score,
      isUser: entry.userId === currentUserId, // Flag if this is the currently logged-in user
    }));

    res.json(rankList);

  } catch (err) {
    console.error('Leaderboard error:', err.message);
    res.status(500).json({ message: 'Failed to load leaderboard' });
  }
};






export const getAllAttemptsSummary = async (req, res) => {
  const { testId } = req.params;

  try {
    const test = await TestSeries.findById(testId)
      .populate(detailedQuestionPopulation)
      .populate('attempts.userId', 'name');
    if (!test) return res.status(404).json({ message: 'Test not found' });

    const grouped = {};

    test.attempts
      .filter(a => a.isCompleted)
      .forEach((a) => {
        if (!grouped[a.attemptNumber]) {
          grouped[a.attemptNumber] = {
            attemptNumber: a.attemptNumber,
            date: a.endedAt,
            users: []
          };
        }

        const { score } = calcScore(a.answers, test);

        grouped[a.attemptNumber].users.push({
          userId: a.userId._id,
          name: a.userId.name,
          score,
          endedAt: a.endedAt
        });
      });

    const response = Object.values(grouped)
      .sort((a, b) => a.attemptNumber - b.attemptNumber)
      .map(group => {
        group.users.sort((a, b) => b.score - a.score);
        return {
          ...group,
          users: group.users.map((u, idx) => ({
            ...u,
            rank: idx + 1
          }))
        };
      });

    res.json(response);
  } catch (err) {
    console.error('getAllAttemptsSummary Error:', err.message);
    res.status(500).json({ message: 'Failed to fetch summary' });
  }
};


// GET: Fetch current user's attempt for a test
export const getUserAttemptForTest = async (req, res) => {
  const userId = req.user._id;
  const { testId } = req.params;

  try {
    const test = await TestSeries.findById(testId);
    if (!test) return res.status(404).json({ message: 'Test not found' });

    const attempts = test.attempts.filter(
      (a) => a.userId.toString() === userId.toString()
    );

    if (!attempts.length) {
      return res.status(404).json({ message: 'No attempts found for user' });
    }

    attempts.sort((a, b) => a.attemptNumber - b.attemptNumber);

    res.status(200).json(attempts);
  } catch (err) {
    console.error('getUserAttemptForTest error:', err.message);
    res.status(500).json({ message: 'Error fetching user attempts' });
  }
};


export const getSolutionForTest = async (req, res) => {
  const { testId } = req.params;
  const { attemptId } = req.query;

  try {
    const test = await TestSeries.findById(testId).populate({
      path: 'sections.questions',
      select: 'questionText questionImage options correctAnswer questionType explanation answerMin answerMax'
    });

    if (!test) {
      return res.status(404).json({ message: 'Test not found' });
    }

    const selectedAttempt = test.attempts.find(a => a._id.toString() === attemptId);
    if (!selectedAttempt) {
      return res.status(404).json({ message: 'Attempt not found for this test.' });
    }

    const allAttemptsForThisSession = test.attempts.filter(
      a => a.isCompleted && a.attemptNumber === selectedAttempt.attemptNumber
    );

    const questionStats = {};

    test.sections.forEach(section => {
      section.questions.forEach(q => {
        const questionId = q._id.toString();
        let totalTime = 0;
        let correctCount = 0;
        let attemptCount = 0;

        allAttemptsForThisSession.forEach(attempt => {
          const userAnswerObj = attempt.answers.find(ans => ans.questionId.toString() === questionId);
          if (userAnswerObj && userAnswerObj.selectedOptions.length > 0) {
            attemptCount++;
            totalTime += userAnswerObj.timeTaken || 0;

            let isCorrect = false;
            if (q.questionType === 'numerical') {
              const userAnswer = parseFloat(userAnswerObj.selectedOptions[0]);
              if (!isNaN(userAnswer) && q.answerMin != null && q.answerMax != null) {
                isCorrect = userAnswer >= q.answerMin && userAnswer <= q.answerMax;
              }
            } else {
              const correctAns = q.correctAnswer || [];
              isCorrect = [...userAnswerObj.selectedOptions].sort().join(',') === [...correctAns].sort().join(',');
            }
            if (isCorrect) {
              correctCount++;
            }
          }
        });

        questionStats[questionId] = {
          avgTime: attemptCount > 0 ? Math.round(totalTime / attemptCount) : 0,
          percentCorrect: attemptCount > 0 ? Math.round((correctCount / attemptCount) * 100) : 0,
        };
      });
    });

    const responses = {};
    selectedAttempt.answers.forEach(ans => {
      responses[ans.questionId.toString()] = ans.selectedOptions;
    });

    res.status(200).json({
      test,
      responses,
      questionStats,
    });
  } catch (err) {
    console.error('Get Solution Error:', err.message);
    res.status(500).json({ message: 'Failed to fetch solution' });
  }
};



export const getLatestAttemptSummaries = async (req, res) => {
  const userId = req.user._id;

  try {
    const tests = await TestSeries.find({ 'attempts.userId': userId }).populate('sections.questions');
    const latestAttempts = [];

    for (const test of tests) {
      const userAttempts = test.attempts
        .filter(a => a.userId.toString() === userId.toString() && a.isCompleted)
        .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt));

      if (!userAttempts.length) continue;

      const latest = userAttempts[0];
      const { score, totalMarks } = calcScore(latest.answers, test);

      const allScores = test.attempts
        .filter(a => a.isCompleted && a.attemptNumber === latest.attemptNumber)
        .map(a => ({
          userId: a.userId.toString(),
          ...calcScore(a.answers, test)
        }))
        .sort((a, b) => b.score - a.score);

      const rank = allScores.findIndex(s => s.userId === userId.toString()) + 1;

      latestAttempts.push({
        testId: test._id,
        testTitle: test.title,
        totalMarks,
        marks: score,
        rank,
        attemptNumber: latest.attemptNumber,
        endedAt: latest.endedAt,
        cutoffs: test.cutoff || {}
      });
    }

    res.json(latestAttempts);
  } catch (err) {
    console.error('getLatestAttemptSummaries error:', err);
    res.status(500).json({ message: 'Failed to load latest attempts summary' });
  }
};

export const getRankDistribution = async (req, res) => {
    try {
        const { testId } = req.params;
        const { attempt: attemptNumber } = req.query;

        const test = await TestSeries.findById(testId).populate(detailedQuestionPopulation);
        if (!test) return res.status(404).json({ message: 'Test not found' });

        const attemptsForSession = test.attempts.filter(a => a.isCompleted && a.attemptNumber === parseInt(attemptNumber));

        if (attemptsForSession.length === 0) {
            return res.json([]);
        }

        const allScores = attemptsForSession.map(a => {
            const { score } = calcScore(a.answers, test);
            return { userId: a.userId.toString(), score };
        });

        allScores.sort((a, b) => b.score - a.score);

        const rankDistribution = allScores.map((entry, index) => ({
            rank: index + 1,
            score: entry.score,
        }));

        res.json(rankDistribution);

    } catch (err) {
        console.error('Get Rank Distribution Error:', err.message);
        res.status(500).json({ error: 'Server error while fetching rank distribution' });
    }};





