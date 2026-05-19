// qa-bot.js
require('dotenv').config();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// --- CONFIGURATION ---
const API_BASE_URL = 'http://localhost:8000/api'; // Change if running on a different port
const JWT_SECRET = process.env.JWT_SECRET; // Must match your .env
const TARGET_TEST_ID = '6a0cc224db52669b8febfbf2'; 
const NUMBER_OF_USERS = 10; // How many concurrent users to simulate

if (!JWT_SECRET) {
    console.error("❌ ERROR: JWT_SECRET not found. Run this in the same directory as your .env");
    process.exit(1);
}

// --- NEW: GRAB DB STRING TO SEED USERS ---
const MONGO_URL_TEST = process.env.MONGO_URL_TEST;

// --- THE CORE SIMULATION LOGIC ---
const simulateUserJourney = async (user, index) => {
    const api = axios.create({
        baseURL: API_BASE_URL,
        headers: { Authorization: `Bearer ${user.token}` }
    });

    try {
        console.log(`[User ${index}] 🚀 Starting journey...`);

        // 1. REGISTER FOR LIVE TEST
        try {
            await api.post(`/testseries/${TARGET_TEST_ID}/register-live`);
            console.log(`[User ${index}] ✅ Registered for Live Test.`);
        } catch (err) {
            if (err.response?.data?.message !== 'You are already registered for this test.') {
                console.error(`[User ${index}] ⚠️ Registration Failed:`, err.response?.data?.message || err.message);
                return; 
            }
        }

        // 2. START THE TEST
        const startRes = await api.post(`/testseries/start`, { 
            testId: TARGET_TEST_ID, 
            reattempt: false 
        });
        const testData = startRes.data.test;
        console.log(`[User ${index}] 🟢 Test Started. Attempt ID: ${startRes.data.attemptId}`);

        // 3. SIMULATE TAKING THE TEST & SAVING PROGRESS
        const sections = testData.sections;
        let generatedAnswers = [];
        let timeRemaining = startRes.data.attempt.timeLeftInSeconds;

        for (let secIdx = 0; secIdx < sections.length; secIdx++) {
            const section = sections[secIdx];
            
            for (let qIdx = 0; qIdx < section.questions.length; qIdx++) {
                const question = section.questions[qIdx];
                
                const timeTaken = Math.floor(Math.random() * 20) + 10;
                timeRemaining = Math.max(0, timeRemaining - timeTaken);

                const randomOptionIndex = Math.floor(Math.random() * (question.options?.length || 4));
                const selectedOptionLabel = question.options[randomOptionIndex]?.label || 'A';

                generatedAnswers.push({
                    questionId: question._id,
                    selectedOptions: [selectedOptionLabel],
                    timeTaken: timeTaken,
                    isMarked: false,
                    isVisited: true
                });

                if (generatedAnswers.length % 5 === 0) {
                    await api.post(`/testseries/${TARGET_TEST_ID}/save-progress`, {
                        answers: generatedAnswers,
                        timeLeftInSeconds: timeRemaining,
                        currentSectionIndex: secIdx,
                        currentQuestionIndex: qIdx
                    });
                    console.log(`[User ${index}] 💾 Progress Saved (Q: ${generatedAnswers.length}).`);
                }
            }
        }

        // Final save before completion
        await api.post(`/testseries/${TARGET_TEST_ID}/save-progress`, {
            answers: generatedAnswers,
            timeLeftInSeconds: timeRemaining,
            currentSectionIndex: sections.length - 1,
            currentQuestionIndex: sections[sections.length - 1].questions.length - 1
        });

        // 4. COMPLETE THE TEST
        await api.post(`/testseries/${TARGET_TEST_ID}/complete`);
        console.log(`[User ${index}] 🏁 Test Completed & Submitted Successfully!`);

    } catch (error) {
        console.error(`[User ${index}] ❌ Pipeline Error:`, error.response?.data?.message || error.message);
    }
};


// --- RUN THE STRESS TEST ---
// --- RUN THE STRESS TEST ---
const runQABot = async () => {
    console.log(`\n🔥 STRESS TEST INITIATED FOR ${NUMBER_OF_USERS} USERS 🔥\n`);
    
    if (!MONGO_URL_TEST) {
        console.error("❌ MONGO_URL_TEST missing in .env. The Bot needs this to create dummy users.");
        process.exit(1);
    }

    // 1. CONNECT TO SANDBOX
    await mongoose.connect(MONGO_URL_TEST);
    console.log("✅ Connected to Sandbox DB.");

    // 🧹 2. CLEANUP PREVIOUS RUNS
    // Delete only the fake users created by this bot, plus wipe previous attempts/registrations
    await mongoose.connection.collection('users').deleteMany({ email: { $regex: '@nextexams.qa$' } });
    await mongoose.connection.collection('testattempts').deleteMany({});
    await mongoose.connection.collection('liveregistrations').deleteMany({});
    console.log("🧹 Cleared old bot data and previous test attempts to ensure a clean slate.");

    // 3. SEED FAKE USERS
    const usersData = Array.from({ length: NUMBER_OF_USERS }).map((_, i) => {
        const fakeId = new mongoose.Types.ObjectId();
        const token = jwt.sign({ id: fakeId.toString(), role: 'user' }, JWT_SECRET, { expiresIn: '1d' });
        
        return {
            token,
            dbDoc: {
                _id: fakeId,
                name: `QA Bot ${i + 1}`,
                email: `bot${i + 1}@nextexams.qa`, // This triggered the duplicate error previously
                role: 'user',
                createdAt: new Date(),
                updatedAt: new Date()
            }
        };
    });

    await mongoose.connection.collection('users').insertMany(usersData.map(u => u.dbDoc));
    console.log(`✅ Inserted ${NUMBER_OF_USERS} fresh physical users into the database.\n`);

    // 4. FIRE ALL USER JOURNEYS CONCURRENTLY
    const startTime = Date.now();
    await Promise.allSettled(usersData.map((user, idx) => simulateUserJourney(user, idx + 1)));
    const endTime = Date.now();

    console.log(`\n🎉 STRESS TEST FINISHED 🎉`);
    console.log(`Total Execution Time: ${(endTime - startTime) / 1000} seconds`);
    
    await mongoose.disconnect();
    process.exit(0);
};

if (TARGET_TEST_ID === 'PLACE_YOUR_LIVE_TEST_ID_HERE') {
    console.log('⚠️ Please paste a valid TestSeries ID into TARGET_TEST_ID in the script.');
} else {
    runQABot();
}

if (TARGET_TEST_ID === 'PLACE_YOUR_LIVE_TEST_ID_HERE') {
    console.log('⚠️ Please paste a valid TestSeries ID into TARGET_TEST_ID in the script.');
} else {
    runQABot();
}