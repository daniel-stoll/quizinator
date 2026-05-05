<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

type LobbyUpdate = {
    lobbyId: string;
    quizId: string;
    players: number;
};

type SocketClient = {
    emit: (event: string, payload?: unknown) => void;
    on: (event: string, handler: (payload: LobbyUpdate) => void) => void;
    disconnect: () => void;
};

declare global {
    interface Window {
        io?: (url?: string) => SocketClient;
    }
}

const lobbyId = computed(() => decodeURIComponent(window.location.pathname.split("/").filter(Boolean).at(-1) ?? ""));
const playerCount = ref(0);
const status = ref("Joining lobby...");
let socket: SocketClient | null = null;

onMounted(() => {
    if (!window.io) {
        status.value = "Could not load the game client.";
        return;
    }

    socket = window.io("/lobby");
    socket.on("lobby:update", (payload) => {
        if (payload.lobbyId !== lobbyId.value) return;
        playerCount.value = payload.players;
        status.value = "Waiting for the host to start.";
    });
    socket.emit("join-lobby", { lobbyId: lobbyId.value, name: "Player" });
});

onUnmounted(() => {
    socket?.disconnect();
});
</script>

<template>
    <main class="mx-auto grid min-h-screen w-[min(560px,calc(100%-32px))] place-items-center py-8">
        <section class="card w-full text-center">
            <p class="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-blue-600">
                Quizinator
            </p>
            <h1 class="mb-3 text-5xl font-black leading-none tracking-tight text-slate-950 sm:text-7xl">
                You're in!
            </h1>
            <p class="text-slate-500">{{ status }}</p>
            <p class="mt-6 rounded-3xl bg-blue-50 p-6 text-lg font-bold text-blue-700">
                Lobby {{ lobbyId }} · {{ playerCount }} player{{ playerCount === 1 ? "" : "s" }} joined
            </p>
        </section>
    </main>
</template>
