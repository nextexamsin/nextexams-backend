// createTemplate.js
import xlsx from 'xlsx';
import fs from 'fs';

// --- Data for the 'TestSeries_Details' sheet ---
const testDetailsHeaders = [
    'Test Title', 'Test Type', 'Exam', 'Description', 
    'Duration (Mins)', 'Allow Section Jump', 'Is Paid?', 'Is Published?', 'Release Date'
];
const testDetailsExample = [
    'JEE Main 2025 - Mock Test 1', 'full-length', 'JEE Main', 'Full syllabus mock test based on the latest pattern.', 
    180, 'YES', 'NO', 'YES', '2025-10-15 10:00'
];

// --- Data for the 'Questions' sheet ---
const questionsHeaders = [
    'Section Title', 'Question Text', 'Question Image', 'Question Type',
    'Option A', 'Option B', 'Option C', 'Option D', 'Option E', 'Option F', 'Option G', 'Option H',
    'Correct Answer', 'Explanation', 'Subject', 'Chapter', 'Topic', 'Difficulty'
];
const questionsExamples = [
    {
        'Section Title': 'Physics',
        'Question Text': 'What is the unit of force?',
        'Question Image': '',
        'Question Type': 'mcq',
        'Option A': 'Joule', 'Option B': 'Watt', 'Option C': 'Newton', 'Option D': 'Pascal',
        'Correct Answer': 'C',
        'Explanation': 'The SI unit of force is the Newton (N).',
        'Subject': 'Physics', 'Chapter': 'Laws of Motion', 'Topic': 'Force', 'Difficulty': 'easy'
    },
    {
        'Section Title': 'Chemistry',
        'Question Text': 'Which of the following are noble gases?',
        'Question Image': 'https://example.com/image.png',
        'Question Type': 'multiple',
        'Option A': 'Helium', 'Option B': 'Oxygen', 'Option C': 'Argon', 'Option D': 'Nitrogen',
        'Correct Answer': 'A,C',
        'Explanation': 'Helium (He) and Argon (Ar) are noble gases in Group 18.',
        'Subject': 'Chemistry', 'Chapter': 'Periodic Table', 'Topic': 'Noble Gases', 'Difficulty': 'medium'
    },
    {
        'Section Title': 'Maths',
        'Question Text': 'The value of ∫sin(x)dx from 0 to π/2 is:',
        'Question Image': '',
        'Question Type': 'numerical',
        'Correct Answer': '1',
        'Explanation': 'The integral of sin(x) is -cos(x). Evaluating from 0 to π/2 gives (-cos(π/2)) - (-cos(0)) = 0 - (-1) = 1.',
        'Subject': 'Maths', 'Chapter': 'Definite Integrals', 'Topic': 'Basic Integration', 'Difficulty': 'medium'
    }
];

// --- Create the Excel Workbook ---
const wb = xlsx.utils.book_new();

// Create 'TestSeries_Details' sheet
const ws1Data = [testDetailsHeaders, testDetailsExample];
const ws1 = xlsx.utils.aoa_to_sheet(ws1Data);
xlsx.utils.book_append_sheet(wb, ws1, 'TestSeries_Details');

// Create 'Questions' sheet
// Convert array of objects to a sheet, which handles headers automatically
const ws2 = xlsx.utils.json_to_sheet(questionsExamples, { header: questionsHeaders });
xlsx.utils.book_append_sheet(wb, ws2, 'Questions');

// --- Write the file ---
const fileName = 'Excel_Template_Test_Series.xlsx';
xlsx.writeFile(wb, fileName);

console.log(`✅ Success! Template file created: ${fileName}`);