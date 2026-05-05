<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";

type Answer = {
    text: string;
    correct: boolean;
};

type Question = {
    question: string;
    answers: Answer[];
};

type QuizSummary = string | number | Record<string, unknown>;

const API_URL = "http://172.16.136.171:3000";

const overviewVisible = ref(true);
const quizzes = ref<QuizSummary[]>([]);
const questions = ref<Question[]>([]);
const selectedQuizId = ref("");
const storeStatus = ref("Loading quizzes...");
const editorSubtitle = ref("New quiz");
const loadingError = ref(false);

const questionText = ref("");
const correctAnswer = ref("");
const answerInputs = ref(["", "", "", ""]);
const questionTextarea = ref<HTMLTextAreaElement | null>(null);

const quizCountLabel = computed(() => {
    if (loadingError.value) return "Error";
    return `${quizzes.value.length} quiz${quizzes.value.length === 1 ? "" : "zes"}`;
});

const questionCountLabel = computed(() => `${questions.value.length} added`);

function showOverview() {
    overviewVisible.value = true;
}

async function showEditor() {
    overviewVisible.value = false;
    await nextTick();
    questionTextarea.value?.focus();
}

function getQuizId(quiz: QuizSummary) {
    if (typeof quiz === "string" || typeof quiz === "number")
        return String(quiz);
    return String(quiz.id || quiz.key || quiz.name || "");
}

function getQuizLabel(quiz: QuizSummary) {
    if (typeof quiz === "string" || typeof quiz === "number")
        return String(quiz);
    return String(
        quiz.title || quiz.name || quiz.id || quiz.key || "Untitled quiz",
    );
}

function getQuizList(result: unknown): QuizSummary[] {
    if (Array.isArray(result)) return result;
    if (result && typeof result === "object") {
        const value = result as Record<string, unknown>;
        return (
            [value.quizzes, value.items, value.stores].find(Array.isArray) ?? []
        );
    }
    return [];
}

function getQuizQuestions(result: unknown): Question[] {
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

async function loadAvailableQuizzes() {
    loadingError.value = false;
    storeStatus.value = "Loading quizzes...";

    const response = await fetch(`${API_URL}/store`);

    if (!response.ok) {
        loadingError.value = true;
        storeStatus.value = "Could not load available quizzes.";
        return;
    }

    const result = await response.json();
    quizzes.value = getQuizList(result);
    storeStatus.value = "Select a quiz to edit or create a new one.";
}

async function loadQuiz(id: string) {
    if (!id) return;

    storeStatus.value = `Loading quiz ${id}...`;
    const response = await fetch(`${API_URL}/store/${encodeURIComponent(id)}`);

    if (!response.ok) {
        storeStatus.value = "Could not load selected quiz.";
        return;
    }

    const result = await response.json();
    selectedQuizId.value = id;
    questions.value = getQuizQuestions(result);
    editorSubtitle.value = `Quiz ${id}`;
    await showEditor();
}

async function startNewQuiz() {
    selectedQuizId.value = "";
    questions.value = [];
    editorSubtitle.value = "New quiz";
    clearQuestionForm();
    await showEditor();
}

function clearQuestionForm() {
    questionText.value = "";
    correctAnswer.value = "";
    answerInputs.value = ["", "", "", ""];
}

async function addQuestion() {
    const answers = answerInputs.value
        .map((text, index) => ({
            text: text.trim(),
            correct: correctAnswer.value === `answer${index + 1}`,
        }))
        .filter((answer) => answer.text.length > 0);

    questions.value.push({ question: questionText.value.trim(), answers });
    clearQuestionForm();
    await nextTick();
    questionTextarea.value?.focus();
}

async function saveQuiz() {
    const response = await fetch(`${API_URL}/store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            id: selectedQuizId.value || undefined,
            questions: questions.value,
        }),
    });

    if (!response.ok) {
        editorSubtitle.value = "Could not save quiz.";
        return;
    }

    const result = await response.json();
    selectedQuizId.value =
        getQuizId(result as QuizSummary) || selectedQuizId.value;
    editorSubtitle.value = selectedQuizId.value
        ? `Saved quiz ${selectedQuizId.value}`
        : "Saved quiz";
    await loadAvailableQuizzes();
}

onMounted(() => {
    loadAvailableQuizzes().catch(() => {
        loadingError.value = true;
        storeStatus.value = API_URL
            ? `Could not connect to ${API_URL}.`
            : "Could not connect to the API.";
    });
});
</script>

<template>
    <main
        class="mx-auto w-[min(920px,calc(100%-32px))] py-12 max-sm:w-[min(100%-20px,920px)] max-sm:py-7"
    >
        <header class="mb-6 flex justify-between gap-6">
            <div>
                <p
                    class="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-blue-600"
                >
                    Admin
                </p>
                <h1
                    class="mb-3 text-4xl font-black leading-none tracking-tight text-slate-950 sm:text-6xl"
                >
                    Quizinator
                </h1>
                <p class="max-w-2xl text-slate-500">
                    Select a quiz, create a new one, then edit and save its
                    questions.
                </p>
            </div>
        </header>

        <section
            v-if="overviewVisible"
            class="card"
            aria-labelledby="overview-title"
        >
            <div
                class="mb-6 flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-stretch"
            >
                <h2 id="overview-title" class="text-xl font-bold">
                    All quizzes
                </h2>
                <span
                    class="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-600"
                    >{{ quizCountLabel }}</span
                >
            </div>

            <p class="text-slate-500">{{ storeStatus }}</p>
            <div class="my-5 flex gap-3 max-sm:flex-col">
                <button
                    type="button"
                    class="button button-primary max-sm:w-full"
                    @click="startNewQuiz"
                >
                    Create new quiz
                </button>
                <button
                    type="button"
                    class="button button-secondary max-sm:w-full"
                    @click="loadAvailableQuizzes"
                >
                    Reload
                </button>
            </div>

            <p
                v-if="quizzes.length === 0"
                class="rounded-2xl border border-dashed border-slate-200 p-7 text-center text-slate-500"
            >
                No quizzes available yet.
            </p>

            <div
                class="mt-5 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4"
                aria-live="polite"
            >
                <button
                    v-for="quiz in quizzes"
                    :key="getQuizId(quiz)"
                    type="button"
                    class="min-h-24 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left font-bold text-slate-900 transition hover:border-blue-600 hover:ring-4 hover:ring-blue-100 focus:outline-none focus:ring-4 focus:ring-blue-100"
                    @click="loadQuiz(getQuizId(quiz))"
                >
                    {{ getQuizLabel(quiz) }}
                </button>
            </div>
        </section>

        <div v-else class="space-y-5">
            <section class="card" aria-labelledby="editor-title">
                <div
                    class="mb-6 flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-stretch"
                >
                    <div>
                        <h2 id="editor-title" class="text-xl font-bold">
                            Edit quiz
                        </h2>
                        <p class="mt-1 text-slate-500">{{ editorSubtitle }}</p>
                    </div>
                    <button
                        type="button"
                        class="button button-secondary max-sm:w-full"
                        @click="showOverview"
                    >
                        Back to quizzes
                    </button>
                </div>

                <form
                    class="grid gap-5"
                    @submit.prevent="addQuestion"
                    @reset="clearQuestionForm"
                >
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

                    <fieldset class="grid gap-3 border-0 p-0">
                        <legend class="font-bold">Answers</legend>
                        <p class="text-slate-500">
                            Select the radio button next to the correct answer.
                        </p>

                        <label
                            v-for="(_, index) in answerInputs"
                            :key="index"
                            class="grid grid-cols-[auto_1fr] items-center gap-3"
                        >
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
                                :required="index < 2"
                            />
                        </label>
                    </fieldset>

                    <div class="flex justify-end gap-3 max-sm:flex-col">
                        <button
                            type="reset"
                            class="button button-secondary max-sm:w-full"
                        >
                            Clear
                        </button>
                        <button
                            type="submit"
                            class="button button-primary max-sm:w-full"
                        >
                            Add question
                        </button>
                    </div>
                </form>
            </section>

            <section class="card shadow-none" aria-labelledby="questions-title">
                <div class="mb-6 flex items-center justify-between gap-4">
                    <h2 id="questions-title" class="text-xl font-bold">
                        Questions
                    </h2>
                    <span
                        class="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-600"
                        >{{ questionCountLabel }}</span
                    >
                </div>

                <p
                    v-if="questions.length === 0"
                    class="rounded-2xl border border-dashed border-slate-200 p-7 text-center text-slate-500"
                >
                    No questions added yet.
                </p>

                <ol class="grid gap-4 pl-6" aria-live="polite">
                    <li
                        v-for="(question, index) in questions"
                        :key="`${question.question}-${index}`"
                        class="rounded-2xl border border-slate-200 bg-slate-50 p-5"
                    >
                        <h3 class="mb-3 font-bold">{{ question.question }}</h3>
                        <ul class="grid gap-2 pl-5 text-slate-500">
                            <li
                                v-for="answer in question.answers"
                                :key="answer.text"
                                :class="
                                    answer.correct
                                        ? 'font-bold text-emerald-700'
                                        : ''
                                "
                            >
                                {{ answer.text
                                }}<span v-if="answer.correct"> ✓</span>
                            </li>
                        </ul>
                    </li>
                </ol>

                <form class="mt-5 flex justify-end" @submit.prevent="saveQuiz">
                    <button
                        type="submit"
                        class="button button-primary max-sm:w-full"
                    >
                        Save quiz
                    </button>
                </form>
            </section>
        </div>
    </main>
</template>
