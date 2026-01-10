// nextExams-backend/controllers/testSeriesController.js
import mongoose from 'mongoose';
import xlsx from 'xlsx';
import Question from '../models/Question.js';
import QuestionGroup from '../models/QuestionGroup.js';
import TestSeries from '../models/testSeriesModel.js';
import TestSeriesGroup from '../models/testSeriesGroupModel.js'
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import QuestionReport from '../models/QuestionReport.js';
import calcScore from '../utils/calcScore.js';


const detailedQuestionPopulation = {
  path: 'sections.questions',
  model: 'Question',
  select: 'questionType correctAnswer answerMin answerMax marks negativeMarks groupId', // Added groupId
  populate: {
    path: 'groupId', // This fetches the actual Passage Text from QuestionGroup model
    select: 'directionText directionImage type'
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
                    
                    // Optional: Check for duplicates across sections if you want unique questions only
                    if (!allGeneratedQuestionIds.has(qIdStr)) {
                        sectionQuestionIds.push(q._id);
                        allGeneratedQuestionIds.add(qIdStr);
                    } else {
                        // If you allow duplicates across sections, just push it:
                        // sectionQuestionIds.push(q._id);
                        
                        // If you want to strictly prevent duplicates, do nothing here.
                        // For direct import, usually we allow the admin to do what they want, so let's push it:
                        // (Comment out the 'if' above if you want to allow duplicates)
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

                    // Exclude questions already used in previous sections
                    if (allGeneratedQuestionIds.size > 0) {
                        query._id = { $nin: [...allGeneratedQuestionIds].map(id => new mongoose.Types.ObjectId(id)) };
                    }

                    // Handle Source Tags
                    const sourceTag = (rule.tags || []).find(tag => tag.startsWith('source_test_'));
                    if (sourceTag) {
                        const sourceTestId = sourceTag.replace('source_test_', '');
                        const sourceTest = await TestSeries.findById(sourceTestId).lean();
                        
                        if (sourceTest && Array.isArray(sourceTest.sections)) {
                            const sourceQuestionIds = sourceTest.sections.flatMap(sec => sec.questions);
                            query._id = { ...query._id, $in: sourceQuestionIds };
                        } else {
                            // If source test not found, force empty result to avoid random questions
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
        
        // ... (Keep your Notification Logic exactly as it is) ...
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
        const { testType, subCategory, subject, exam, status, isPaid, filter1 } = req.query;
        
        // Build a dynamic query object
        const query = {};

        if (testType) query.testType = testType;
        if (subCategory) query.subCategory = subCategory;
        if (exam) query.exam = exam;
        if (filter1) query.filter1 = filter1;
        
        // Ensure subject search is lowercase to match storage format
        if (subject) query.subject = subject.toLowerCase();

        // Boolean filters
        if (isPaid !== undefined) query.isPaid = isPaid === 'true';

        // Status handling (Admin vs User)
        // If status is passed explicitly, use it. Otherwise, default logic:
        // You might want to default to 'published' if not admin, but for now:
        if (status) query.status = status;

        const tests = await TestSeries.find(query)
            .sort({ createdAt: -1 })
            .select('-sections'); // Exclude sections/questions for lighter load on list view
            
        res.json(tests);
    } catch (err) {
        console.error('Get All TestSeries Error:', err.message);
        res.status(500).json({ error: err.message });
    }
};



// GET: Single test series by ID
export const getTestSeriesById = async (req, res) => {
    try {
        const test = await TestSeries.findById(req.params.id)
            // 👇 UPDATE THIS BLOCK
            .populate({
                path: 'sections.questions',
                select: 'questionText questionImage options correctAnswer explanation explanationImage questionType groupId', // Added groupId
                populate: { path: 'groupId' } // Nested populate to get the Passage
            })
            .populate('attempts.userId', 'name email');
            
        if (!test) return res.status(404).json({ error: 'TestSeries not found' });
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
    // 🗑️ CACHE CLEARING LOGIC (The Fix)
    // ---------------------------------------------------------
    if (req.redis) {
        const cacheKey = `TEST_CONTENT_V1:${req.params.id}`;
        
        // Delete the key. The next user will trigger a fresh DB fetch.
        await req.redis.del(cacheKey); 
        
        console.log(`✅ Cache Cleared for Test ID: ${req.params.id}`);
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

    // Step 1: Delete the master test series template
    const deletedMaster = await TestSeries.findByIdAndDelete(masterTestId);

    if (!deletedMaster) {
      return res.status(404).json({ error: 'Master TestSeries not found' });
    }

    // Step 2: Delete cloned instances
    await TestSeries.deleteMany({ originalId: masterTestId });

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
    const recent = await TestSeries.find({ 'attempts.userId': userId })
      .sort({ updatedAt: -1 })
      .limit(5)
      // ✅ Added 'filter1'
      .select('title exam subjectTags releaseDate filter1');
    res.json(recent);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching recent test series' });
  }
};

export const startTestSecure = async (req, res) => {
  const userId = req.user._id;
  const { testId, reattempt } = req.body;
  const redis = req.redis; // ✅ Get Redis from request

  try {
    // ---------------------------------------------------------
    // STEP 1: CACHE HIT (Fetch "Heavy" Test Data from Redis)
    // ---------------------------------------------------------
    // We cache the Static Data (Questions, Sections, Instructions)
    const cacheKey = `TEST_CONTENT_V1:${testId}`;
    let staticTestData = await redis.get(cacheKey);

    if (!staticTestData) {
      // ⚠️ Cache Miss: Fetch from DB (Heavy Query) using .lean() for speed
      console.log(`[Cache Miss] Fetching Test Content for ${testId}`);
      
      const testDoc = await TestSeries.findById(testId)
        .select('title sections testDurationInMinutes allowSectionJump cutoff description exam') // Select only static fields
        .populate({
          path: 'sections.questions',
          select: 'questionText questionImage options questionType groupId marks negativeMarks answerMin answerMax', // Fetch pure data
          populate: { path: 'groupId', select: 'directionText directionImage type' }
        })
        .lean(); // ✅ .lean() makes it 5x faster and lighter on memory

      if (!testDoc) return res.status(404).json({ message: 'Test not found' });

      // Handle Hindi Logic inside the cache generation
      testDoc.sections.forEach(section => {
         const hasHindi = section.questions.some(q => 
            (q.questionText?.hi && q.questionText.hi.trim() !== '') ||
            (q.options && q.options.some(opt => opt.text?.hi && opt.text.hi.trim() !== ''))
         );
         section.languages = hasHindi ? ['en', 'hi'] : ['en'];
      });

      staticTestData = testDoc;
      // ✅ Save to Redis for 24 Hours (86400 seconds)
      await redis.set(cacheKey, JSON.stringify(testDoc), { ex: 86400 });
    } else {
        // Ensure it's an object if Redis returned a string
        if (typeof staticTestData === 'string') {
            staticTestData = JSON.parse(staticTestData);
        }
    }

    // ---------------------------------------------------------
    // STEP 2: DB CHECK (Fetch "Dynamic" User Data Only)
    // ---------------------------------------------------------
    // We fetch ONLY the user attempts and metadata. No questions. Very fast.
    const dynamicTestDoc = await TestSeries.findById(testId)
       .select('attempts isPaid originalId allowSectionJump testDurationInMinutes sections.durationInMinutes'); // Light query

    if (!dynamicTestDoc) return res.status(404).json({ message: 'Test not found (Dynamic)' });

    // ---------------------------------------------------------
    // STEP 3: ACCESS CONTROL & ATTEMPT LOGIC
    // ---------------------------------------------------------
    const user = await User.findById(userId).select('passExpiry role');
    const isPrime = user.passExpiry && new Date(user.passExpiry) > new Date();
    const isAdmin = user.role === 'admin';

    const previousAttempts = dynamicTestDoc.attempts.filter(a => a.userId.toString() === userId.toString());
    const completedAttempts = previousAttempts.filter(a => a.isCompleted);
    let existingAttempt = dynamicTestDoc.attempts.find(a => !a.isCompleted && a.userId.toString() === userId.toString());

    // Rule A: PAID TESTS
    if (dynamicTestDoc.isPaid && !isPrime && !isAdmin) {
        return res.status(403).json({ 
            message: 'This is a Prime Member exclusive test. Please purchase a pass.',
            requiresPrime: true 
        });
    }

    // Rule B: FREE TESTS - REATTEMPT LIMIT
    const MAX_FREE_ATTEMPTS = 2;
    if (!dynamicTestDoc.isPaid && !isPrime && !isAdmin) {
        if (!existingAttempt && completedAttempts.length >= MAX_FREE_ATTEMPTS) {
            return res.status(200).json({ 
                success: false, 
                errorType: 'PRIME_LIMIT',
                message: `You have reached the maximum free attempts. Upgrade to Prime.`,
                requiresPrime: true 
            });
        }
    }

    // ---------------------------------------------------------
    // STEP 4: CREATE OR RESUME ATTEMPT
    // ---------------------------------------------------------
    if (!existingAttempt) {
      if (completedAttempts.length > 0 && !reattempt) {
         return res.status(403).json({ 
             message: 'Test already completed.', 
             status: 'completed',
             attemptId: completedAttempts[completedAttempts.length-1]._id
         });
      }

      // Calculate Initial Time (Use cached data structure for duration lookup)
      let initialTime = 0;
      if (dynamicTestDoc.allowSectionJump) {
         if (dynamicTestDoc.testDurationInMinutes > 0) {
            initialTime = dynamicTestDoc.testDurationInMinutes * 60;
         } else {
             // Fallback: sum section times from static data
            initialTime = staticTestData.sections.reduce((acc, sec) => acc + (Number(sec.durationInMinutes) || 0), 0) * 60;
         }
      } else {
         if (staticTestData.sections && staticTestData.sections.length > 0) {
            initialTime = (Number(staticTestData.sections[0].durationInMinutes) || 0) * 60;
         }
      }

      const newAttempt = {
        userId,
        startedAt: new Date(),
        isCompleted: false,
        attemptNumber: completedAttempts.length + 1,
        answers: [],
        currentSectionIndex: 0,
        currentQuestionIndex: 0,
        timeLeftInSeconds: initialTime
      };

      dynamicTestDoc.attempts.push(newAttempt);
      await dynamicTestDoc.save(); // ✅ Only saving metadata + attempts
      existingAttempt = dynamicTestDoc.attempts[dynamicTestDoc.attempts.length - 1];
    }

    // ---------------------------------------------------------
    // STEP 5: MERGE & RESPOND
    // ---------------------------------------------------------
    // We combine the Static Questions (Redis) with the Dynamic Attempt ID (DB)
    const finalResponse = {
        ...staticTestData, // The heavy questions from cache
        _id: dynamicTestDoc._id, // Ensure ID matches
        attempts: undefined, // Don't send other users' attempts
        isPaid: dynamicTestDoc.isPaid
    };

    res.status(200).json({
      message: 'Access granted',
      testId,
      test: finalResponse, // Sent from Cache! 🚀
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

    // ✅ CHECK: Ensure we only fetch IN-PROGRESS attempts
    const attempt = test.attempts.find(
      a => a.userId.toString() === userId.toString() && !a.isCompleted
    );

    if (!attempt) {
        return res.status(403).json({ message: 'Cannot save. Attempt not active or already submitted.' });
    }

    // ✅ FIX: Handle Section Switching Logic
    const isSwitchingSection = currentSectionIndex !== undefined && currentSectionIndex !== attempt.currentSectionIndex;

    if (isSwitchingSection) {
      // 1. Update the section index
      attempt.currentSectionIndex = currentSectionIndex;

      // 2. Handle Timer Logic based on Mode
      if (test.allowSectionJump) {
        // GLOBAL TIMING
        if (timeLeftInSeconds !== undefined) {
          attempt.timeLeftInSeconds = timeLeftInSeconds;
        }
      } else {
        // SECTIONAL TIMING
        if (test.sections[currentSectionIndex]) {
           const newSectionDuration = test.sections[currentSectionIndex].durationInMinutes || 0;
           attempt.timeLeftInSeconds = newSectionDuration * 60;
        }
      }
    } else {
      // Same section: just update the time
      if (timeLeftInSeconds !== undefined) attempt.timeLeftInSeconds = timeLeftInSeconds;
    }

    if (currentQuestionIndex !== undefined) attempt.currentQuestionIndex = currentQuestionIndex;

    // Update answers
    if (answers && Array.isArray(answers)) {
      answers.forEach((newAns) => {
        const existing = attempt.answers.find(a => a.questionId.toString() === newAns.questionId);
        if (existing) {
          existing.selectedOptions = newAns.selectedOptions;
          existing.timeTaken = newAns.timeTaken || 0;
          // ✅ NEW: Save Marked and Visited status
          existing.isMarked = newAns.isMarked;
          existing.isVisited = newAns.isVisited;
        } else {
          attempt.answers.push({
            questionId: newAns.questionId,
            selectedOptions: newAns.selectedOptions,
            timeTaken: newAns.timeTaken || 0,
            // ✅ NEW: Save Marked and Visited status on new entry
            isMarked: newAns.isMarked || false,
            isVisited: newAns.isVisited || true
          });
        }
      });
    }

    await test.save();
    
    res.status(200).json({ 
        message: 'Progress saved', 
        timeLeftInSeconds: attempt.timeLeftInSeconds,
        currentSectionIndex: attempt.currentSectionIndex
    });

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
  const redis = req.redis;

  try {
    // ---------------------------------------------------------
    // 1. FETCH STATIC TEST CONTENT (Questions & Marking Scheme)
    // ---------------------------------------------------------
    const staticCacheKey = `TEST_STATIC_V1:${attemptId}`; // Using attemptId to infer test, or verify testId logic
    // Ideally we query by TestID, but here we find by attempt. 
    // Optimization: Find TestID first (lightweight)
    const testIdLookup = await TestSeries.findOne({ 'attempts._id': attemptId }).select('_id title totalMarks cutoff tags markingScheme marksPerQuestion').lean();
    
    if (!testIdLookup) {
        return res.status(404).json({ message: 'Test not found for this attempt' });
    }
    const testId = testIdLookup._id.toString();

    // Now fetch full static details (Questions) with Cache
    const testCacheKey = `SOLUTION_STATIC_V1:${testId}`;
    let staticTest = await redis.get(testCacheKey);

    if (!staticTest) {
       staticTest = await TestSeries.findById(testId)
         .select('-attempts') // ❌ Critical: Exclude attempts array
         .populate({
            path: 'sections.questions',
            model: 'Question',
            select: 'questionType correctAnswer answerMin answerMax marks negativeMarks subject chapter topic'
         })
         .lean();
       
       await redis.set(testCacheKey, JSON.stringify(staticTest), { ex: 86400 }); // 24 Hours
    } else {
       if (typeof staticTest === 'string') staticTest = JSON.parse(staticTest);
    }

    // ---------------------------------------------------------
    // 2. FETCH CURRENT USER'S ATTEMPT
    // ---------------------------------------------------------
    // We use projection to fetch ONLY the one specific attempt.
    const userAttemptDoc = await TestSeries.findOne(
        { _id: testId },
        { attempts: { $elemMatch: { _id: attemptId } } }
    ).lean();

    const attempt = userAttemptDoc?.attempts?.[0];
    if (!attempt || !attempt.isCompleted) {
        return res.status(400).json({ message: 'Attempt not found or not completed' });
    }

    // ---------------------------------------------------------
    // 3. LEADERBOARD & STATS (Cached)
    // ---------------------------------------------------------
    const leaderboardKey = `LEADERBOARD_V1:${testId}`;
    let allUsersPerformance = await redis.get(leaderboardKey);

    if (!allUsersPerformance) {
        // Fetch simplified list of scores (Lightweight)
        const doc = await TestSeries.findById(testId)
            .select('attempts.userId attempts.score attempts.timeTaken attempts.answers.timeTaken attempts.isCompleted')
            .lean();

        allUsersPerformance = doc.attempts
            .filter(a => a.isCompleted)
            .map(a => {
                // Calculate time taken if not stored explicitly
                const timeTaken = a.timeTaken || a.answers?.reduce((sum, ans) => sum + (ans.timeTaken || 0), 0) || 0;
                return {
                    userId: a.userId.toString(),
                    score: a.score || 0, // ✅ Use stored score (Fast)
                    timeTaken,
                    // We don't recalculate accuracy for everyone to save CPU
                    accuracy: 0 
                };
            })
            .sort((a, b) => b.score - a.score); // Sort Descending

        // Cache for 10 Minutes
        await redis.set(leaderboardKey, JSON.stringify(allUsersPerformance), { ex: 600 });
    } else {
        if (typeof allUsersPerformance === 'string') allUsersPerformance = JSON.parse(allUsersPerformance);
    }

    // ---------------------------------------------------------
    // 4. CALCULATE USER SPECIFIC METRICS
    // ---------------------------------------------------------
    // We do need to calculate detailed accuracy for the CURRENT user
    const { correct, incorrect, unattempted, score, total, sectionStats, accuracy } = calcScore(attempt.answers, staticTest);

    const totalUsers = allUsersPerformance.length;
    const userRank = allUsersPerformance.findIndex(p => p.userId === userId.toString()) + 1;
    const topperPerformance = allUsersPerformance[0] || { score: 0, timeTaken: 0, accuracy: 0, correct: 0, incorrect: 0 };

    // Calculate Averages from Leaderboard
    const totalScoreSum = allUsersPerformance.reduce((acc, curr) => acc + curr.score, 0);
    const totalTimeSum = allUsersPerformance.reduce((acc, curr) => acc + curr.timeTaken, 0);

    const averagePerformance = {
        avgScore: +(totalScoreSum / totalUsers).toFixed(2),
        avgTime: Math.round(totalTimeSum / totalUsers),
        avgAccuracy: 0, // Simplified to avoid loop
        avgCorrect: 0,  // Simplified
        avgIncorrect: 0 // Simplified
    };

    // ---------------------------------------------------------
    // 5. RANK LIST & DISTRIBUTION
    // ---------------------------------------------------------
    const topUserIds = allUsersPerformance.slice(0, 10).map(entry => entry.userId);
    const users = await User.find({ _id: { $in: topUserIds } }).select('name');
    const userMap = new Map(users.map(u => [u._id.toString(), u.name]));

    const rankList = allUsersPerformance.slice(0, 10).map(entry => ({
        name: userMap.get(entry.userId) || 'Unknown',
        score: entry.score
    }));

    const { medianScore, marksDistribution } = calculateDistributionStats(allUsersPerformance.map(s => s.score), total);

    // ---------------------------------------------------------
    // 6. QUESTION ANALYSIS
    // ---------------------------------------------------------
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
      testTitle: staticTest.title,
      userName: req.user.name,
      scoreSummary: {
        userScore: score, // Calculated fresh for precision
        timeTaken: attempt.answers.reduce((sum, ans) => sum + (ans.timeTaken || 0), 0),
        accuracy,
        correct,
        incorrect,
        unattempted,
        totalMarks: total,
        ...averagePerformance,
        topScore: topperPerformance.score,
        topTime: topperPerformance.timeTaken,
      },
      sectionStats,
      rank: userRank,
      rankList,
      marksDistribution,
      medianScore,
      cutoff: staticTest.cutoff || {},
      questionDetails,
      tags: staticTest.tags || []
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
  const redis = req.redis; // Ensure this is available from middleware

  try {
    // -----------------------------------------------------------
    // 1. CACHE STRATEGY: Fetch Static Content (Questions, Explanations)
    // -----------------------------------------------------------
    // We try to get the "Question Paper" from Redis first.
    const cacheKey = `SOLUTION_STATIC_V1:${testId}`;
    let staticTest = await redis.get(cacheKey);

    if (!staticTest) {
      // ⚠️ Cache Miss: Fetch from DB (Heavy Query)
      // Note: We EXCLUDE 'attempts' here to save memory.
      const testDoc = await TestSeries.findById(testId)
        .select('-attempts') 
        .populate({
          path: 'sections.questions',
          select: 'questionText questionImage options correctAnswer questionType explanation explanationImage answerMin answerMax groupId marks negativeMarks',
          populate: { path: 'groupId', select: 'directionText directionImage type' }
        })
        .lean(); // Use lean() for speed

      if (!testDoc) return res.status(404).json({ message: 'Test not found' });

      // Handle Hindi Logic (Static)
      testDoc.sections.forEach(section => {
         const hasHindi = section.questions.some(q => 
            (q.questionText?.hi && q.questionText.hi.trim() !== '') ||
            (q.options && q.options.some(opt => opt.text?.hi && opt.text.hi.trim() !== '')) ||
            (q.explanation?.hi && q.explanation.hi.trim() !== '')
         );
         section.languages = hasHindi ? ['en', 'hi'] : ['en'];
      });

      staticTest = testDoc;
      // Save to Redis for 24 Hours
      await redis.set(cacheKey, JSON.stringify(staticTest), { ex: 86400 });
    } else {
        // Parse if it came from Redis
        if (typeof staticTest === 'string') staticTest = JSON.parse(staticTest);
    }

    // -----------------------------------------------------------
    // 2. FETCH DYNAMIC USER ATTEMPT (Lightweight)
    // -----------------------------------------------------------
    // We use projection to fetch ONLY the specific attempt.
    const attemptDoc = await TestSeries.findOne(
        { _id: testId },
        { attempts: { $elemMatch: { _id: attemptId } } } 
    ).lean();

    if (!attemptDoc || !attemptDoc.attempts || attemptDoc.attempts.length === 0) {
        return res.status(404).json({ message: 'Attempt not found' });
    }
    const selectedAttempt = attemptDoc.attempts[0];

    // -----------------------------------------------------------
    // 3. STATS STRATEGY (Simplified for Performance)
    // -----------------------------------------------------------
    // Calculating "Accuracy %" on the fly for 1000 users is too slow.
    // Ideally, fetch pre-calculated stats from Redis.
    // For now, we return empty stats or fetch from cache if available.
    const statsKey = `TEST_STATS_V1:${testId}`;
    let questionStats = await redis.get(statsKey);
    
    if (!questionStats) {
        questionStats = {}; // Return empty to avoid timeout
    } else if (typeof questionStats === 'string') {
        questionStats = JSON.parse(questionStats);
    }

    // -----------------------------------------------------------
    // 4. REPORT STATUS INJECTION
    // -----------------------------------------------------------
    if (req.user) {
       const allQuestionIds = staticTest.sections.flatMap(section => 
           section.questions.map(q => q._id)
       );
       
       const userReports = await QuestionReport.find({
           userId: req.user._id,
           questionId: { $in: allQuestionIds }
       }).select('questionId status').lean();

       const reportMap = new Map();
       userReports.forEach(r => reportMap.set(r.questionId.toString(), r.status));

       staticTest.sections.forEach(section => {
           section.questions.forEach(q => {
               q.reportStatus = reportMap.get(q._id.toString()) || null;
           });
       });
    }

    // -----------------------------------------------------------
    // 5. PREPARE RESPONSE
    // -----------------------------------------------------------
    const responses = {};
    selectedAttempt.answers.forEach(ans => {
        responses[ans.questionId.toString()] = ans.selectedOptions;
    });

    // We attach the single attempt to the test object so frontend logic works
    const finalTest = {
        ...staticTest,
        attempts: [selectedAttempt] 
    };

    res.status(200).json({
      test: finalTest,
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
        if (test.attempts && test.attempts.length > 0 && status === 'draft') {
            return res.status(400).json({ message: 'A test that has been attempted cannot be moved back to draft.' });
        }
        
        // Rule 2: An archived test is locked and cannot be changed.
        if (test.status === 'archived') {
            return res.status(400).json({ message: 'Archived tests are locked and their status cannot be changed.' });
        }
        
        test.status = status;
        await test.save();

        // Optional: Add notification logic here if a test is published
        
        res.json({ message: `Test status updated to '${status}'` });
    } catch (error) {
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

