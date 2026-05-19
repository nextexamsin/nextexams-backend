// seed-test.js
require('dotenv').config();
const mongoose = require('mongoose');

// ✅ Import YOUR actual Mongoose Models
const Question = require('./models/Question.js');
const TestSeries = require('./models/testSeriesModel.js');

const seedSandbox = async () => {
    const dbURI = process.env.MONGO_URL_TEST;
    if (!dbURI) {
        console.error("❌ MONGO_URL_TEST is missing from .env");
        process.exit(1);
    }
    
    await mongoose.connect(dbURI);
    console.log("✅ Connected to Sandbox DB...");

    // Setup timings
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const twoHoursFromNow = new Date(now.getTime() + 120 * 60 * 1000);

    try {
        // 1. Create a fully-formatted Question using your schema
        const question = new Question({
            questionText: { en: "Load Testing Question 1: What is 2 + 2?", hi: "" },
            questionType: "mcq",
            options: [
                { label: "A", text: { en: "3" }, image: "" },
                { label: "B", text: { en: "4" }, image: "" },
                { label: "C", text: { en: "5" }, image: "" },
                { label: "D", text: { en: "6" }, image: "" }
            ],
            correctAnswer: ["B"],
            marks: 1,
            negativeMarks: 0.25,
            difficulty: "easy",
            exam: "QA",
            subject: "Mathematics",
            chapter: "Basic Math",
            topic: "Addition",
            tags: ["QA", "Mathematics"]
        });
        
        const savedQuestion = await question.save();
        console.log("✅ Question generated.");

        // 2. Create the Live Test using your schema
        const test = new TestSeries({
            title: "QA Bot Stress Test 2024 (UI Compatible)",
            exam: "QA",
            subject: "mathematics",
            status: "published",
            isPaid: false, 
            
            // Live Test Config
            isLiveTest: true,
            liveTestType: "fixed",
            liveTestStatus: "Live",
            registrationStartTime: oneHourAgo,
            registrationEndTime: oneHourFromNow,
            testWindowStartTime: oneHourAgo,
            testWindowEndTime: oneHourFromNow,
            resultPublishTime: twoHoursFromNow,
            
            testDurationInMinutes: 60,
            allowSectionJump: true,
            totalMarks: 1,
            sections: [{
                title: "General Section",
                durationInMinutes: 60,
                questions: [savedQuestion._id],
                marksPerQuestion: 1,
                negativeMarking: 0.25,
                languages: ["en"]
            }]
        });

        const savedTest = await test.save();
        console.log("✅ Live Test generated.");

        console.log("\n🎉 SUCCESS! UI-COMPATIBLE TEST CREATED.");
        console.log("=========================================");
        console.log("🎯 COPY THIS NEW ID: ", savedTest._id.toString());
        console.log("=========================================\n");

    } catch (err) {
        console.error("❌ Error generating test:", err.message);
    }
    
    process.exit(0);
};

seedSandbox();