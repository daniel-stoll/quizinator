import { existsSync } from "fs";
import { Router } from "express";
import path from "path";
import { Namespace, Server, Socket } from "socket.io";

interface AnswerTally {
  answerIndex: number;
  count: number;
}

interface QuestionResult {
  questionIndex: number;
  answers: AnswerTally[];
}

// In-memory store: lobbyId -> questionIndex -> answerIndex -> count
const store = new Map<string, Map<number, Map<number, number>>>();

const router = Router();

// GET /game/:quizId — player lobby page
router.get("/:quizId", (_req, res) => {
  const builtGamePage = path.join(process.cwd(), "dist", "public", "game.html");
  const devGamePage = path.join(process.cwd(), "game.html");
  res.sendFile(existsSync(builtGamePage) ? builtGamePage : devGamePage);
});

function getResults(lobbyId: string): QuestionResult[] {
  const lobby = store.get(lobbyId);
  if (!lobby) return [];

  return [...lobby.entries()]
    .map(([questionIndex, answers]) => ({
      questionIndex,
      answers: [...answers.entries()].map(([answerIndex, count]) => ({
        answerIndex,
        count,
      })),
    }))
    .sort((a, b) => a.questionIndex - b.questionIndex);
}

function emitResults(gameIo: Namespace, lobbyId: string) {
  gameIo.to(lobbyId).emit("game:results", {
    lobbyId,
    results: getResults(lobbyId),
  });
}

function registerGameSocket(io: Server) {
  const gameIo = io.of("/game");

  gameIo.on("connection", (socket: Socket) => {
    // watch-game: host joins room to receive live result updates
    // { lobbyId }
    socket.on("watch-game", ({ lobbyId }: { lobbyId: string }) => {
      socket.join(lobbyId);
      emitResults(gameIo, lobbyId);
      console.log(`[Game] ${socket.id} watching lobby ${lobbyId}`);
    });

    // submit-answer: player submits an answer
    // { lobbyId, questionIndex, answerIndex }
    socket.on(
      "submit-answer",
      ({
        lobbyId,
        questionIndex,
        answerIndex,
      }: {
        lobbyId: string;
        questionIndex: number;
        answerIndex: number;
      }) => {
        if (lobbyId === undefined || questionIndex === undefined || answerIndex === undefined) {
          socket.emit("game:error", {
            message: "lobbyId, questionIndex and answerIndex are required",
          });
          return;
        }

        if (!store.has(lobbyId)) store.set(lobbyId, new Map());
        const lobby = store.get(lobbyId)!;

        if (!lobby.has(questionIndex)) lobby.set(questionIndex, new Map());
        const question = lobby.get(questionIndex)!;

        question.set(answerIndex, (question.get(answerIndex) ?? 0) + 1);

        socket.emit("game:answer-recorded", { questionIndex, answerIndex });
        emitResults(gameIo, lobbyId);

        console.log(
          `[Game] lobby=${lobbyId} q=${questionIndex} a=${answerIndex} (total: ${question.get(answerIndex)})`,
        );
      },
    );
  });
}

export { router as gameRouter, registerGameSocket };

