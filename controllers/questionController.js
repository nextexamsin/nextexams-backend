import mongoose from 'mongoose';
import Question from '../models/Question.js';
import TestSeries from '../models/testSeriesModel.js';

// Helper to determine languages based on input
const getAvailableLanguages = (data) => {
  const langs = ['en'];
  // Check if Hindi question text exists and is not empty
  // Handles both object input and potential legacy input
  if (data.questionText && typeof data.questionText === 'object' && data.questionText.hi && data.questionText.hi.trim()) {
    langs.push('hi');
  }
  return langs;
};

// POST - Create single or multiple questions
export const createQuestion = async (req, res) => {
  try {
    const adminId = req.user.id; 

    if (Array.isArray(req.body)) {
      // BULK UPLOAD LOGIC
      const questionsWithCreator = req.body.map(q => ({
        ...q,
        createdBy: adminId,
        availableLanguages: getAvailableLanguages(q) // Auto-detect languages
      }));
      const inserted = await Question.insertMany(questionsWithCreator);
      return res.status(201).json(inserted);
    } else {
      // SINGLE CREATE LOGIC
      const questionData = {
        ...req.body,
        createdBy: adminId,
        availableLanguages: getAvailableLanguages(req.body) // Auto-detect languages
      };
      const question = new Question(questionData);
      await question.save();
      return res.status(201).json(question);
    }
  } catch (err) {
    console.error('Create Question Error:', err.message);
    res.status(400).json({ error: err.message });
  }
};

// GET - Get all questions with optional filters
export const getQuestions = async (req, res) => {
  try {
    const { search, subject, exam, type, difficulty, chapter, topic, tags } = req.query;
    const filter = {};

    // ✅ FIXED: Robust Search for Hybrid Data (Strings & Objects)
    if (search) {
        // This Regex matches if:
        // 1. questionText is a string (Old Data) AND matches
        // 2. questionText.en (New Data) matches
        filter.$or = [
            { 'questionText': { $regex: search, $options: 'i' } },    // Legacy String search
            { 'questionText.en': { $regex: search, $options: 'i' } }  // New Object search
        ];
    }

    if (subject) filter.subject = subject;
    if (exam) filter.exam = exam;
    if (type) filter.questionType = type;
    if (difficulty) filter.difficulty = difficulty;
    if (chapter) filter.chapter = chapter;
    if (topic) filter.topic = topic;
    if (tags) filter.tags = { $in: tags.split(',') }; 

    const questions = await Question.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
      
    res.json(questions);
  } catch (err) {
    console.error('Get Questions Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// GET - Single question by ID
export const getQuestionById = async (req, res) => {
  try {
    const question = await Question.findById(req.params.id).populate('createdBy', 'name email');
    if (!question) return res.status(404).json({ error: 'Question not found' });
    res.json(question);
  } catch (err) {
    console.error('Get Question By ID Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// PUT - Update a question
export const updateQuestion = async (req, res) => {
  try {
    // Recalculate languages on update based on the incoming data
    const updateData = {
      ...req.body,
      availableLanguages: getAvailableLanguages(req.body)
    };

    const updated = await Question.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updated) return res.status(404).json({ error: 'Question not found' });
    res.json(updated);
  } catch (err) {
    console.error('Update Question Error:', err.message);
    res.status(400).json({ error: err.message });
  }
};

// DELETE - Remove a question
export const deleteQuestion = async (req, res) => {
  try {
    const deleted = await Question.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Question not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err)
  {
    console.error('Delete Question Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ... (Existing helper functions unchanged)
export const getUniqueSubjects = async (req, res) => {
    try {
      const { tags } = req.query;
      const filter = tags ? { tags: { $in: tags.split(',') } } : {};
      const subjects = await Question.distinct('subject', filter);
      res.json(subjects.sort());
    } catch (err) {
      console.error('Get Unique Subjects Error:', err.message);
      res.status(500).json({ error: 'Server error while fetching subjects' });
    }
  };
  
  export const getUniqueChapters = async (req, res) => {
    try {
      const { subject, tags } = req.query;
      if (!subject) {
        return res.status(400).json({ error: 'Subject is required' });
      }
      const filter = { subject };
      if (tags) filter.tags = { $in: tags.split(',') };
      const chapters = await Question.distinct('chapter', filter);
      res.json(chapters.sort());
    } catch (err) {
      console.error('Get Unique Chapters Error:', err.message);
      res.status(500).json({ error: 'Server error while fetching chapters' });
    }
  };
  
  export const getUniqueTopics = async (req, res) => {
    try {
      const { subject, chapter, tags } = req.query;
      if (!subject || !chapter) {
        return res.status(400).json({ error: 'Subject and chapter are required' });
      }
      const filter = { 
          subject, 
          chapter,
          topic: { $ne: null, $ne: "" } 
      };
      if (tags) filter.tags = { $in: tags.split(',') };
      const topics = await Question.distinct('topic', filter);
      res.json(topics.sort());
    } catch (err) {
      console.error('Get Unique Topics Error:', err.message);
      res.status(500).json({ error: 'Server error while fetching topics' });
    }
  };
  
  export const getQuestionCount = async (req, res) => {
      try {
          const { subject, chapter, topic, difficulty, tags } = req.query;
  
          const query = {};
          if (subject) query.subject = subject;
          if (chapter) query.chapter = chapter;
          if (topic) query.topic = topic;
          if (difficulty) query.difficulty = difficulty;
          
          if (tags && tags.startsWith('source_test_')) {
              const sourceTestId = tags.replace('source_test_', '');
              const sourceTest = await TestSeries.findById(sourceTestId).lean();
  
              if (sourceTest && Array.isArray(sourceTest.sections)) {
                  const sourceQuestionIds = sourceTest.sections.flatMap(sec => sec.questions);
                  query._id = { $in: sourceQuestionIds };
              } else {
                  return res.status(200).json({ count: 0 });
              }
          }
  
          const count = await Question.countDocuments(query);
          res.status(200).json({ count });
  
      } catch (error) {
          console.error('Error in getQuestionCount:', {
              message: error.message,
              query: req.query
          });
          res.status(500).json({ error: 'Server error while fetching question count.' });
      }
  };