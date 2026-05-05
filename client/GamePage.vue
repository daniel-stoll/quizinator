<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

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

const lobbyId = computed(() =>
    decodeURIComponent(window.location.pathname.split("/").filter(Boolean).at(-1) ?? ""),
);
const playerCount = ref(0);
const status = ref("Joining lobby...");
const currentQuestion = ref<PublicQuestion | null>(null);
const selectedAnswer = ref<number | null>(null);
const typedAnswer = ref("");
const submitted = ref(false);
let socket: SocketClient | null = null;

const isMultipleChoice = computed(
    () => (currentQuestion.value?.type ?? "multiple_choice") === "multiple_choice",
);
const canSubmit = computed(() => {
    if (!currentQuestion.value || submitted.value) return false;
    return isMultipleChoice.value ? selectedAnswer.value !== null : typedAnswer.value.length > 0;
});

function submitAnswer() {
    if (!currentQuestion.value || !canSubmit.value) return;

    socket?.emit("submit-answer", {
        lobbyId: lobbyId.value,
        questionIndex: currentQuestion.value.index,
        ...(isMultipleChoice.value
            ? { answerIndex: selectedAnswer.value }
            : { answerValue: typedAnswer.value }),
    });
}

onMounted(() => {
    if (!window.io) {
        status.value = "Could not load the game client.";
        return;
    }

    socket = window.io("/lobby");
    socket.on("lobby:update", (payload: LobbyUpdate) => {
        if (payload.lobbyId !== lobbyId.value) return;
        playerCount.value = payload.players;
        if (!currentQuestion.value) status.value = "Waiting for the host to start.";
    });
    socket.on("lobby:error", (payload: { message: string }) => {
        status.value = payload.message;
    });
    socket.on("quiz:question", (payload: PublicQuestion) => {
        currentQuestion.value = payload;
        selectedAnswer.value = null;
        typedAnswer.value = "";
        submitted.value = false;
        status.value = "Choose your answer.";
    });
    socket.on("answer:accepted", () => {
        submitted.value = true;
        status.value = "Answer submitted. Waiting for the next question.";
    });
    socket.on("quiz:finished", () => {
        currentQuestion.value = null;
        status.value = "Quiz finished. Thanks for playing!";
    });
    socket.on("quiz:error", (payload: { message: string }) => {
        status.value = payload.message;
    });

    socket.emit("join-lobby", { lobbyId: lobbyId.value, name: "Player" });
});

onUnmounted(() => {
    socket?.disconnect();
});
</script>

<template>
    <main class="mx-auto grid min-h-screen w-[min(720px,calc(100%-32px))] place-items-center py-8">
        <section class="card w-full text-center">
            <p class="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-blue-600">
                Quizinator
            </p>
            <h1 class="mb-3 text-5xl font-black leading-none tracking-tight text-slate-950 sm:text-7xl">
                You're in!
            </h1>
            <p class="text-slate-500">{{ status }}</p>

            <div v-if="currentQuestion" class="mt-8 text-left">
                <p class="mb-2 text-sm font-bold uppercase tracking-[0.12em] text-blue-600">
                    Question {{ currentQuestion.index + 1 }} / {{ currentQuestion.total }}
                </p>
                <h2 class="mb-5 text-3xl font-black text-slate-950">
                    {{ currentQuestion.question }}
                </h2>

                <div v-if="isMultipleChoice" class="grid gap-3">
                    <label
                        v-for="(answer, index) in currentQuestion.answers"
                        :key="`${answer.text}-${index}`"
                        class="grid cursor-pointer grid-cols-[auto_1fr] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 font-bold"
                        :class="selectedAnswer === index ? 'border-blue-600 ring-4 ring-blue-100' : ''"
                    >
                        <input
                            v-model="selectedAnswer"
                            class="h-5 w-5 accent-blue-600"
                            type="radio"
                            name="answer"
                            :value="index"
                            :disabled="submitted"
                        />
                        <span>{{ answer.text }}</span>
                    </label>
                </div>

                <label v-else class="grid gap-2 font-bold">
                    <span>{{ currentQuestion.type === "closest_guess" ? "Your guess" : "Your answer" }}</span>
                    <input
                        v-model="typedAnswer"
                        class="field-control font-normal"
                        :type="currentQuestion.type === 'closest_guess' ? 'number' : 'text'"
                        :step="currentQuestion.type === 'closest_guess' ? 'any' : undefined"
                        :placeholder="currentQuestion.type === 'closest_guess' ? 'Enter a number' : 'Type your answer'"
                        :disabled="submitted"
                        @keydown.enter.prevent="submitAnswer"
                    />
                </label>

                <button
                    type="button"
                    class="button button-primary mt-6 w-full"
                    :disabled="!canSubmit"
                    @click="submitAnswer"
                >
                    {{ submitted ? "Submitted" : "Submit answer" }}
                </button>
            </div>

            <p v-else class="mt-6 rounded-3xl bg-blue-50 p-6 text-lg font-bold text-blue-700">
                Quiz {{ lobbyId }} · {{ playerCount }} player{{ playerCount === 1 ? "" : "s" }} joined
            </p>
        </section>
    </main>
</template>
