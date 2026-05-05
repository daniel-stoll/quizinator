import { Router } from "express";

interface AnswerSubmission {
  questionIndex: number;
  answerIndex: number;
}

interface AnswerTally {
  answerIndex: number;
  count: number;
}

interface QuestionResult {
  questionIndex: number;
  answers: AnswerTally[];
}

// In-memory store: quizId -> questionIndex -> answerIndex -> count
const store = new Map<string, Map<number, Map<number, number>>>();

const router = Router();

// POST /game/:quizId/answer — submit an answer for a question
router.post("/:quizId/answer", (req, res) => {
  const { quizId } = req.params;
  const { questionIndex, answerIndex } = req.body as AnswerSubmission;

  if (questionIndex === undefined || answerIndex === undefined) {
    res.status(400).json({ error: "questionIndex and answerIndex are required" });
    return;
  }

  if (!store.has(quizId)) {
    store.set(quizId, new Map());
  }
  const quiz = store.get(quizId)!;

  if (!quiz.has(questionIndex)) {
    quiz.set(questionIndex, new Map());
  }
  const question = quiz.get(questionIndex)!;

  question.set(answerIndex, (question.get(answerIndex) ?? 0) + 1);

  res.status(201).json({ message: "Answer recorded" });
});

// GET /game/:quizId/results — get answer tallies for all questions in a quiz
router.get("/:quizId/results", (req, res) => {
  const { quizId } = req.params;

  if (!store.has(quizId)) {
    res.status(404).json({ error: "No answers found for this quiz" });
    return;
  }

  const quiz = store.get(quizId)!;
  const results: QuestionResult[] = [];

  for (const [questionIndex, answers] of quiz.entries()) {
    const tally: AnswerTally[] = [];
    for (const [answerIndex, count] of answers.entries()) {
      tally.push({ answerIndex, count });
    }
    results.push({ questionIndex, answers: tally });
  }

  results.sort((a, b) => a.questionIndex - b.questionIndex);

  res.json(results);
});

export { router as gameRouter };
