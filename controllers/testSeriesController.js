// nextExams-backend/controllers/testSeriesController.js
import mongoose from 'mongoose';
import xlsx from 'xlsx';
import LiveRegistration from '../models/LiveRegistration.js';
import Question from '../models/Question.js';
import QuestionGroup from '../models/QuestionGroup.js';
import TestSeries from '../models/testSeriesModel.js';
import TestSeriesGroup from '../models/testSeriesGroupModel.js'
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import QuestionReport from '../models/QuestionReport.js';
import calcScore from '../utils/calcScore.js';
import TestAttempt from '../models/TestAttempt.js';
import { testAlertQueue } from '../utils/notificationQueue.mjs'; 


const detailedQuestionPopulation = {
  path: 'sections.questions',
  model: 'Question',
  select: 'questionType correctAnswer answerMin answerMax marks negativeMarks groupId', // Added groupId
  populate: {
    path: 'groupId', // This fetches the actual Passage Text from QuestionGroup model
    select: 'directionText directionImage type'
  }
};


// ---------------------------------------------------------
// NEW: LIVE TEST REGISTRATION API
// ---------------------------------------------------------
export const registerForLiveTest = async (req, res) => {
    const userId = req.user._id;
    const { testId } = req.params;

    try {
        const test = await TestSeries.findById(testId).select('isLiveTest registrationStartTime registrationEndTime liveTestStatus');
        
        if (!test) return res.status(404).json({ message: 'Test not found' });
        if (!test.isLiveTest) return res.status(400).json({ message: 'This is not a live test.' });

        const now = new Date();

        // 1. Verify Registration Window
        if (test.registrationStartTime && now < new Date(test.registrationStartTime)) {
            return res.status(403).json({ message: 'Registration has not started yet.' });
        }
        if (test.registrationEndTime && now > new Date(test.registrationEndTime)) {
            return res.status(403).json({ message: 'Registration has ended.' });
        }

        // 2. Prevent Duplicate Registration
        const existingRegistration = await LiveRegistration.findOne({ testSeriesId: testId, userId });
        if (existingRegistration) {
            return res.status(400).json({ message: 'You are already registered for this test.' });
        }

        // 3. Save Registration
        const registration = new LiveRegistration({
            userId,
            testSeriesId: testId
        });
        await registration.save();

        // 4. Update Denormalized Count (For fast UI rendering)
        await TestSeries.findByIdAndUpdate(testId, { $inc: { registeredUsersCount: 1 } });

        res.status(200).json({ message: 'Successfully registered for the live test!' });
    } catch (err) {
        console.error('Registration Error:', err.message);
        res.status(500).json({ message: 'Failed to register for live test' });
    }
};


// ---------------------------------------------------------
// ✅ NEW: CHECK LIVE REGISTRATION STATUS (Prevents refresh issues)
// ---------------------------------------------------------
export const checkLiveRegistration = async (req, res) => {
    try {
        const testSeriesId = req.params.id;
        const userId = req.user._id;

        const existingRegistration = await LiveRegistration.findOne({ 
            testSeriesId: testSeriesId, 
            userId: userId 
        });

        res.json({ isRegistered: !!existingRegistration });
    } catch (error) {
        console.error("Check Registration Error:", error);
        res.status(500).json({ message: "Error checking registration status" });
    }
};



export const unregisterLiveTest = async (req, res) => {
    try {
        const testId = req.params.id;
        const userId = req.user._id;

        // 1. Verify the test exists
        const test = await TestSeries.findById(testId);
        if (!test) {
            return res.status(404).json({ message: 'Test not found.' });
        }

        // Optional: Prevent unregistering if the test window has already started
        const now = new Date();
        const startTime = new Date(test.testWindowStartTime);
        if (now >= startTime) {
            return res.status(400).json({ message: 'Cannot unregister after the live test window has opened.' });
        }

        // 2. Find and delete the registration (FIXED FIELD NAME HERE)
        const deletedRegistration = await LiveRegistration.findOneAndDelete({
            testSeriesId: testId,
            userId: userId
        });

        if (!deletedRegistration) {
            return res.status(400).json({ message: 'You are not registered for this test.' });
        }

        // 3. Update Denormalized Count (Optional, but keeps your UI count accurate)
        await TestSeries.findByIdAndUpdate(testId, { $inc: { registeredUsersCount: -1 } });

        res.status(200).json({ 
            success: true, 
            message: 'Successfully unregistered from the Live Test.' 
        });

    } catch (error) {
        console.error('Error unregistering from live test:', error);
        res.status(500).json({ message: 'Server error during unregistration.' });
    }
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

        // Populate to calculate score
        await test.populate({
            path: 'sections.questions',
            select: 'questionType marks'
        });
        
        const { total } = calcScore([], test);
        test.totalMarks = total;

        const savedTest = await test.save();

        // ---------------------------------------------------------
        // ⏰ FIXED: SCHEDULE 15-MIN LIVE TEST ALERT ONLY IF PUBLISHED
        // ---------------------------------------------------------
        if (savedTest.isLiveTest && savedTest.testWindowStartTime && savedTest.status === 'published') {
            const delayTo15MinsBefore = new Date(savedTest.testWindowStartTime).getTime() - (15 * 60 * 1000) - Date.now();
            
            if (delayTo15MinsBefore > 0) {
                await testAlertQueue.add(
                    'send15MinAlert', 
                    { testId: savedTest._id, testTitle: savedTest.title },
                    { 
                        jobId: `alert_test_${savedTest._id}`, // Unique ID prevents duplicates
                        delay: delayTo15MinsBefore 
                    }
                );
                console.log(`⏰ Scheduled Live Test Alert for ${savedTest.title}`);
            }
        }
        // ---------------------------------------------------------

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

export const generateDynamicTestSeries = async (req, res) => {
    try {
        const { name: title, sections: sectionData, ...testDetails } = req.body;

        if (!title || !testDetails.exam || !sectionData || !Array.isArray(sectionData) || sectionData.length === 0) {
            return res.status(400).json({ error: 'Test series title, exam, and at least one section are required.' });
        }

        const allGeneratedQuestionIds = new Set();
        const finalSections = [];

        for (const section of sectionData) {
            const sectionQuestionIds = [];

            // ---------------------------------------------------------
            // ✅ NEW LOGIC: DIRECT IMPORT (Bypasses Rule Engine)
            // ---------------------------------------------------------
            if (section.exactQuestionIds && Array.isArray(section.exactQuestionIds) && section.exactQuestionIds.length > 0) {
                console.log(`[Direct Import] Importing ${section.exactQuestionIds.length} questions for section: ${section.title}`);
                
                // 1. Validate that these IDs actually exist in DB
                const validQuestions = await Question.find({ 
                    _id: { $in: section.exactQuestionIds } 
                }).select('_id');

                // 2. Add them to the list
                validQuestions.forEach(q => {
                    const qIdStr = q._id.toString();
                    
                    if (!allGeneratedQuestionIds.has(qIdStr)) {
                        sectionQuestionIds.push(q._id);
                        allGeneratedQuestionIds.add(qIdStr);
                    }
                });

                if (sectionQuestionIds.length === 0) {
                     return res.status(400).json({ error: `Direct import failed for section "${section.title}". No valid questions found.` });
                }
            } 
            // ---------------------------------------------------------
            // 🛑 EXISTING LOGIC: RULE BASED GENERATION
            // ---------------------------------------------------------
            else if (section.rules && section.rules.length > 0) {
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
            }

            finalSections.push({
                title: section.title,
                durationInMinutes: section.durationInMinutes,
                questions: sectionQuestionIds,
                marksPerQuestion: section.marksPerQuestion,
                negativeMarking: section.negativeMarking,
                markingScheme: section.markingScheme,
                languages: section.languages || ['en'] 
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

        // ---------------------------------------------------------
        // ⏰ ADDED: SCHEDULE 15-MIN LIVE TEST ALERT ONLY IF PUBLISHED
        // ---------------------------------------------------------
        if (savedTest.isLiveTest && savedTest.testWindowStartTime && savedTest.status === 'published') {
            const delayTo15MinsBefore = new Date(savedTest.testWindowStartTime).getTime() - (15 * 60 * 1000) - Date.now();
            
            if (delayTo15MinsBefore > 0) {
                await testAlertQueue.add(
                    'send15MinAlert', 
                    { testId: savedTest._id, testTitle: savedTest.title },
                    { 
                        jobId: `alert_test_${savedTest._id}`,
                        delay: delayTo15MinsBefore 
                    }
                );
                console.log(`⏰ Scheduled Live Test Alert for ${savedTest.title}`);
            }
        }
        // ---------------------------------------------------------
        
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
    const { groupId } = req.body;
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
        
        // Helper to safely get strings
        const getVal = (row, key) => (row[key] !== undefined ? String(row[key]).trim() : '');

        // -------------------------------------------------------------
        // ✅ 1. PROCESS PASSAGES (Group Creation)
        // -------------------------------------------------------------
        // We scan all rows. If 'Passage Title' exists, we verify if it exists in DB.
        // If not, we create it.
        // We use a Map to avoid duplicate DB calls for the same passage in this file.
        const passageMap = new Map(); // Title -> GroupID

        for (const q of questionsJSON) {
            const passageTitle = getVal(q, 'Passage Title');
            if (passageTitle && !passageMap.has(passageTitle)) {
                // Check DB first
                let group = await QuestionGroup.findOne({ title: passageTitle }).session(session);
                
                if (!group) {
                    // Create new passage if text is provided
                    const passageTextEn = getVal(q, 'Passage Text (English)') || getVal(q, 'Passage Text');
                    
                    if (passageTextEn) {
                        group = new QuestionGroup({
                            title: passageTitle,
                            type: 'Comprehension',
                            directionText: {
                                en: passageTextEn,
                                hi: getVal(q, 'Passage Text (Hindi)') || ''
                            },
                            directionImage: getVal(q, 'Passage Image') || ''
                        });
                        await group.save({ session });
                    }
                }
                
                if (group) {
                    passageMap.set(passageTitle, group._id);
                }
            }
        }

        // -------------------------------------------------------------
        // ✅ 2. PREPARE QUESTIONS (With Group Linking)
        // -------------------------------------------------------------
        const questionsToCreate = questionsJSON.map(q => {
            const passageTitle = getVal(q, 'Passage Title');
            const linkedGroupId = passageMap.get(passageTitle) || null;

            return {
                questionText: {
                    en: getVal(q, 'Question Text (English)') || getVal(q, 'Question Text'),
                    hi: getVal(q, 'Question Text (Hindi)') || ''
                },
                questionImage: getVal(q, 'Question Image') || null,
                explanationImage: getVal(q, 'Explanation Image') || null,
                questionType: getVal(q, 'Question Type')?.toLowerCase() || 'mcq',
                
                options: ['A', 'B', 'C', 'D', 'E'].map(opt => {
                    const textEn = getVal(q, `Option ${opt} (English)`) || getVal(q, `Option ${opt}`);
                    const textHi = getVal(q, `Option ${opt} (Hindi)`);
                    
                    if (!textEn && !getVal(q, `Option ${opt} Image`)) return null; // Skip if empty
                    
                    return { 
                        label: opt, 
                        text: { en: textEn, hi: textHi || '' },
                        image: getVal(q, `Option ${opt} Image`) || ''
                    };
                }).filter(Boolean),

                correctAnswer: getVal(q, 'Correct Answer').split(',').map(s => s.trim()),
                
                explanation: {
                    en: getVal(q, 'Explanation (English)') || getVal(q, 'Explanation'),
                    hi: getVal(q, 'Explanation (Hindi)') || ''
                },

                exam: details['Exam'],
                subject: getVal(q, 'Subject'),
                chapter: getVal(q, 'Chapter'),
                topic: getVal(q, 'Topic'),
                difficulty: getVal(q, 'Difficulty')?.toLowerCase() || 'medium',
                answerMin: q['Answer Min (Numerical)'] || undefined,
                answerMax: q['Answer Max (Numerical)'] || undefined,
                
                tags: [getVal(q, 'Subject'), getVal(q, 'Chapter'), details.Exam].filter(Boolean),
                
                // ✅ LINK THE QUESTION TO THE PASSAGE
                groupId: linkedGroupId 
            };
        });
        
        const createdQuestionDocs = await Question.insertMany(questionsToCreate, { session });

        const sectionsMap = new Map();
        createdQuestionDocs.forEach((doc, index) => {
            const sectionTitle = questionsJSON[index]['Section Title'] || 'General Section';
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
            status: 'draft',
            releaseDate: details['Release Date'] ? new Date(details['Release Date']) : null,
            sections: finalSections,
            groupId: groupId || null,
            filter1: details['Filter Category'] ? String(details['Filter Category']).trim() : null,
            subCategory: details['Sub Category'] ? String(details['Sub Category']).trim() : null, 
            subject: details['Subject Filter'] ? String(details['Subject Filter']).trim().toLowerCase() : null
        });
        
        // Populate to calculate total marks
        const tempTestForCalc = { ...newTest.toObject(), sections: newTest.sections.map(sec => ({...sec, questions: sec.questions.map(qId => createdQuestionDocs.find(doc => doc._id.equals(qId))) })) };
        const { total } = calcScore([], tempTestForCalc);
        newTest.totalMarks = total;

        const savedTest = await newTest.save({ session });
        
        const sourceTag = `source_test_${savedTest._id}`;
        const questionIdsToTag = createdQuestionDocs.map(q => q._id);
        await Question.updateMany({ _id: { $in: questionIdsToTag } }, { $addToSet: { tags: sourceTag } }, { session });

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




export const getAllTestSeries = async (req, res) => {
    try {
        // Added page and limit to destructuring with defaults
        const { testType, subCategory, subject, exam, status, isPaid, filter1, page = 1, limit = 50 } = req.query;
        
        const query = {};
        if (testType) query.testType = testType;
        if (subCategory) query.subCategory = subCategory;
        if (exam) query.exam = exam;
        if (filter1) query.filter1 = filter1;
        if (subject) query.subject = subject.toLowerCase();
        if (isPaid !== undefined) query.isPaid = isPaid === 'true';
        if (status) query.status = status;

        // Pagination math
        const pageNumber = parseInt(page, 10);
        const limitNumber = parseInt(limit, 10);
        const skip = (pageNumber - 1) * limitNumber;

        // Fetch paginated data
        const tests = await TestSeries.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNumber)
            .select('-sections') 
            .lean(); 
            
        // Get total count for frontend pagination controls
        const total = await TestSeries.countDocuments(query);

        // Return structured response
        res.json({
            data: tests,
            total,
            page: pageNumber,
            totalPages: Math.ceil(total / limitNumber)
        });
    } catch (err) {
        console.error('Get All TestSeries Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};



// GET: Single test series by ID
export const getTestSeriesById = async (req, res) => {
    try {
        // 1. Fetch the test as a plain object (.lean()) so we can dynamically add properties
        const test = await TestSeries.findById(req.params.id)
            .populate({
                path: 'sections.questions',
                select: 'questionText questionImage options correctAnswer explanation explanationImage questionType groupId',
                populate: { path: 'groupId' } 
            })
            .lean(); 
            
        if (!test) return res.status(404).json({ error: 'TestSeries not found' });

        // 2. Fetch the decoupled attempts manually
        const attempts = await TestAttempt.find({ testSeriesId: test._id })
            .populate('userId', 'name email')
            .lean();

        // 3. Attach the attempts back onto the test object for the frontend
        test.attempts = attempts;

        res.json(test);
    } catch (err) {
        console.error('Get TestSeries By ID Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};


export const updateTestSeries = async (req, res) => {
  try {
    const testToUpdate = await TestSeries.findById(req.params.id);
    if (!testToUpdate) {
      return res.status(404).json({ error: 'TestSeries not found' });
    }

    // Normalize subject to lowercase if it is being updated
    if (req.body.subject) {
      req.body.subject = req.body.subject.toLowerCase();
    }

    // Apply the updates from the request body
    Object.assign(testToUpdate, req.body);

    // If sections changed, recalculate totalMarks
    if (req.body.sections) {
      await testToUpdate.populate('sections.questions');
      const { total } = calcScore([], testToUpdate);
      testToUpdate.totalMarks = total;
    }
    
   const updatedTest = await testToUpdate.save();

    // ---------------------------------------------------------
    // ⏰ NEW: SYNC 15-MIN LIVE TEST ALERT ON UPDATE
    // ---------------------------------------------------------
    if (updatedTest.isLiveTest && updatedTest.testWindowStartTime) {
        const delayTo15MinsBefore = new Date(updatedTest.testWindowStartTime).getTime() - (15 * 60 * 1000) - Date.now();
        
        if (delayTo15MinsBefore > 0) {
            // Because we use the same jobId, BullMQ will automatically replace the old schedule with the new one!
            await testAlertQueue.add(
                'send15MinAlert', 
                { testId: updatedTest._id, testTitle: updatedTest.title },
                { 
                    jobId: `alert_test_${updatedTest._id}`, 
                    delay: delayTo15MinsBefore 
                }
            );
            console.log(`🔄 Re-Scheduled Live Test Alert for ${updatedTest.title}`);
        }
    }
    // ---------------------------------------------------------

    // ---------------------------------------------------------
    // 🗑️ CACHE CLEARING LOGIC (Robust Version)
    // ---------------------------------------------------------
    if (req.redis) {
      const testId = req.params.id;
      
      // Use pipeline to delete multiple keys at once efficiently
      const pipeline = req.redis.pipeline();
      
      // 1. Delete the "Start Test" content (User Interface)
      pipeline.del(`TEST_CONTENT_V1:${testId}`);
      
      // 2. Delete the "Solution" content (Analysis Page)
      pipeline.del(`SOLUTION_STATIC_V1:${testId}`);
      
      await pipeline.exec();
      
      console.log(`✅ All Caches (Content & Solution) Cleared for Test ID: ${testId}`);
    }
    // ---------------------------------------------------------

    res.json(updatedTest);

  } catch (err) {
    console.error('Update TestSeries Error:', err.message);
    res.status(400).json({ error: err.message });
  }
};

export const getFilterOptions = async (req, res) => {
    try {
        const [subCategories, subjects, exams, filter1s] = await Promise.all([
            TestSeries.distinct('subCategory', { status: 'published' }),
            TestSeries.distinct('subject', { status: 'published' }),
            TestSeries.distinct('exam', { status: 'published' }),
            TestSeries.distinct('filter1', { status: 'published' })
        ]);

        res.json({
            subCategories: subCategories.filter(Boolean), // Remove nulls
            subjects: subjects.filter(Boolean),
            exams: exams.filter(Boolean),
            filter1: filter1s.filter(Boolean)
        });
    } catch (err) {
        console.error('Get Filter Options Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};



// DELETE: Delete test series
// In testSeriesController.js

export const deleteTestSeries = async (req, res) => {
  try {
    const masterTestId = req.params.id;

    // ---------------------------------------------------------
    // 🗑️ REMOVE SCHEDULED ALERT FROM REDIS FIRST
    // ---------------------------------------------------------
    try {
        await testAlertQueue.remove(`alert_test_${masterTestId}`);
        console.log(`🗑️ Removed pending Live Test Alert for ID: ${masterTestId}`);
    } catch (queueErr) {
        console.error("Error removing job from queue:", queueErr);
    }
    // ---------------------------------------------------------

    // Now delete the master test series template
    const deletedMaster = await TestSeries.findByIdAndDelete(masterTestId);

    if (!deletedMaster) {
      return res.status(404).json({ error: 'Master TestSeries not found' });
    }

    // Step 2: Delete cloned instances
    await TestAttempt.deleteMany({ testSeriesId: masterTestId });

    // ---------------------------------------------------------
    // 🗑️ CACHE CLEARING LOGIC
    // ---------------------------------------------------------
    if (req.redis) {
        const cacheKey = `TEST_CONTENT_V1:${masterTestId}`;
        await req.redis.del(cacheKey);
        console.log(`✅ Cache Cleared (Deleted) for Test ID: ${masterTestId}`);
    }
    // ---------------------------------------------------------

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

    // ✅ NEW: Aggregate from TestAttempt to find recent unique tests
    const recentAttempts = await TestAttempt.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $sort: { updatedAt: -1 } }, 
      { $group: { _id: "$testSeriesId", lastActivity: { $first: "$updatedAt" } } },
      { $sort: { lastActivity: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "testseries",
          localField: "_id",
          foreignField: "_id",
          as: "testDetails"
        }
      },
      { $unwind: "$testDetails" },
      {
        $project: {
          _id: "$testDetails._id",
          title: "$testDetails.title",
          exam: "$testDetails.exam",
          subjectTags: "$testDetails.subjectTags",
          releaseDate: "$testDetails.releaseDate",
          filter1: "$testDetails.filter1"
        }
      }
    ]);

    res.json(recentAttempts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching recent test series' });
  }
};

// 1. START TEST SECURE
export const startTestSecure = async (req, res) => {
  const userId = req.user._id;
  const { testId, reattempt } = req.body;
  const redis = req.redis;

  try {
    // ---------------------------------------------------------
    // STEP 1: CACHE HIT (Fetch "Heavy" Test Data from Redis)
    // ---------------------------------------------------------
    const cacheKey = `TEST_CONTENT_V1:${testId}`;
    let staticTestData = await redis.get(cacheKey);

    if (!staticTestData) {
      // ✅ MODIFIED: We now fetch Live Test config fields too
      const testDoc = await TestSeries.findById(testId)
        .select('title sections testDurationInMinutes allowSectionJump cutoff description exam isPaid isLiveTest liveTestType testWindowStartTime testWindowEndTime resultPublishTime') 
        .populate({
          path: 'sections.questions',
          select: 'questionText questionImage options questionType groupId marks negativeMarks answerMin answerMax',
          populate: { path: 'groupId', select: 'directionText directionImage type' }
        }).lean();

      if (!testDoc) return res.status(404).json({ message: 'Test not found' });

      testDoc.sections.forEach(section => {
         const hasHindi = section.questions.some(q => 
            (q.questionText?.hi && q.questionText.hi.trim() !== '') ||
            (q.options && q.options.some(opt => opt.text?.hi && opt.text.hi.trim() !== ''))
         );
         section.languages = hasHindi ? ['en', 'hi'] : ['en'];
      });

      staticTestData = testDoc;
      await redis.set(cacheKey, JSON.stringify(testDoc), { ex: 86400 });
    } else {
        if (typeof staticTestData === 'string') staticTestData = JSON.parse(staticTestData);
    }

    const now = new Date(); // ⏱️ SERVER TIME OF TRUTH

    // ---------------------------------------------------------
    // STEP 2: LIVE TEST ENFORCEMENT & REGISTRATION CHECK
    // ---------------------------------------------------------
    if (staticTestData.isLiveTest) {
        
        // A. Check Registration
        const isRegistered = await LiveRegistration.findOne({ testSeriesId: testId, userId });
        if (!isRegistered) {
            return res.status(403).json({ message: 'You must register for this live test before starting.' });
        }

        const windowStart = new Date(staticTestData.testWindowStartTime);
        const windowEnd = new Date(staticTestData.testWindowEndTime);

        // B. Check Test Window Boundaries
        if (now < windowStart) {
            return res.status(403).json({ message: 'This live test has not started yet.' });
        }
        if (now > windowEnd) {
            return res.status(403).json({ message: 'The window for this live test has ended.' });
        }
    }

    // ---------------------------------------------------------
    // STEP 3: FETCH ATTEMPTS FROM NEW COLLECTION
    // ---------------------------------------------------------
    const previousAttempts = await TestAttempt.find({ testSeriesId: testId, userId }).lean();
    const completedAttempts = previousAttempts.filter(a => a.isCompleted);
    let existingAttempt = await TestAttempt.findOne({ testSeriesId: testId, userId, isCompleted: false });

    // ---------------------------------------------------------
    // STEP 4: ACCESS CONTROL (Prime vs Free)
    // ---------------------------------------------------------
    const user = await User.findById(userId).select('passExpiry role');
    const isPrime = user?.passExpiry ? new Date(user.passExpiry) > now : false;
const isAdmin = user?.role === 'admin';

    if (staticTestData.isPaid && !isPrime && !isAdmin) {
        return res.status(403).json({ message: 'This is a Prime Member exclusive test.', requiresPrime: true });
    }

    // Rule: Live tests only allow 1 attempt during the live window. Free practice tests allow 2.
    const MAX_FREE_ATTEMPTS = staticTestData.isLiveTest ? 1 : 2; 
    
    if (!staticTestData.isPaid && !isPrime && !isAdmin) {
        if (!existingAttempt && completedAttempts.length >= MAX_FREE_ATTEMPTS) {
            return res.status(200).json({ 
                success: false, errorType: 'PRIME_LIMIT', 
                message: staticTestData.isLiveTest ? 'You have already attempted this live test.' : `Maximum free attempts reached.`, 
                requiresPrime: true 
            });
        }
    }

    // ---------------------------------------------------------
    // STEP 5: CREATE OR RESUME ATTEMPT
    // ---------------------------------------------------------
    if (!existingAttempt) {
      if (completedAttempts.length > 0 && !reattempt) {
         return res.status(403).json({ 
             message: 'Test already completed.', status: 'completed', attemptId: completedAttempts[completedAttempts.length-1]._id
         });
      }

      // Calculate base time based on sections/test settings
      let initialTime = 0;
      if (staticTestData.allowSectionJump) {
         initialTime = staticTestData.testDurationInMinutes > 0 ? staticTestData.testDurationInMinutes * 60 : staticTestData.sections.reduce((acc, sec) => acc + (Number(sec.durationInMinutes) || 0), 0) * 60;
      } else {
         if (staticTestData.sections && staticTestData.sections.length > 0) {
            initialTime = (Number(staticTestData.sections[0].durationInMinutes) || 0) * 60;
         }
      }

      // ⏱️ LIVE TEST TIMER CORRECTION (Crucial)
      // If it's a 'fixed' live test, the timer cannot exceed the official end time of the test window.
      if (staticTestData.isLiveTest && staticTestData.liveTestType === 'fixed') {
          const secondsUntilWindowEnds = Math.floor((new Date(staticTestData.testWindowEndTime) - now) / 1000);
          
          // E.g., User has 60 mins base time, but test ends in 30 mins. They only get 30 mins.
          initialTime = Math.min(initialTime, secondsUntilWindowEnds); 
      }

      // Save directly to TestAttempt Collection
      existingAttempt = new TestAttempt({
        userId,
        testSeriesId: testId,
        startedAt: now,
        isCompleted: false,
        attemptNumber: completedAttempts.length + 1,
        answers: [],
        currentSectionIndex: 0,
        currentQuestionIndex: 0,
        timeLeftInSeconds: initialTime,
        // ✅ Apply Live Flags
        isLiveAttempt: staticTestData.isLiveTest || false,
        isResultPending: staticTestData.isLiveTest ? true : false
      });

      await existingAttempt.save();
    }

    const finalResponse = { ...staticTestData, _id: testId, isPaid: staticTestData.isPaid };

    res.status(200).json({
      message: 'Access granted', testId, test: finalResponse, attemptId: existingAttempt._id, attempt: existingAttempt
    });

  } catch (err) {
    console.error('Start Test Error:', err.message);
    res.status(500).json({ message: 'Server error while starting test' });
  }
};


// 2. SAVE TEST PROGRESS
export const saveTestProgress = async (req, res) => {
  const userId = req.user._id;
  const { testId } = req.params;
  const { answers, timeLeftInSeconds, currentSectionIndex, currentQuestionIndex } = req.body;

  try {
    // ✅ NEW: Find the specific attempt directly. No need to load the TestSeries!
    const attempt = await TestAttempt.findOne({ testSeriesId: testId, userId, isCompleted: false });

    if (!attempt) {
        return res.status(403).json({ message: 'Cannot save. Attempt not active or already submitted.' });
    }

    const isSwitchingSection = currentSectionIndex !== undefined && currentSectionIndex !== attempt.currentSectionIndex;

    if (isSwitchingSection) {
      attempt.currentSectionIndex = currentSectionIndex;
      const test = await TestSeries.findById(testId).select('allowSectionJump sections.durationInMinutes').lean();
      
      if (test.allowSectionJump) {
        if (timeLeftInSeconds !== undefined) attempt.timeLeftInSeconds = timeLeftInSeconds;
      } else {
        if (test.sections[currentSectionIndex]) {
           const newSectionDuration = test.sections[currentSectionIndex].durationInMinutes || 0;
           attempt.timeLeftInSeconds = newSectionDuration * 60;
        }
      }
    } else {
      if (timeLeftInSeconds !== undefined) attempt.timeLeftInSeconds = timeLeftInSeconds;
    }

    if (currentQuestionIndex !== undefined) attempt.currentQuestionIndex = currentQuestionIndex;

    if (answers && Array.isArray(answers)) {
      answers.forEach((newAns) => {
        const existing = attempt.answers.find(a => a.questionId.toString() === newAns.questionId);
        if (existing) {
          existing.selectedOptions = newAns.selectedOptions;
          existing.timeTaken = newAns.timeTaken || 0;
          existing.isMarked = newAns.isMarked;
          existing.isVisited = newAns.isVisited;
        } else {
          attempt.answers.push({
            questionId: newAns.questionId, selectedOptions: newAns.selectedOptions, timeTaken: newAns.timeTaken || 0,
            isMarked: newAns.isMarked || false, isVisited: newAns.isVisited || true
          });
        }
      });
    }

    await attempt.save(); // ✅ Only saving the lightweight attempt document
    
    res.status(200).json({ message: 'Progress saved', timeLeftInSeconds: attempt.timeLeftInSeconds, currentSectionIndex: attempt.currentSectionIndex });

  } catch (err) {
    console.error('Save Progress Error:', err.message);
    res.status(500).json({ message: 'Failed to save progress' });
  }
};


// ---------------------------------------------------------
// 🚀 OPTIMIZED: COMPLETE TEST (USES REDIS INSTEAD OF DB JOIN)
// ---------------------------------------------------------
export const completeTest = async (req, res) => {
  const userId = req.user._id;
  const { testId } = req.params;
  const redis = req.redis;

  try {
    // 🚀 Fetch scoring rubric directly from RAM cache instead of crashing DB with a massive JOIN
    const cacheKey = `SOLUTION_STATIC_V1:${testId}`;
    let test = await redis.get(cacheKey);

    if (!test) {
      test = await TestSeries.findById(testId).populate(detailedQuestionPopulation).lean();
      await redis.set(cacheKey, JSON.stringify(test), { ex: 86400 });
    } else {
      if (typeof test === 'string') test = JSON.parse(test);
    }

    if (!test) return res.status(404).json({ message: 'Test not found' });

    const attempt = await TestAttempt.findOne({ testSeriesId: testId, userId, isCompleted: false });
    if (!attempt) return res.status(404).json({ message: 'Attempt not found or already submitted' });

    attempt.isCompleted = true;
    attempt.endedAt = new Date();

    const { score, total } = calcScore(attempt.answers, test);
    attempt.score = score;
    attempt.totalMarks = total;
    attempt.cutoff = test.cutoff || {};

    await attempt.save(); 

    res.status(200).json({ message: 'Test completed successfully' });
  } catch (err) {
    console.error('Complete Test Error:', err.message);
    res.status(500).json({ message: 'Failed to complete test' });
  }
};

// ---------------------------------------------------------
// 🚀 OPTIMIZED: GET SCORE (USES REDIS)
// ---------------------------------------------------------
export const getScore = async (req, res) => {
  const userId = req.user._id;
  const { testId } = req.params;
  const redis = req.redis;

  try {
    const cacheKey = `SOLUTION_STATIC_V1:${testId}`;
    let test = await redis.get(cacheKey);

    if (!test) {
      test = await TestSeries.findById(testId).populate(detailedQuestionPopulation).lean();
      await redis.set(cacheKey, JSON.stringify(test), { ex: 86400 });
    } else {
      if (typeof test === 'string') test = JSON.parse(test);
    }

    const attempt = await TestAttempt.findOne({ 
        testSeriesId: testId, 
        userId: userId, 
        isCompleted: true 
    }).sort({ endedAt: -1 }); 

    if (!attempt) {
      return res.status(400).json({ message: "Test not submitted or attempt not found." });
    }

    const { score, totalMarks, correct, incorrect, unattempted } = calcScore(attempt.answers, test);

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

// ---------------------------------------------------------
// REPLACEMENT FUNCTIONS FOR testSeriesController.js
// ---------------------------------------------------------

export const getDetailedResult = async (req, res) => {
  const userId = req.user._id;
  const { attemptId } = req.params;
  const redis = req.redis;

  try {
    // 1. FETCH USER'S ATTEMPT (DIRECTLY FROM NEW COLLECTION)
    const attempt = await TestAttempt.findById(attemptId).lean();
    if (!attempt || !attempt.isCompleted) {
        return res.status(400).json({ message: 'Attempt not found or not completed' });
    }

    const testDoc = await TestSeries.findById(attempt.testSeriesId).select('isLiveTest resultPublishTime').lean();
    if (testDoc.isLiveTest && new Date() < new Date(testDoc.resultPublishTime)) {
        return res.status(200).json({
            isResultPending: true,
            message: "Your test is submitted! Ranks and detailed analysis will be available once the live test concludes.",
            resultPublishTime: testDoc.resultPublishTime,
            scoreSummary: { 
                userScore: attempt.score, // Optionally show raw score, or hide this too!
                totalMarks: attempt.totalMarks
            }
        });
    }
    
    // Security check
    if (attempt.userId.toString() !== userId.toString()) {
        return res.status(403).json({ message: 'Unauthorized to view this result' });
    }

    const testId = attempt.testSeriesId.toString();

    // 2. FETCH STATIC TEST CONTENT
    const testCacheKey = `SOLUTION_STATIC_V1:${testId}`;
    let staticTest = await redis.get(testCacheKey);

    if (!staticTest) {
       staticTest = await TestSeries.findById(testId)
         .populate({
            path: 'sections.questions',
            model: 'Question',
            select: 'questionType correctAnswer answerMin answerMax marks negativeMarks subject chapter topic'
         }).lean();
       await redis.set(testCacheKey, JSON.stringify(staticTest), { ex: 86400 });
    } else {
       if (typeof staticTest === 'string') staticTest = JSON.parse(staticTest);
    }

    // 3. LEADERBOARD & STATS (Cached)
    const leaderboardKey = `LEADERBOARD_V1:${testId}`;
    let allUsersPerformance = await redis.get(leaderboardKey);

    if (!allUsersPerformance) {
        // ✅ NEW: Fetch simplified list of scores directly from TestAttempt
        const attempts = await TestAttempt.find({ testSeriesId: testId, isCompleted: true })
            .select('userId score timeTaken answers.timeTaken')
            .lean();

        allUsersPerformance = attempts
            .map(a => {
                const timeTaken = a.timeTaken || a.answers?.reduce((sum, ans) => sum + (ans.timeTaken || 0), 0) || 0;
                return {
                    userId: a.userId.toString(),
                    score: a.score || 0,
                    timeTaken,
                    accuracy: 0 
                };
            })
            .sort((a, b) => b.score - a.score);

        await redis.set(leaderboardKey, JSON.stringify(allUsersPerformance), { ex: 600 });
    } else {
        if (typeof allUsersPerformance === 'string') allUsersPerformance = JSON.parse(allUsersPerformance);
    }

    // 4. CALCULATE USER SPECIFIC METRICS
    const { correct, incorrect, unattempted, score, total, sectionStats, accuracy } = calcScore(attempt.answers, staticTest);

    const totalUsers = allUsersPerformance.length;
    const userRank = allUsersPerformance.findIndex(p => p.userId === userId.toString()) + 1;
    const topperPerformance = allUsersPerformance[0] || { score: 0, timeTaken: 0, accuracy: 0, correct: 0, incorrect: 0 };

    const totalScoreSum = allUsersPerformance.reduce((acc, curr) => acc + curr.score, 0);
    const totalTimeSum = allUsersPerformance.reduce((acc, curr) => acc + curr.timeTaken, 0);

    const averagePerformance = {
        avgScore: totalUsers > 0 ? +(totalScoreSum / totalUsers).toFixed(2) : 0,
        avgTime: totalUsers > 0 ? Math.round(totalTimeSum / totalUsers) : 0,
        avgAccuracy: 0, avgCorrect: 0, avgIncorrect: 0 
    };

    // 5. RANK LIST & DISTRIBUTION
    const topUserIds = allUsersPerformance.slice(0, 10).map(entry => entry.userId);
    const users = await User.find({ _id: { $in: topUserIds } }).select('name');
    const userMap = new Map(users.map(u => [u._id.toString(), u.name]));

    const rankList = allUsersPerformance.slice(0, 10).map(entry => ({
        name: userMap.get(entry.userId) || 'Unknown',
        score: entry.score
    }));

    const { medianScore, marksDistribution } = calculateDistributionStats(allUsersPerformance.map(s => s.score), total);

    // 6. QUESTION ANALYSIS
    const questionDetails = staticTest.sections.flatMap(section => 
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
                questionId: q._id, subject: q.subject, chapter: q.chapter, topic: q.topic, isCorrect, isAttempted
            };
        })
    );

    res.json({
      testTitle: staticTest.title,
      userName: req.user.name,
      scoreSummary: {
        userScore: score, 
        timeTaken: attempt.answers.reduce((sum, ans) => sum + (ans.timeTaken || 0), 0),
        accuracy, correct, incorrect, unattempted, totalMarks: total,
        ...averagePerformance, topScore: topperPerformance.score, topTime: topperPerformance.timeTaken,
      },
      sectionStats, rank: userRank, rankList, marksDistribution, medianScore,
      cutoff: staticTest.cutoff || {}, questionDetails, tags: staticTest.tags || []
    });

  } catch (err) {
    console.error('getDetailedResult Error:', err.message);
    res.status(500).json({ message: 'Error fetching detailed result' });
  }
};


// ---------------------------------------------------------
// 🚀 OPTIMIZED: GET LEADERBOARD (PREVENTS RAM OVERLOAD)
// ---------------------------------------------------------
export const getLeaderboard = async (req, res) => {
  const currentUserId = req.user._id.toString();
  const { testId } = req.params;
  const { attempt: attemptQuery, best = 'false', latest = 'false' } = req.query;

  try {
    // 🚀 OPTIMIZATION: Extremely narrow select prevents memory crashes on high traffic tests
    const attempts = await TestAttempt.find({ testSeriesId: testId, isCompleted: true })
        .select('userId score attemptNumber startedAt')
        .lean();
    
    if (attempts.length === 0) return res.json([]);

    const groupedByUser = {};
    attempts.forEach(attempt => {
      const uid = attempt.userId.toString();
      if (!groupedByUser[uid]) groupedByUser[uid] = [];
      groupedByUser[uid].push(attempt);
    });

    const leaderboardData = [];
    for (const [userId, userAttempts] of Object.entries(groupedByUser)) {
      let selectedAttempt;

      if (attemptQuery) {
        selectedAttempt = userAttempts.find(a => a.attemptNumber === parseInt(attemptQuery));
      } else if (best === 'true') {
        selectedAttempt = userAttempts.reduce((bestSoFar, current) => {
          return current.score > (bestSoFar ? bestSoFar.score : -Infinity) ? current : bestSoFar;
        }, null);
      } else if (latest === 'true') {
        selectedAttempt = userAttempts.reduce((latestSoFar, current) => {
          return current.startedAt > latestSoFar.startedAt ? current : latestSoFar;
        }, userAttempts[0]);
      } else {
        selectedAttempt = userAttempts.find(a => a.attemptNumber === 1);
      }

      if (selectedAttempt) {
        leaderboardData.push({ userId: userId, score: selectedAttempt.score || 0 });
      }
    }

    leaderboardData.sort((a, b) => b.score - a.score);

    const userIds = leaderboardData.map(entry => entry.userId);
    const users = await User.find({ _id: { $in: userIds } }).select('name').lean();
    const userMap = new Map(users.map(u => [u._id.toString(), u.name]));

    const rankList = leaderboardData.map((entry, index) => ({
      rank: index + 1,
      name: userMap.get(entry.userId) || 'Unknown User',
      score: entry.score,
      isUser: entry.userId === currentUserId,
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
    const test = await TestSeries.findById(testId).select('title').lean();
    if (!test) return res.status(404).json({ message: 'Test not found' });

    // ✅ NEW: Populate User directly from TestAttempt
    const attempts = await TestAttempt.find({ testSeriesId: testId, isCompleted: true })
        .populate('userId', 'name')
        .lean();

    const grouped = {};
    attempts.forEach((a) => {
        if (!grouped[a.attemptNumber]) {
          grouped[a.attemptNumber] = { attemptNumber: a.attemptNumber, date: a.endedAt, users: [] };
        }
        grouped[a.attemptNumber].users.push({
          userId: a.userId._id,
          name: a.userId.name,
          score: a.score, // Use pre-calculated score
          endedAt: a.endedAt
        });
    });

    const response = Object.values(grouped)
      .sort((a, b) => a.attemptNumber - b.attemptNumber)
      .map(group => {
        group.users.sort((a, b) => b.score - a.score);
        return {
          ...group,
          users: group.users.map((u, idx) => ({ ...u, rank: idx + 1 }))
        };
      });

    res.json(response);
  } catch (err) {
    console.error('getAllAttemptsSummary Error:', err.message);
    res.status(500).json({ message: 'Failed to fetch summary' });
  }
};


export const getUserAttemptForTest = async (req, res) => {
  const userId = req.user._id;
  const { testId } = req.params;

  try {
    // ✅ NEW: Direct query, incredibly fast
    const attempts = await TestAttempt.find({ testSeriesId: testId, userId })
        .sort({ attemptNumber: 1 })
        .lean();

    if (!attempts.length) {
      return res.status(404).json({ message: 'No attempts found for user' });
    }

    res.status(200).json(attempts);
  } catch (err) {
    console.error('getUserAttemptForTest error:', err.message);
    res.status(500).json({ message: 'Error fetching user attempts' });
  }
};


export const getSolutionForTest = async (req, res) => {
  const { testId } = req.params;
  const { attemptId } = req.query;
  const redis = req.redis;

  try {
    const cacheKey = `SOLUTION_STATIC_V1:${testId}`;
    let staticTest = await redis.get(cacheKey);

    if (!staticTest) {
      const testDoc = await TestSeries.findById(testId)
        .populate({
          path: 'sections.questions',
          select: 'questionText questionImage options correctAnswer questionType explanation explanationImage answerMin answerMax groupId marks negativeMarks',
          populate: { path: 'groupId', select: 'directionText directionImage type' }
        }).lean();

      if (!testDoc) return res.status(404).json({ message: 'Test not found' });

      testDoc.sections.forEach(section => {
         const hasHindi = section.questions.some(q => 
            (q.questionText?.hi && q.questionText.hi.trim() !== '') ||
            (q.options && q.options.some(opt => opt.text?.hi && opt.text.hi.trim() !== '')) ||
            (q.explanation?.hi && q.explanation.hi.trim() !== '')
         );
         section.languages = hasHindi ? ['en', 'hi'] : ['en'];
      });

      staticTest = testDoc;
      await redis.set(cacheKey, JSON.stringify(staticTest), { ex: 86400 });
    } else {
        if (typeof staticTest === 'string') staticTest = JSON.parse(staticTest);
    }

    // ---------------------------------------------------------
    // ✅ NEW: BLOCK SOLUTIONS FOR PENDING LIVE TESTS
    // ---------------------------------------------------------
    if (staticTest.isLiveTest && new Date() < new Date(staticTest.resultPublishTime)) {
        return res.status(403).json({
            message: "Solutions and Ranks are hidden to prevent cheating while the Live Test window is still open.",
            resultPublishTime: staticTest.resultPublishTime
        });
    }

    // ✅ Fetch attempt directly from the new TestAttempt collection
    const selectedAttempt = await TestAttempt.findById(attemptId).lean();
    if (!selectedAttempt) return res.status(404).json({ message: 'Attempt not found' });

    // ✅ NEW: Security Check - Only the owner or an admin can view this attempt
    if (selectedAttempt.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
         return res.status(403).json({ message: 'Unauthorized to view this attempt' });
    }

    let questionStats = await redis.get(`TEST_STATS_V1:${testId}`) || {};
    if (typeof questionStats === 'string') questionStats = JSON.parse(questionStats);

    if (req.user) {
       const allQuestionIds = staticTest.sections.flatMap(section => section.questions.map(q => q._id));
       const userReports = await QuestionReport.find({ userId: req.user._id, questionId: { $in: allQuestionIds } }).select('questionId status').lean();
       const reportMap = new Map();
       userReports.forEach(r => reportMap.set(r.questionId.toString(), r.status));
       staticTest.sections.forEach(section => {
           section.questions.forEach(q => { q.reportStatus = reportMap.get(q._id.toString()) || null; });
       });
    }

    const responses = {};
    selectedAttempt.answers.forEach(ans => {
        responses[ans.questionId.toString()] = ans.selectedOptions;
    });

    const finalTest = { ...staticTest, attempts: [selectedAttempt] };
    res.status(200).json({ test: finalTest, responses, questionStats });

  } catch (err) {
    console.error('Get Solution Error:', err.message);
    res.status(500).json({ message: 'Failed to fetch solution' });
  }
};


// ---------------------------------------------------------
// 🚀 OPTIMIZED: GET LATEST ATTEMPTS (AGGREGATION PIPELINE)
// ---------------------------------------------------------
export const getLatestAttemptSummaries = async (req, res) => {
  const userId = req.user._id;

  try {
    const latestAttempts = await TestAttempt.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), isCompleted: true } },
      { $sort: { endedAt: -1 } },
      {
        $group: {
          _id: "$testSeriesId",
          latestAttempt: { $first: "$$$ROOT" }
        }
      },
      {
        $lookup: {
          from: "testseries",
          localField: "_id",
          foreignField: "_id",
          as: "testDetails"
        }
      },
      { $unwind: "$testDetails" },
      {
        $project: {
          _id: 0,
          testId: "$_id",
          testTitle: "$testDetails.title",
          totalMarks: "$latestAttempt.totalMarks",
          marks: "$latestAttempt.score",
          attemptNumber: "$latestAttempt.attemptNumber",
          endedAt: "$latestAttempt.endedAt",
          cutoffs: "$testDetails.cutoff",
          isLiveTest: "$testDetails.isLiveTest", 
          isResultPending: "$latestAttempt.isResultPending",
          resultPublishTime: "$testDetails.resultPublishTime"
        }
      }
    ]);

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

        // ✅ NEW: Extremely fast direct query
        const attemptsForSession = await TestAttempt.find({ 
            testSeriesId: testId, 
            isCompleted: true, 
            attemptNumber: parseInt(attemptNumber) 
        }).select('userId score').sort({ score: -1 }).lean();

        if (attemptsForSession.length === 0) return res.json([]);

        const rankDistribution = attemptsForSession.map((entry, index) => ({
            rank: index + 1,
            score: entry.score,
        }));

        res.json(rankDistribution);
    } catch (err) {
        console.error('Get Rank Distribution Error:', err.message);
        res.status(500).json({ error: 'Server error while fetching rank distribution' });
    }
};



export const updateTestStatus = async (req, res) => {
    const { status } = req.body;
    // We now allow 'archived' as a valid status
    if (!['draft', 'published', 'archived'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status provided.' });
    }

    try {
        const test = await TestSeries.findById(req.params.id);
        if (!test) {
            return res.status(404).json({ message: 'Test not found' });
        }

        // --- SAFETY RULES ---
        // Rule 1: A test that has attempts can never go back to 'draft'.
        const attemptCount = await TestAttempt.countDocuments({ testSeriesId: test._id });
        
        if (attemptCount > 0 && status === 'draft') {
            return res.status(400).json({ message: 'A test that has been attempted cannot be moved back to draft.' });
        }
        
        // Rule 2: An archived test is locked and cannot be changed.
        if (test.status === 'archived') {
            return res.status(400).json({ message: 'Archived tests are locked and their status cannot be changed.' });
        }
        
        test.status = status;
        await test.save();

      
        // ---------------------------------------------------------
        if (test.isLiveTest && test.testWindowStartTime) {
            // 1. Remove the old job (even if it doesn't exist, this is safe)
            await testAlertQueue.remove(`alert_test_${test._id}`);
            
            if (status === 'published') {
                // 2. Calculate fresh time
                const delayTo15MinsBefore = new Date(test.testWindowStartTime).getTime() - (15 * 60 * 1000) - Date.now();
                
                if (delayTo15MinsBefore > 0) {
                    await testAlertQueue.add(
                        'send15MinAlert', 
                        { testId: test._id, testTitle: test.title }, // This gets the NEW title
                        { jobId: `alert_test_${test._id}`, delay: delayTo15MinsBefore }
                    );
                    console.log(`⏰ Scheduled Live Test Alert for: ${test.title}`);
                }
            } else {
                console.log(`🗑️ Removed Live Test Alert (Test status is now ${status})`);
            }
        }
        // ---------------------------------------------------------
        // ---------------------------------------------------------

        res.json({ message: `Test status updated to '${status}'` });
    } catch (error) {
        console.error('Update Status Error:', error);
        res.status(500).json({ message: 'Server error while updating status.' });
    }
};


export const getPublicTestsByGroupId = async (req, res) => {
    try {
        const { groupId } = req.params;

        // ✅ NEW STRATEGY: Find the Group first, then populate its tests.
        // This is safer because it relies on the same link the User Panel uses.
        const group = await TestSeriesGroup.findById(groupId).populate({
            path: 'testSeries',
            match: { status: 'published' }, // Only show published tests
            select: 'title description exam testDurationInMinutes totalMarks isPaid releaseDate sections filter1 testType subCategory subject' // ✅ Include all filter fields
        }).lean();

        if (!group || !group.testSeries) {
            return res.json([]); // Return empty array if no group or tests found
        }

        // Map the populated tests to the public format
        const publicTests = group.testSeries.map(test => ({
            _id: test._id,
            title: test.title,
            description: test.description,
            exam: test.exam,
            filter1: test.filter1,
            
            // ✅ CRITICAL: Ensure these filter fields are passed to frontend
            testType: test.testType || 'full-length',       
            subCategory: test.subCategory, 
            subject: test.subject,         

            testDurationInMinutes: test.testDurationInMinutes,
            totalMarks: test.totalMarks,
            isPaid: test.isPaid,
            releaseDate: test.releaseDate,
            questionsCount: test.sections?.reduce((acc, sec) => acc + (sec.questions?.length || 0), 0) || 0,
            sectionCount: test.sections?.length || 0
        }));

        res.json(publicTests);
    } catch (err) {
        console.error('getPublicTestsByGroupId Error:', err);
        res.status(500).json({ message: 'Failed to load public tests.' });
    }
};

