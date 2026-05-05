import { Router } from "express";
import { randomUUID } from "crypto";
import { Server, Socket } from "socket.io";

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
  io.on("connection", (socket: Socket) => {
    // join-lobby: { lobbyId, name }
    socket.on("join-lobby", ({ lobbyId, name }: { lobbyId: string; name: string }) => {
      const lobby = lobbies.get(lobbyId);
      if (!lobby) {
        socket.emit("error", { message: "Lobby not found" });
        return;
      }

      const user: LobbyUser = { id: socket.id, name };
      lobby.users.push(user);

      socket.join(lobbyId);
      io.to(lobbyId).emit("user-joined", { user, users: lobby.users });
      console.log(`[Lobby] ${name} (${socket.id}) joined lobby ${lobbyId}`);
    });

    // leave-lobby: { lobbyId }
    socket.on("leave-lobby", ({ lobbyId }: { lobbyId: string }) => {
      removUserFromLobby(io, socket, lobbyId);
    });

    socket.on("disconnecting", () => {
      for (const room of socket.rooms) {
        if (lobbies.has(room)) {
          removUserFromLobby(io, socket, room);
        }
      }
    });
  });
}

function removUserFromLobby(io: Server, socket: Socket, lobbyId: string) {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;

  lobby.users = lobby.users.filter((u) => u.id !== socket.id);
  socket.leave(lobbyId);
  io.to(lobbyId).emit("user-left", { userId: socket.id, users: lobby.users });
  console.log(`[Lobby] ${socket.id} left lobby ${lobbyId}`);
}

export { router as lobbyRouter, registerLobbySocket };
