import express from "express";
import { createServer } from "http";
import path from "path";
import { Server } from "socket.io";
import cors from "cors";
import { promises as fs } from "fs";
import { gameRouter } from "./game";
import { lobbyRouter, registerLobbySocket } from "./lobby";

interface Answer {
  text: string;
  correct: boolean;
}

interface Question {
  question: string;
  answers: Answer[];
}

interface Quiz {
  id: string;
  questions: Question[];
}

const DATA_DIR = path.join(process.cwd(), "data");

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

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());
app.use(express.static(publicDir));

app.use("/game", gameRouter);
app.use("/lobby", lobbyRouter);

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.method === "POST" && req.body) {
    console.log("Body:", JSON.stringify(req.body));
  }
  next();
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/editor", (_req, res) => {
  res.sendFile(path.join(publicDir, "editor.html"));
});

app.get("/join/:lobbyId", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// POST /store — save a JSON body to disk, using the id from the JSON
app.post(
  "/store",
  async (
    req: express.Request<{}, { id: string } | { error: string }, Quiz>,
    res,
  ) => {
    if (req.body === undefined || Object.keys(req.body).length === 0) {
      res
        .status(400)
        .json({ error: "Request body must be a non-empty JSON object" });
      return;
    }
    if (!req.body.id) {
      res.status(400).json({ error: "JSON body must contain an id field" });
      return;
    }
    const { id } = req.body;
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(
      path.join(DATA_DIR, `${id}.json`),
      JSON.stringify(req.body),
    );
    res.status(201).json({ id });
  },
);

// GET /store — list all stored JSON objects
app.get(
  "/store",
  async (_req: express.Request, res: express.Response<Quiz[]>) => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const files = await fs.readdir(DATA_DIR);
    const items = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          const raw = await fs.readFile(path.join(DATA_DIR, f), "utf-8");
          return JSON.parse(raw) as Quiz;
        }),
    );
    res.json(items);
  },
);

// GET /store/:id — read a previously stored JSON file by GUID
app.get(
  "/store/:id",
  async (
    req: express.Request<{ id: string }>,
    res: express.Response<Quiz | { error: string }>,
  ) => {
    const filePath = path.join(DATA_DIR, `${req.params.id}.json`);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      res.json(JSON.parse(raw) as Quiz);
    } catch {
      res.status(404).json({ error: "Not found" });
    }
  },
);

app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(
      `[${new Date().toISOString()}] ERROR ${req.method} ${req.path} — ${err.message}`,
    );
    res.status(500).json({ error: "Internal server error" });
  },
);

registerLobbySocket(io);

httpServer.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});

export { app, io };
