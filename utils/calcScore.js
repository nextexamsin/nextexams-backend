// calcScore.js
const getMarksForQuestion = (question, section, test) => {
  const type = question.questionType; // 'mcq', 'multiple', or 'numerical'

  // Priority 1: Section-level Complex Scheme
  if (section.markingScheme && section.markingScheme[type]) {
    return {
      marks: section.markingScheme[type].marks,
      negative: section.markingScheme[type].negative,
    };
  }

  // Priority 2: Section-level Simple Scheme
  if (section.marksPerQuestion != null) {
    return {
      marks: section.marksPerQuestion,
      negative: section.negativeMarking,
    };
  }

  // Priority 3: Test-level Complex Scheme
  if (test.markingScheme && test.markingScheme[type]) {
    return {
      marks: test.markingScheme[type].marks,
      negative: test.markingScheme[type].negative,
    };
  }

  // Priority 4: Test-level Simple Scheme
  if (test.marksPerQuestion != null) {
    return {
      marks: test.marksPerQuestion,
      negative: test.negativeMarking,
    };
  }

  // Fallback to question's own marks
  return {
    marks: question.marks || 1,
    negative: question.negativeMarks || 0,
  };
};


// MODIFIED: The function now accepts an optional 'returnAnswerMap' argument
module.exports = function calcScore(answers = [], test = {}, returnAnswerMap = false) {
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
        return; // Skip the rest of the loop for this question
      }

      const answerObj = answers.find(a => a.questionId?.toString() === questionId);

      if (!answerObj || !answerObj.selectedOptions || answerObj.selectedOptions.length === 0) {
        unattempted++;
        sUnattempted++;
      } else {
        let isCorrect = false;
        if (q.questionType === 'numerical') {
          const userAnswer = parseFloat(answerObj.selectedOptions[0]);
          if (!isNaN(userAnswer) && q.answerMin != null && q.answerMax != null) {
            isCorrect = userAnswer >= q.answerMin && userAnswer <= q.answerMax;
          }
        } else {
          const userSelection = (answerObj.selectedOptions || []).map(String).sort();
          const correctSelection = (q.correctAnswer || []).map(String).sort();
          isCorrect = userSelection.length === correctSelection.length && userSelection.every((val, i) => val === correctSelection[i]);
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
    
    // If we were only building the map, we don't need to push section stats
    if (!returnAnswerMap) {
        sectionStats.push({
          title: section.title,
          total: section.questions.length,
          correct: sCorrect,
          incorrect: sIncorrect,
          unattempted: sUnattempted,
          score: sScore,
        });
    }
  });
  
  // If the function was called just for the answer map, return it.
  if (returnAnswerMap) {
    return { answerMap };
  }

  return {
    correct,
    incorrect,
    unattempted,
    score,
    total: totalMarks,
    sectionStats,
    accuracy: correct + incorrect > 0
      ? Math.round((correct / (correct + incorrect)) * 100)
      : 0
  };
};
