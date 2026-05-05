<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import { API_URL, getQuizId, getQuizQuestions, type Question, type QuestionType, type QuizSummary } from "./api";

function createQuizId() {
  return `quiz-${crypto.randomUUID().slice(0, 8)}`;
}

const questions = ref<Question[]>([]);
const selectedQuizId = ref(new URLSearchParams(window.location.search).get("id") ?? "");
const quizId = ref(selectedQuizId.value || createQuizId());
const editorSubtitle = ref(selectedQuizId.value ? "Loading quiz..." : "New quiz");

const questionTypes: { value: QuestionType; label: string }[] = [
  { value: "multiple_choice", label: "1 out of 4" },
  { value: "closest_guess", label: "Guess (who is closer)" },
  { value: "free_text", label: "Free text" },
];

const questionText = ref("");
const questionType = ref<QuestionType>("multiple_choice");
const duration = ref(30);
const correctAnswer = ref("");
const answerInputs = ref(["", "", "", ""]);
const freeTextAnswer = ref("");
const closestGuessAnswer = ref<number | null>(null);
const questionTextarea = ref<HTMLTextAreaElement | null>(null);

function clearQuestionForm() {
  questionText.value = "";
  questionType.value = "multiple_choice";
  duration.value = 30;
  correctAnswer.value = "";
  answerInputs.value = ["", "", "", ""];
  freeTextAnswer.value = "";
  closestGuessAnswer.value = null;
}

function getQuestionTypeLabel(type?: QuestionType) {
  return questionTypes.find((questionType) => questionType.value === type)?.label ?? "1 out of 4";
}

async function addQuestion() {
  const baseQuestion = {
    question: questionText.value.trim(),
    type: questionType.value,
    duration: duration.value,
  };

  if (questionType.value === "multiple_choice") {
    const answers = answerInputs.value
      .map((text, index) => ({
        text: text.trim(),
        correct: correctAnswer.value === `answer${index + 1}`,
      }))
      .filter((answer) => answer.text.length > 0);

    questions.value.push({ ...baseQuestion, answers });
  }

  if (questionType.value === "closest_guess") {
    questions.value.push({ ...baseQuestion, answer: closestGuessAnswer.value ?? 0 });
  }

  if (questionType.value === "free_text") {
    questions.value.push({ ...baseQuestion, answer: freeTextAnswer.value.trim() });
  }

  clearQuestionForm();
  await nextTick();
  questionTextarea.value?.focus();
}

async function loadQuiz() {
  if (!selectedQuizId.value) return;

  const response = await fetch(`${API_URL}/store/${encodeURIComponent(selectedQuizId.value)}`);

  if (!response.ok) {
    editorSubtitle.value = "Could not load selected quiz.";
    return;
  }

  const result = await response.json();
  questions.value = getQuizQuestions(result);
  editorSubtitle.value = "Existing quiz";
}

async function saveQuiz() {
  if (!quizId.value.trim()) {
    quizId.value = createQuizId();
  }

  const response = await fetch(`${API_URL}/store`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: quizId.value.trim(),
      questions: questions.value,
    }),
  });

  if (!response.ok) {
    editorSubtitle.value = "Could not save quiz.";
    return;
  }

  const result = await response.json();
  selectedQuizId.value = getQuizId(result as QuizSummary) || quizId.value;
  quizId.value = selectedQuizId.value;
  editorSubtitle.value = "Saved quiz";

  if (selectedQuizId.value) {
    window.history.replaceState(null, "", `/editor.html?id=${encodeURIComponent(selectedQuizId.value)}`);
  }
}

onMounted(async () => {
  await loadQuiz().catch(() => {
    editorSubtitle.value = `Could not connect to ${API_URL}.`;
  });
  questionTextarea.value?.focus();
});
</script>

<template>
  <main class="mx-auto w-[min(920px,calc(100%-32px))] py-12 max-sm:w-[min(100%-20px,920px)] max-sm:py-7">
    <header class="mb-6 flex justify-between gap-6">
      <div>
        <p class="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-blue-600">Admin</p>
        <h1 class="mb-3 text-4xl font-black leading-none tracking-tight text-slate-950 sm:text-6xl">Quizinator</h1>
        <p class="max-w-2xl text-slate-500">Add questions, choose correct answers, and save the quiz.</p>
      </div>
    </header>

    <div class="space-y-5">
      <section class="card" aria-labelledby="editor-title">
        <div class="mb-6 flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-stretch">
          <div>
            <h2 id="editor-title" class="text-xl font-bold">Edit quiz</h2>
            <p class="mt-1 text-slate-500">{{ editorSubtitle }}</p>
          </div>
          <a class="button button-secondary max-sm:w-full" href="/">Back to quizzes</a>
        </div>

        <form class="grid gap-5" @submit.prevent="addQuestion">
          <div class="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
            <label class="grid gap-2 font-bold">
              <span>Question type</span>
              <select v-model="questionType" class="field-control font-normal">
                <option v-for="type in questionTypes" :key="type.value" :value="type.value">{{ type.label }}</option>
              </select>
            </label>

            <label class="grid gap-2 font-bold">
              <span>Duration (seconds)</span>
              <input v-model.number="duration" class="field-control font-normal" type="number" min="1" step="1" required />
            </label>
          </div>

          <label class="grid gap-2 font-bold">
            <span>Question</span>
            <textarea
              ref="questionTextarea"
              v-model="questionText"
              class="field-control font-normal"
              rows="4"
              placeholder="Example: What is the capital of France?"
              required
            />
          </label>

          <fieldset v-if="questionType === 'multiple_choice'" class="grid gap-3 border-0 p-0">
            <legend class="font-bold">Answers</legend>
            <p class="text-slate-500">Select the radio button next to the correct answer.</p>

            <label v-for="(_, index) in answerInputs" :key="index" class="grid grid-cols-[auto_1fr] items-center gap-3">
              <input
                v-model="correctAnswer"
                class="h-5 w-5 accent-blue-600"
                type="radio"
                name="correctAnswer"
                :value="`answer${index + 1}`"
                :required="index === 0"
              />
              <input
                v-model="answerInputs[index]"
                class="field-control"
                type="text"
                :placeholder="`Answer option ${index + 1}`"
                required
              />
            </label>
          </fieldset>

          <label v-if="questionType === 'closest_guess'" class="grid gap-2 font-bold">
            <span>Correct value</span>
            <input
              v-model.number="closestGuessAnswer"
              class="field-control font-normal"
              type="number"
              step="any"
              placeholder="Example: 8849"
              required
            />
            <span class="text-sm font-normal text-slate-500">Players guess a value; closest answer wins.</span>
          </label>

          <label v-if="questionType === 'free_text'" class="grid gap-2 font-bold">
            <span>Accepted answer</span>
            <input
              v-model="freeTextAnswer"
              class="field-control font-normal"
              type="text"
              placeholder="Example: Paris"
              required
            />
          </label>

          <div class="flex justify-end gap-3 max-sm:flex-col">
            <button type="button" class="button button-secondary max-sm:w-full" @click="clearQuestionForm">Clear</button>
            <button type="submit" class="button button-primary max-sm:w-full">Add question</button>
          </div>
        </form>
      </section>

      <section class="card shadow-none" aria-labelledby="questions-title">
        <div class="mb-6 flex items-center justify-between gap-4">
          <h2 id="questions-title" class="text-xl font-bold">Questions</h2>
          <span class="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-600">{{ questions.length }} added</span>
        </div>

        <p v-if="questions.length === 0" class="rounded-2xl border border-dashed border-slate-200 p-7 text-center text-slate-500">
          No questions added yet.
        </p>

        <ol class="grid gap-4 pl-6" aria-live="polite">
          <li v-for="(question, index) in questions" :key="`${question.question}-${index}`" class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div class="mb-3 flex flex-wrap gap-2">
              <span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600">{{ getQuestionTypeLabel(question.type) }}</span>
              <span class="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-600">{{ question.duration ?? 30 }} sec</span>
            </div>
            <h3 class="mb-3 font-bold">{{ question.question }}</h3>

            <ul v-if="question.answers?.length" class="grid gap-2 pl-5 text-slate-500">
              <li v-for="answer in question.answers" :key="answer.text" :class="answer.correct ? 'font-bold text-emerald-700' : ''">
                {{ answer.text }}<span v-if="answer.correct"> ✓</span>
              </li>
            </ul>

            <p v-else-if="question.answer" class="text-slate-500">
              Answer: <span class="font-bold text-emerald-700">{{ question.answer }}</span>
            </p>
          </li>
        </ol>

        <form class="mt-5 flex justify-end" @submit.prevent="saveQuiz">
          <button type="submit" class="button button-primary max-sm:w-full">Save quiz</button>
        </form>
      </section>
    </div>
  </main>
</template>
