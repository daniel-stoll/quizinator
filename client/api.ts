export type Answer = {
  text: string;
  correct: boolean;
};

export type QuestionType = "multiple_choice" | "closest_guess" | "free_text";

export type Question = {
  question: string;
  type?: QuestionType;
  duration?: number;
  answers?: Answer[];
  answer?: string | number;
};

export type QuizSummary = string | number | Record<string, unknown>;
export type Quiz = {
  id: string;
  title: string;
  questions: Question[];
};

export const API_URL = "http://172.16.136.171:3000";

export function getQuizId(quiz: QuizSummary) {
  if (typeof quiz === "string" || typeof quiz === "number") return String(quiz);
  return String(quiz.id || quiz.key || quiz.name || "");
}

export function getQuizLabel(quiz: QuizSummary) {
  if (typeof quiz === "string" || typeof quiz === "number") return String(quiz);
  return String(
    quiz.title || quiz.name || quiz.id || quiz.key || "Untitled quiz",
  );
}

export function getQuizList(result: unknown): QuizSummary[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") {
    const value = result as Record<string, unknown>;
    return [value.quizzes, value.items, value.stores].find(Array.isArray) ?? [];
  }
  return [];
}

export function getQuizQuestions(result: unknown): Question[] {
  if (Array.isArray(result)) return result as Question[];
  if (result && typeof result === "object") {
    const value = result as {
      questions?: Question[];
      data?: { questions?: Question[] };
    };
    return value.questions || value.data?.questions || [];
  }
  return [];
}
