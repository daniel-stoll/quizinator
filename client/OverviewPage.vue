<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
    API_URL,
    getQuizId,
    getQuizLabel,
    getQuizList,
    type QuizSummary,
} from "./api";

type LobbyUpdate = {
    lobbyId: string;
    quizId: string;
    players: number;
};

type QuestionType = "multiple_choice" | "closest_guess" | "free_text";

type PublicQuestion = {
    index: number;
    total: number;
    question: string;
    type: QuestionType;
    answers: { text: string }[];
};

type QuizResults = {
    questionIndex: number;
    answers: Record<string, number>;
    answered: number;
    players: number;
};

type SocketClient = {
    emit: (event: string, payload?: unknown) => void;
    on: (event: string, handler: (payload: any) => void) => void;
    disconnect: () => void;
};

declare global {
    interface Window {
        io?: (url?: string) => SocketClient;
    }
}

const quizzes = ref<QuizSummary[]>([]);
const storeStatus = ref("Loading quizzes...");
const loadingError = ref(false);
const activeLobbyQuiz = ref<QuizSummary | null>(null);
const activeLobbyId = ref("");
const playerCount = ref(0);
const lobbyStatus = ref("Joining lobby...");
const quizStarted = ref(false);
const currentQuestion = ref<PublicQuestion | null>(null);
const currentResults = ref<QuizResults | null>(null);
let socket: SocketClient | null = null;
let socketScriptPromise: Promise<void> | null = null;

const quizCountLabel = computed(() => {
    if (loadingError.value) return "Error";
    return `${quizzes.value.length} quiz${quizzes.value.length === 1 ? "" : "zes"}`;
});

const activeLobbyLabel = computed(() =>
    activeLobbyQuiz.value ? getQuizLabel(activeLobbyQuiz.value) : "",
);
const lobbyPath = computed(() => `/game/${encodeURIComponent(activeLobbyId.value)}`);
const lobbyUrl = computed(() => `${API_URL}${lobbyPath.value}`);
const qrCodeUrl = computed(
    () =>
        `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(lobbyUrl.value)}`,
);

function editorUrl(id?: string) {
    return id ? `/editor.html?id=${encodeURIComponent(id)}` : "/editor.html";
}

function loadSocketClient() {
    if (window.io) return Promise.resolve();
    if (socketScriptPromise) return socketScriptPromise;

    socketScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `${API_URL}/socket.io/socket.io.js`;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Could not load Socket.IO client."));
        document.head.appendChild(script);
    });

    return socketScriptPromise;
}

async function startLobby(quiz: QuizSummary) {
    activeLobbyQuiz.value = quiz;
    activeLobbyId.value = "";
    playerCount.value = 0;
    lobbyStatus.value = "Creating lobby...";
    quizStarted.value = false;
    currentQuestion.value = null;
    currentResults.value = null;
    socket?.disconnect();

    try {
        const response = await fetch(`${API_URL}/lobby`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ quizId: getQuizId(quiz) }),
        });
        if (!response.ok) throw new Error("Could not create lobby.");

        const result = (await response.json()) as { id?: string };
        if (!result.id) throw new Error("Lobby id missing.");
        activeLobbyId.value = result.id;

        await loadSocketClient();
        if (!window.io) throw new Error("Socket.IO client unavailable.");

        socket = window.io(`${API_URL}/lobby`);
        socket.on("lobby:update", (payload: LobbyUpdate) => {
            if (payload.lobbyId !== activeLobbyId.value) return;
            playerCount.value = payload.players;
            lobbyStatus.value = "Lobby ready. Share the link with players.";
        });
        socket.on("quiz:started", () => {
            quizStarted.value = true;
            lobbyStatus.value = "Quiz running.";
        });
        socket.on("quiz:question", (payload: PublicQuestion) => {
            quizStarted.value = true;
            currentQuestion.value = payload;
            currentResults.value = null;
        });
        socket.on("quiz:results", (payload: QuizResults) => {
            currentResults.value = payload;
        });
        socket.on("quiz:finished", () => {
            quizStarted.value = false;
            currentQuestion.value = null;
            lobbyStatus.value = "Quiz finished.";
        });
        socket.on("quiz:error", (payload: { message: string }) => {
            lobbyStatus.value = payload.message;
        });
        socket.emit("watch-lobby", { lobbyId: activeLobbyId.value });
    } catch {
        lobbyStatus.value = "Could not join the lobby.";
    }
}

function leaveLobby() {
    socket?.disconnect();
    socket = null;
    activeLobbyQuiz.value = null;
    activeLobbyId.value = "";
    playerCount.value = 0;
    quizStarted.value = false;
    currentQuestion.value = null;
    currentResults.value = null;
}

function startQuiz() {
    socket?.emit("start-quiz", { lobbyId: activeLobbyId.value });
}

function nextQuestion() {
    socket?.emit("next-question", { lobbyId: activeLobbyId.value });
}

const submittedAnswerEntries = computed(() =>
    Object.entries(currentResults.value?.answers ?? {}).sort(([a], [b]) => a.localeCompare(b)),
);

function answerCount(index: number) {
    return currentResults.value?.answers[String(index)] ?? 0;
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
    storeStatus.value = "Select a quiz to edit or start a game.";
}

onMounted(() => {
    loadAvailableQuizzes().catch(() => {
        loadingError.value = true;
        storeStatus.value = `Could not connect to ${API_URL}.`;
    });
});

onUnmounted(() => {
    socket?.disconnect();
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

        <section v-if="!activeLobbyQuiz" class="card" aria-labelledby="overview-title">
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
                class="mt-5 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4"
                aria-live="polite"
            >
                <article
                    v-for="quiz in quizzes"
                    :key="getQuizId(quiz)"
                    class="rounded-2xl border border-slate-200 bg-slate-50 p-5"
                >
                    <h3 class="mb-4 font-bold text-slate-900">
                        {{ getQuizLabel(quiz) }}
                    </h3>
                    <div class="flex flex-wrap gap-3">
                        <button
                            type="button"
                            class="button button-primary"
                            @click="startLobby(quiz)"
                        >
                            Start game
                        </button>
                        <a
                            class="button button-secondary"
                            :href="editorUrl(getQuizId(quiz))"
                        >
                            Edit
                        </a>
                    </div>
                </article>
            </div>
        </section>

        <section v-else class="card relative min-h-[520px]" aria-labelledby="lobby-title">
            <div class="mb-8 flex items-start justify-between gap-4 max-sm:flex-col">
                <div>
                    <p class="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-blue-600">
                        Lobby
                    </p>
                    <h2 id="lobby-title" class="text-3xl font-black text-slate-950">
                        {{ activeLobbyLabel }}
                    </h2>
                    <p class="mt-2 text-slate-500">{{ lobbyStatus }}</p>
                </div>
                <button
                    type="button"
                    class="button button-secondary max-sm:w-full"
                    @click="leaveLobby"
                >
                    Back to quizzes
                </button>
            </div>

            <div class="grid gap-6 md:grid-cols-[1fr_auto]">
                <div class="rounded-3xl bg-blue-50 p-8">
                    <p class="text-sm font-bold uppercase tracking-[0.12em] text-blue-600">
                        Players joined
                    </p>
                    <p class="mt-3 text-7xl font-black text-blue-700">
                        {{ playerCount }}
                    </p>
                </div>

                <div class="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                    <p class="mb-2 font-bold text-slate-900">Join URL</p>
                    <a class="break-all text-blue-600 underline" :href="lobbyUrl" target="_blank">
                        {{ lobbyUrl }}
                    </a>
                    <p class="mt-2 text-sm text-slate-500">Path: {{ lobbyPath }}</p>
                </div>
            </div>

            <div class="mt-6 flex gap-3 max-sm:flex-col">
                <button
                    type="button"
                    class="button button-primary max-sm:w-full"
                    :disabled="quizStarted"
                    @click="startQuiz"
                >
                    Start quiz
                </button>
                <button
                    type="button"
                    class="button button-secondary max-sm:w-full"
                    :disabled="!currentQuestion"
                    @click="nextQuestion"
                >
                    Next question
                </button>
            </div>

            <div v-if="currentQuestion" class="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p class="mb-2 text-sm font-bold uppercase tracking-[0.12em] text-blue-600">
                    Question {{ currentQuestion.index + 1 }} / {{ currentQuestion.total }}
                </p>
                <h3 class="mb-4 text-2xl font-black text-slate-950">
                    {{ currentQuestion.question }}
                </h3>
                <p class="mb-4 text-slate-500">
                    {{ currentResults?.answered ?? 0 }} / {{ playerCount }} answered
                </p>
                <ol v-if="currentQuestion.answers.length" class="grid gap-3">
                    <li
                        v-for="(answer, index) in currentQuestion.answers"
                        :key="`${answer.text}-${index}`"
                        class="rounded-2xl bg-white p-4 font-bold text-slate-900"
                    >
                        {{ answer.text }}
                        <span class="float-right text-blue-600">{{ answerCount(index) }}</span>
                    </li>
                </ol>
                <ol v-else class="grid gap-3">
                    <li
                        v-for="([answer, count]) in submittedAnswerEntries"
                        :key="answer"
                        class="rounded-2xl bg-white p-4 font-bold text-slate-900"
                    >
                        {{ answer }}
                        <span class="float-right text-blue-600">{{ count }}</span>
                    </li>
                </ol>
            </div>

            <img
                class="absolute bottom-7 right-7 h-[220px] w-[220px] rounded-2xl border border-slate-200 bg-white p-3 shadow-lg max-sm:static max-sm:mt-8"
                :src="qrCodeUrl"
                :alt="`QR code for ${lobbyUrl}`"
            />
        </section>
    </main>
</template>
