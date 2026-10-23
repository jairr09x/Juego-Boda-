// ============================================================
//  ¿Cuánto sabes de Macarena y Fran? — Servidor del quiz
// ============================================================
const express = require("express");
const fs = require("fs");
const path = require("path");

// ------------------------------------------------------------
//  CONFIGURACIÓN — cambia esto antes de desplegar
// ------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "bodaFM"; // <-- CAMBIA ESTA CONTRASEÑA
const EVENT_NAME = "¿Cuánto sabes de Macarena y Fran?";

const QUESTIONS_PATH = path.join(__dirname, "questions.json");
const DB_PATH = path.join(__dirname, "db.json");

// ------------------------------------------------------------
//  PERSISTENCIA SENCILLA EN JSON
// ------------------------------------------------------------
function loadQuestions() {
  return JSON.parse(fs.readFileSync(QUESTIONS_PATH, "utf-8"));
}

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ players: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// ------------------------------------------------------------
//  APP
// ------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Info pública del evento (para el título de la pantalla de inicio)
app.get("/api/event", (req, res) => {
  res.json({ name: EVENT_NAME, totalQuestions: loadQuestions().length });
});

// ------------------------------------------------------------
//  RUTAS DE INVITADO
// ------------------------------------------------------------

// Empezar (o reintentar) el quiz
app.post("/api/guest/start", (req, res) => {
  const rawName = (req.body.name || "").toString();
  if (!rawName.trim()) {
    return res.status(400).json({ error: "Escribe tu nombre para jugar." });
  }

  const key = normalizeName(rawName);
  const db = loadDB();
  const existing = db.players[key];

  if (existing && existing.completed && !existing.canRetry) {
    return res.json({
      blocked: true,
      previous: {
        name: existing.displayName,
        score: existing.score,
        total: existing.total,
        timeMs: existing.timeMs,
      },
    });
  }

  const questions = loadQuestions();

  db.players[key] = {
    displayName: rawName.trim(),
    completed: false,
    canRetry: false,
    score: existing ? existing.score : 0,
    total: questions.length,
    timeMs: existing ? existing.timeMs : 0,
    answers: [],
    attempts: existing ? existing.attempts + 1 : 1,
    startedAt: Date.now(),
    finishedAt: null,
  };
  saveDB(db);

  // Enviamos las preguntas SIN el índice de la respuesta correcta
  const publicQuestions = questions.map((q, i) => ({
    index: i,
    pregunta: q.pregunta,
    opciones: q.opciones,
  }));

  res.json({ blocked: false, playerId: key, questions: publicQuestions });
});

// Enviar las respuestas al terminar
app.post("/api/guest/submit", (req, res) => {
  const { playerId, answers } = req.body;
  const db = loadDB();
  const player = db.players[playerId];

  if (!player) {
    return res.status(404).json({ error: "No se encontró tu partida. Vuelve a empezar." });
  }
  if (player.completed) {
    return res.status(400).json({ error: "Esta partida ya se envió." });
  }
  if (!Array.isArray(answers)) {
    return res.status(400).json({ error: "Respuestas no válidas." });
  }

  const questions = loadQuestions();
  let score = 0;
  const detail = questions.map((q, i) => {
    const selected = Number.isInteger(answers[i]) ? answers[i] : null;
    const correct = selected === q.correcta;
    if (correct) score++;
    return {
      pregunta: q.pregunta,
      opciones: q.opciones,
      seleccionada: selected,
      correcta: q.correcta,
      acierto: correct,
    };
  });

  const timeMs = Date.now() - player.startedAt;

  player.completed = true;
  player.canRetry = false;
  player.finishedAt = Date.now();
  player.score = score;
  player.total = questions.length;
  player.timeMs = timeMs;
  player.answers = detail;
  saveDB(db);

  res.json({ score, total: questions.length, timeMs });
});

// Ranking público (top 50) + posición del jugador que pregunta
app.get("/api/guest/leaderboard", (req, res) => {
  const db = loadDB();
  const meId = req.query.playerId || null;

  const completed = Object.entries(db.players)
    .filter(([, p]) => p.completed)
    .map(([key, p]) => ({
      key,
      name: p.displayName,
      score: p.score,
      total: p.total,
      timeMs: p.timeMs,
    }));

  completed.sort((a, b) => b.score - a.score || a.timeMs - b.timeMs);

  const ranking = completed.map((p, i) => ({ ...p, position: i + 1 }));
  const me = meId ? ranking.find((p) => p.key === meId) || null : null;

  res.json({ ranking: ranking.slice(0, 50), me });
});

// ------------------------------------------------------------
//  MIDDLEWARE DE ADMIN
// ------------------------------------------------------------
function requireAdmin(req, res, next) {
  const password = req.header("x-admin-password");
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Contraseña incorrecta." });
  }
  next();
}

// ------------------------------------------------------------
//  RUTAS DE ADMIN
// ------------------------------------------------------------

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, error: "Contraseña incorrecta." });
  }
  res.json({ ok: true });
});

// Lista completa de jugadores con sus respuestas
app.get("/api/admin/players", requireAdmin, (req, res) => {
  const db = loadDB();
  const players = Object.entries(db.players).map(([key, p]) => ({ key, ...p }));
  players.sort((a, b) => b.score - a.score || a.timeMs - b.timeMs);
  res.json({ players });
});

// Permitir que un jugador concreto vuelva a jugar
app.post("/api/admin/allow-retry/:key", requireAdmin, (req, res) => {
  const db = loadDB();
  const player = db.players[req.params.key];
  if (!player) return res.status(404).json({ error: "Jugador no encontrado." });
  player.canRetry = true;
  saveDB(db);
  res.json({ ok: true });
});

// Eliminar un jugador (por si alguien se equivocó escribiendo su nombre)
app.delete("/api/admin/players/:key", requireAdmin, (req, res) => {
  const db = loadDB();
  delete db.players[req.params.key];
  saveDB(db);
  res.json({ ok: true });
});

// ------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`✅ ${EVENT_NAME}`);
  console.log(`   Servidor escuchando en http://localhost:${PORT}`);
});