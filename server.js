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

// Variables globales en memoria para Avisos y Libro de Firmas
let currentAnnouncement = "";
let messagesEnabled = true; // Por defecto el libro de firmas está visible
let guestMessages = [];     // Guarda las dedicatorias enviadas

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
//  APP & MIDDLEWARES
// ------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Info pública del evento
app.get("/api/event", (req, res) => {
  res.json({ name: EVENT_NAME, totalQuestions: loadQuestions().length });
});

// ------------------------------------------------------------
//  SISTEMA DE AVISOS
// ------------------------------------------------------------

// Obtener aviso actual (para invitados)
app.get('/api/announcement', (req, res) => {
  res.json({ announcement: currentAnnouncement });
});

// Guardar o borrar aviso (para admin)
app.post('/api/announcement', (req, res) => {
  const { password, message } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Contraseña incorrecta" });
  }
  currentAnnouncement = message || "";
  res.json({ success: true, announcement: currentAnnouncement });
});

// ------------------------------------------------------------
//  LIBRO DE FIRMAS / DEDICATORIAS
// ------------------------------------------------------------

// Consultar si el libro de firmas está activo para los invitados
app.get('/api/guest/messages-status', (req, res) => {
  res.json({ enabled: messagesEnabled });
});

// Activar u ocultar el libro de firmas desde el panel de admin
app.post('/api/admin/toggle-messages', (req, res) => {
  const { password, enabled } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Contraseña incorrecta" });
  }
  messagesEnabled = Boolean(enabled);
  res.json({ success: true, enabled: messagesEnabled });
});

// Enviar un mensaje / dedicatoria (invitado)
app.post('/api/guest/message', (req, res) => {
  if (!messagesEnabled) {
    return res.status(403).json({ error: "El libro de firmas está desactivado actualmente." });
  }
  const { name, message } = req.body;
  if (!name || !message || !name.trim() || !message.trim()) {
    return res.status(400).json({ error: "El nombre y el mensaje son obligatorios." });
  }

  guestMessages.push({
    id: Date.now(),
    name: name.trim(),
    message: message.trim(),
    date: new Date().toLocaleString("es-ES")
  });

  res.json({ success: true });
});

// Ver todos los mensajes desde el panel de admin
app.get('/api/admin/messages', (req, res) => {
  const password = req.header("x-admin-password");
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Contraseña incorrecta." });
  }
  res.json({ messages: guestMessages });
});

// ------------------------------------------------------------
//  RUTAS DE INVITADO (QUIZ)
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

  // Enviamos las preguntas SIN la respuesta correcta
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

// Ranking público (top 50) + posición del jugador
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
//  RUTAS DE ADMIN (JUGADORES)
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

// Permitir que un jugador vuelva a jugar
app.post("/api/admin/allow-retry/:key", requireAdmin, (req, res) => {
  const db = loadDB();
  const player = db.players[req.params.key];
  if (!player) return res.status(404).json({ error: "Jugador no encontrado." });
  player.canRetry = true;
  saveDB(db);
  res.json({ ok: true });
});

// Eliminar a un jugador
app.delete("/api/admin/players/:key", requireAdmin, (req, res) => {
  const db = loadDB();
  delete db.players[req.params.key];
  saveDB(db);
  res.json({ ok: true });
});

// ------------------------------------------------------------
//  INICIO DEL SERVIDOR
// ------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`✅ ${EVENT_NAME}`);
  console.log(`   Servidor escuchando en puerto ${PORT}`);
});
