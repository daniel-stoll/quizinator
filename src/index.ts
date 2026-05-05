import express from "express";
import { createServer } from "http";
import path from "path";
import { Server, Socket } from "socket.io";

const app = express();
const httpServer = createServer(app);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
  },
});

const PORT = process.env.PORT ?? 3000;
const publicDir = path.join(process.cwd(), "dist", "public");

app.use(express.json());
app.use(express.static(publicDir));

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/editor", (_req, res) => {
  res.sendFile(path.join(publicDir, "editor.html"));
});

io.on("connection", (socket: Socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});

export { app, io };
