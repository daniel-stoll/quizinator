import { promises as fs } from "fs";
import path from "path";
import { Router } from "express";
import { Namespace, Server, Socket } from "socket.io";

interface LobbyUser {
  id: string;
  name: string;
}

interface Answer {
  text: string;
  correct?: boolean;
}

interface Question {
  question: string;
  answers?: Answer[];
}

interface Quiz {
  id: string;
  questions: Question[];
}

interface PublicQuestion {
  index: number;
  total: number;
  question: string;
  answers: { text: string }[];
}

interface Lobby {
  id: string;
  quizId: string;
  users: LobbyUser[];
  status: "waiting" | "started" | "finished";
  currentQuestionIndex: number;
  answerCounts: Record<number, Record<number, number>>;
  answeredByQuestion: Record<number, Set<string>>;
}

const DATA_DIR = path.join(process.cwd(), "data");
const lobbies = new Map<string, Lobby>();

const router = Router();

router.post("/", (req, res: any) => {
  const { quizId } = req.body as { quizId?: string };
  if (!quizId) {
    return res.status(400).json({ error: "quizId is required" });
  }

  lobbies.set(quizId, {
    id: quizId,
    quizId,
    users: [],
    status: "waiting",
    currentQuestionIndex: -1,
    answerCounts: {},
    answeredByQuestion: {},
  });
  res.status(201).json({ id: quizId });
});

router.get("/:id", (req, res: any) => {
  const lobby = lobbies.get(req.params.id);
  if (!lobby) {
    return res.status(404).json({ error: "Lobby not found" });
  }
  res.json({
    id: lobby.id,
    quizId: lobby.quizId,
    users: lobby.users,
    status: lobby.status,
    currentQuestionIndex: lobby.currentQuestionIndex,
  });
});

function registerLobbySocket(io: Server) {
  const lobbyIo = io.of("/lobby");

  lobbyIo.on("connection", (socket: Socket) => {
    socket.on("watch-lobby", ({ lobbyId }: { lobbyId: string }) => {
      const lobby = lobbies.get(lobbyId);
      if (!lobby) {
        socket.emit("lobby:error", { message: "Lobby not found" });
        return;
      }

      socket.join(lobbyId);
      emitLobbyUpdate(lobbyIo, lobbyId);
      if (lobby.status === "started") {
        void emitCurrentQuestion(lobbyIo, lobbyId, socket);
      }
    });

    socket.on("join-lobby", ({ lobbyId, name }: { lobbyId: string; name?: string }) => {
      const lobby = lobbies.get(lobbyId);
      if (!lobby) {
        socket.emit("lobby:error", { message: "Lobby not found" });
        return;
      }

      const user: LobbyUser = { id: socket.id, name: name || "Player" };
      lobby.users = lobby.users.filter((u) => u.id !== socket.id);
      lobby.users.push(user);

      socket.join(lobbyId);
      lobbyIo.to(lobbyId).emit("user-joined", { user, users: lobby.users });
      emitLobbyUpdate(lobbyIo, lobbyId);
      if (lobby.status === "started") {
        void emitCurrentQuestion(lobbyIo, lobbyId, socket);
      }
      console.log(`[Lobby] ${user.name} (${socket.id}) joined lobby ${lobbyId}`);
    });

    socket.on("start-quiz", async ({ lobbyId }: { lobbyId: string }) => {
      const lobby = lobbies.get(lobbyId);
      if (!lobby) {
        socket.emit("lobby:error", { message: "Lobby not found" });
        return;
      }

      lobby.status = "started";
      lobby.currentQuestionIndex = 0;
      lobby.answerCounts = {};
      lobby.answeredByQuestion = {};
      lobbyIo.to(lobbyId).emit("quiz:started");
      await emitCurrentQuestion(lobbyIo, lobbyId);
    });

    socket.on("next-question", async ({ lobbyId }: { lobbyId: string }) => {
      const lobby = lobbies.get(lobbyId);
      if (!lobby) {
        socket.emit("lobby:error", { message: "Lobby not found" });
        return;
      }

      const quiz = await loadQuiz(lobby.quizId);
      if (lobby.currentQuestionIndex + 1 >= quiz.questions.length) {
        lobby.status = "finished";
        lobbyIo.to(lobbyId).emit("quiz:finished");
        return;
      }

      lobby.currentQuestionIndex += 1;
      await emitCurrentQuestion(lobbyIo, lobbyId);
    });

    socket.on(
      "submit-answer",
      ({ lobbyId, questionIndex, answerIndex }: { lobbyId: string; questionIndex: number; answerIndex: number }) => {
        const lobby = lobbies.get(lobbyId);
        if (!lobby || lobby.status !== "started") return;
        if (questionIndex !== lobby.currentQuestionIndex) return;

        const answered = lobby.answeredByQuestion[questionIndex] ?? new Set<string>();
        if (answered.has(socket.id)) return;
        answered.add(socket.id);
        lobby.answeredByQuestion[questionIndex] = answered;

        const counts = lobby.answerCounts[questionIndex] ?? {};
        counts[answerIndex] = (counts[answerIndex] ?? 0) + 1;
        lobby.answerCounts[questionIndex] = counts;

        socket.emit("answer:accepted", { questionIndex, answerIndex });
        emitResults(lobbyIo, lobbyId);
      },
    );

    socket.on("leave-lobby", ({ lobbyId }: { lobbyId: string }) => {
      removeUserFromLobby(lobbyIo, socket, lobbyId);
    });

    socket.on("disconnecting", () => {
      for (const room of socket.rooms) {
        if (lobbies.has(room)) {
          removeUserFromLobby(lobbyIo, socket, room);
        }
      }
    });
  });
}

async function loadQuiz(quizId: string): Promise<Quiz> {
  const raw = await fs.readFile(path.join(DATA_DIR, `${quizId}.json`), "utf-8");
  return JSON.parse(raw) as Quiz;
}

function toPublicQuestion(quiz: Quiz, index: number): PublicQuestion {
  const question = quiz.questions[index];
  return {
    index,
    total: quiz.questions.length,
    question: question.question,
    answers: (question.answers ?? []).map((answer) => ({ text: answer.text })),
  };
}

async function emitCurrentQuestion(io: Namespace, lobbyId: string, socket?: Socket) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;

  try {
    const quiz = await loadQuiz(lobby.quizId);
    const question = toPublicQuestion(quiz, lobby.currentQuestionIndex);
    (socket ?? io.to(lobbyId)).emit("quiz:question", question);
    emitResults(io, lobbyId);
  } catch {
    (socket ?? io.to(lobbyId)).emit("quiz:error", { message: "Could not load quiz." });
  }
}

function emitResults(io: Namespace, lobbyId: string) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;

  const questionIndex = lobby.currentQuestionIndex;
  io.to(lobbyId).emit("quiz:results", {
    questionIndex,
    answers: lobby.answerCounts[questionIndex] ?? {},
    answered: lobby.answeredByQuestion[questionIndex]?.size ?? 0,
    players: lobby.users.length,
  });
}

function emitLobbyUpdate(io: Namespace, lobbyId: string) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;

  io.to(lobbyId).emit("lobby:update", {
    lobbyId,
    quizId: lobby.quizId,
    players: lobby.users.length,
    users: lobby.users,
    status: lobby.status,
  });
}

function removeUserFromLobby(io: Namespace, socket: Socket, lobbyId: string) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;

  lobby.users = lobby.users.filter((u) => u.id !== socket.id);
  socket.leave(lobbyId);
  io.to(lobbyId).emit("user-left", { userId: socket.id, users: lobby.users });
  emitLobbyUpdate(io, lobbyId);
  emitResults(io, lobbyId);
  console.log(`[Lobby] ${socket.id} left lobby ${lobbyId}`);
}

export { router as lobbyRouter, registerLobbySocket };
