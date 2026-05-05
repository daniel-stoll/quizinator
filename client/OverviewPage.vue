<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
    API_URL,
    getQuizId,
    getQuizLabel,
    getQuizList,
    type QuizSummary,
} from "./api";

const quizzes = ref<QuizSummary[]>([]);
const storeStatus = ref("Loading quizzes...");
const loadingError = ref(false);

const quizCountLabel = computed(() => {
    if (loadingError.value) return "Error";
    return `${quizzes.value.length} quiz${quizzes.value.length === 1 ? "" : "zes"}`;
});

function editorUrl(id?: string) {
    return id ? `/editor.html?id=${encodeURIComponent(id)}` : "/editor.html";
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

onMounted(() => {
    loadAvailableQuizzes().catch(() => {
        loadingError.value = true;
        storeStatus.value = `Could not connect to ${API_URL}.`;
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

        <section class="card" aria-labelledby="overview-title">
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
                <a
                    class="button button-primary max-sm:w-full"
                    :href="editorUrl()"
                    >Create new quiz</a
                >
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
                <a
                    v-for="quiz in quizzes"
                    :key="getQuizId(quiz)"
                    :href="editorUrl(getQuizId(quiz))"
                    class="min-h-24 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left font-bold text-slate-900 transition hover:border-blue-600 hover:ring-4 hover:ring-blue-100 focus:outline-none focus:ring-4 focus:ring-blue-100"
                >
                    {{ getQuizLabel(quiz) }}
                </a>
            </div>
        </section>
    </main>
</template>
