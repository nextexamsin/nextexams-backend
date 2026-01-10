// nextExams-backend/utils/calcScore.js

const getMarksForQuestion = (question, section, test) => {
  const type = question.questionType; // 'mcq', 'multiple', or 'numerical'

  // Priority 1: Section-level Complex Scheme
  if (section.markingScheme && section.markingScheme[type]) {
    return {
      marks: Number(section.markingScheme[type].marks),
      negative: Number(section.markingScheme[type].negative),
    };
  }

  // Priority 2: Section-level Simple Scheme
  if (section.marksPerQuestion != null) {
    return {
      marks: Number(section.marksPerQuestion),
      negative: Number(section.negativeMarking || 0),
    };
  }

  // Priority 3: Test-level Complex Scheme
  if (test.markingScheme && test.markingScheme[type]) {
    return {
      marks: Number(test.markingScheme[type].marks),
      negative: Number(test.markingScheme[type].negative),
    };
  }

  // Priority 4: Test-level Simple Scheme
  if (test.marksPerQuestion != null) {
    return {
      marks: Number(test.marksPerQuestion),
      negative: Number(test.negativeMarking || 0),
    };
  }

  // Fallback to question's own marks
  return {
    marks: Number(question.marks) || 1,
    negative: Number(question.negativeMarks) || 0,
  };
};

module.exports = function calcScore(answers = [], test = {}, returnAnswerMap = false) {
  // 🚀 OPTIMIZATION: Convert Array to Map for O(1) Lookup
  // This removes the slow .find() loop completely.
  const userAnswersMap = new Map();
  if (Array.isArray(answers)) {
    for (const ans of answers) {
        if (ans.questionId) {
            userAnswersMap.set(ans.questionId.toString(), ans);
        }
    }
  }

  let correct = 0;
  let incorrect = 0;
  let unattempted = 0;
  let score = 0;
  let totalMarks = 0;
  const sectionStats = [];
  const answerMap = {}; // To store correct answers if requested

  if (!test.sections) return { score: 0, total: 0 };

  test.sections.forEach((section) => {
    let sCorrect = 0, sIncorrect = 0, sUnattempted = 0;
    let sScore = 0;

    section.questions.forEach((q) => {
      const questionId = q._id?.toString();
      
      // Calculate Marks based on your Priority Logic
      const { marks, negative } = getMarksForQuestion(q, section, test);
      totalMarks += marks;
      
      // If we just need the answer map, populate it and continue
      if (returnAnswerMap) {
        answerMap[questionId] = {
          ans: q.correctAnswer,
          min: q.answerMin,
          max: q.answerMax,
          type: q.questionType
        };
        return; // Skip the rest for this question
      }

      // 🚀 FAST LOOKUP: No loop here anymore
      const answerObj = userAnswersMap.get(questionId);

      if (!answerObj || !answerObj.selectedOptions || answerObj.selectedOptions.length === 0) {
        unattempted++;
        sUnattempted++;
      } else {
        let isCorrect = false;

        // 1. Numerical Logic
        if (q.questionType === 'numerical') {
          const userAnswer = parseFloat(answerObj.selectedOptions[0]);
          if (!isNaN(userAnswer) && q.answerMin != null && q.answerMax != null) {
            isCorrect = userAnswer >= q.answerMin && userAnswer <= q.answerMax;
          }
        } 
        // 2. MCQ / Multiple Logic
        else {
          const userSelection = (answerObj.selectedOptions || []).map(String).sort();
          const correctSelection = (q.correctAnswer || []).map(String).sort();
          
          // Fast Array Comparison
          if (userSelection.length === correctSelection.length) {
              isCorrect = true;
              for (let i = 0; i < userSelection.length; i++) {
                  if (userSelection[i] !== correctSelection[i]) {
                      isCorrect = false;
                      break;
                  }
              }
          }
        }

        if (isCorrect) {
          correct++;
          sCorrect++;
          score += marks;
          sScore += marks;
        } else {
          incorrect++;
          sIncorrect++;
          score -= negative;
          sScore -= negative;
        }
      }
    });
    
    // Push stats for this section
    if (!returnAnswerMap) {
        sectionStats.push({
          title: section.title,
          total: section.questions.length,
          correct: sCorrect,
          incorrect: sIncorrect,
          unattempted: sUnattempted,
          score: parseFloat(sScore.toFixed(2)), // Clean decimal format
        });
    }
  });
  
  if (returnAnswerMap) {
    return { answerMap };
  }

  return {
    correct,
    incorrect,
    unattempted,
    score: parseFloat(score.toFixed(2)),
    total: totalMarks,
    sectionStats,
    accuracy: correct + incorrect > 0
      ? Math.round((correct / (correct + incorrect)) * 100)
      : 0
  };
};