import { Router } from "express";
import { randomUUID } from "crypto";
import { Namespace, Server, Socket } from "socket.io";

interface LobbyUser {
  id: string;
  name: string;
}

interface Lobby {
  id: string;
  quizId: string;
  users: LobbyUser[];
}

// In-memory store: lobbyId -> Lobby
const lobbies = new Map<string, Lobby>();

const router = Router();

// POST /lobby — create a new lobby for a quiz
router.post("/", (req, res: any) => {
  const { quizId } = req.body as { quizId?: string };
  if (!quizId) {
    return res.status(400).json({ error: "quizId is required" });
  }
  const id = randomUUID();
  lobbies.set(id, { id, quizId, users: [] });
  res.status(201).json({ id });
});

// GET /lobby/:id — get current lobby state
router.get("/:id", (req, res: any) => {
  const lobby = lobbies.get(req.params.id);
  if (!lobby) {
    return res.status(404).json({ error: "Lobby not found" });
  }
  res.json(lobby);
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
    });

    // join-lobby: { lobbyId, name }
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
      console.log(`[Lobby] ${user.name} (${socket.id}) joined lobby ${lobbyId}`);
    });

    // leave-lobby: { lobbyId }
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

function emitLobbyUpdate(io: Namespace, lobbyId: string) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;

  io.to(lobbyId).emit("lobby:update", {
    lobbyId,
    quizId: lobby.quizId,
    players: lobby.users.length,
    users: lobby.users,
  });
}

function removeUserFromLobby(io: Namespace, socket: Socket, lobbyId: string) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;

  lobby.users = lobby.users.filter((u) => u.id !== socket.id);
  socket.leave(lobbyId);
  io.to(lobbyId).emit("user-left", { userId: socket.id, users: lobby.users });
  emitLobbyUpdate(io, lobbyId);
  console.log(`[Lobby] ${socket.id} left lobby ${lobbyId}`);
}

export { router as lobbyRouter, registerLobbySocket };
