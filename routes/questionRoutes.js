const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

const {
  createQuestion,
  getQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  getUniqueSubjects,
  getUniqueChapters,
  getUniqueTopics,
  getQuestionCount,
} = require('../controllers/questionController');

const { protect, adminOnly } = require('../middleware/authMiddleware');

// --- NEW: Metadata Routes ---
router.get('/meta/subjects', protect, getUniqueSubjects);
router.get('/meta/chapters', protect, getUniqueChapters);
router.get('/meta/topics', protect, getUniqueTopics);
router.get('/count', protect, adminOnly, getQuestionCount);


// --- Standard Question Routes ---

// GET all questions (accessible to any logged-in user)
router.get('/', protect, getQuestions);

// ✅ GET a single question by ID 
// 'protect' middleware is crucial here so getQuestionById knows req.user
router.get(
  '/:id',
  protect,
  [param('id', 'Invalid question ID').isMongoId()], 
  getQuestionById
);

// POST a new question (admins only)
router.post(
  '/',
  protect,    
  adminOnly,  
  [           
    body('questionText', 'Question text is required').not().isEmpty(),
    body('questionType', 'Invalid question type').isIn(['mcq', 'multiple', 'numerical']),
    body('subject', 'Subject is required').not().isEmpty(),
    body('chapter', 'Chapter is required').not().isEmpty(),
    body('difficulty', 'Invalid difficulty').isIn(['easy', 'medium', 'hard']),
    body('marks', 'Marks must be a number').isNumeric(),
    body('negativeMarks', 'Negative marks must be a number').isNumeric(),
    body('options', 'Options must be an array for mcq/multiple types').if(body('questionType').isIn(['mcq', 'multiple'])).isArray({ min: 2 }),
    body('correctAnswer', 'Correct answer is required').not().isEmpty(),
  ],
  createQuestion
);

// PUT (update) a question (admins only)
router.put(
  '/:id',
  protect,
  adminOnly,
  [param('id', 'Invalid question ID').isMongoId()],
  updateQuestion
);

// DELETE a question (admins only)
router.delete(
  '/:id',
  protect,
  adminOnly,
  [param('id', 'Invalid question ID').isMongoId()],
  deleteQuestion
);

module.exports = router;