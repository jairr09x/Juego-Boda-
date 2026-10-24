// ============================================================
//  Lógica del frontend — invitado.html y admin.html
// ============================================================

// Variable global para guardar la contraseña en el admin
let adminPassword = null;

function fmtTime(ms) {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m} min ${s}s` : `${s}s`;
}

function el(id) { return document.getElementById(id); }
function show(id) { if (el(id)) el(id).style.display = ""; }
function hide(id) { if (el(id)) el(id).style.display = "none"; }

// ------------------------------------------------------------
//  SISTEMA DE AVISOS (Funciona en todas las pantallas)
// ------------------------------------------------------------
async function saveAnnouncement() {
  const textInput = el('announcementText');
  const statusMsg = el('announcementStatus');
  if (!textInput) return;

  const message = textInput.value;
  try {
    const res = await fetch('/api/announcement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword, message })
    });

    if (res.ok) {
      if (statusMsg) statusMsg.innerText = message ? "¡Aviso publicado correctamente!" : "Aviso eliminado.";
      checkAnnouncements();
    } else {
      if (statusMsg) statusMsg.innerText = "Error: contraseña no válida o error de servidor.";
    }
  } catch (err) {
    if (statusMsg) statusMsg.innerText = "Error de conexión al guardar aviso.";
  }
}

async function clearAnnouncement() {
  if (el('announcementText')) el('announcementText').value = "";
  saveAnnouncement();
}

async function checkAnnouncements() {
  try {
    const res = await fetch('/api/announcement');
    const data = await res.json();
    const banner = el('announcementBanner');
    
    if (banner) {
      if (data.announcement && data.announcement.trim() !== "") {
        banner.innerHTML = `<span>📢 <strong>AVISO:</strong> ${data.announcement}</span>`;
        banner.style.display = 'block';
      } else {
        banner.style.display = 'none';
      }
    }
  } catch (err) {
    console.error("Error comprobando avisos:", err);
  }
}

// Comprobar avisos periódicamente
setInterval(checkAnnouncements, 5000);
document.addEventListener("DOMContentLoaded", checkAnnouncements);

// ------------------------------------------------------------
//  INVITADO (invitado.html)
// ------------------------------------------------------------
if (el("step-name")) {
  let questions = [];
  let currentIndex = 0;
  let selectedAnswers = [];
  let playerId = null;

  el("start-btn").addEventListener("click", startQuiz);
  el("name-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") startQuiz();
  });

  async function startQuiz() {
    const name = el("name-input").value;
    el("name-msg").style.display = "none";

    if (!name.trim()) {
      el("name-msg").textContent = "Escribe tu nombre para continuar.";
      el("name-msg").style.display = "block";
      return;
    }

    el("start-btn").disabled = true;
    try {
      const res = await fetch("/api/guest/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();

      if (data.blocked) {
        el("name-msg").innerHTML =
          `Ya has jugado, ${data.previous.name}. Tu resultado fue ` +
          `<strong>${data.previous.score}/${data.previous.total}</strong> aciertos ` +
          `en ${fmtTime(data.previous.timeMs)}.<br>Pídele a un organizador que te habilite otro intento.`;
        el("name-msg").style.display = "block";
        el("start-btn").disabled = false;
        return;
      }

      playerId = data.playerId;
      questions = data.questions;
      currentIndex = 0;
      selectedAnswers = new Array(questions.length).fill(null);

      hide("step-name");
      show("step-quiz");
      renderQuestion();
    } catch (err) {
      el("name-msg").textContent = "No se pudo conectar. Inténtalo de nuevo.";
      el("name-msg").style.display = "block";
      el("start-btn").disabled = false;
    }
  }

  function renderQuestion() {
    const q = questions[currentIndex];
    el("q-count").textContent = `Pregunta ${currentIndex + 1} de ${questions.length}`;
    el("q-text").textContent = q.pregunta;
    el("progress-fill").style.width = `${(currentIndex / questions.length) * 100}%`;

    const optionsDiv = el("options");
    optionsDiv.innerHTML = "";
    q.opciones.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "option";
      btn.textContent = opt;
      if (selectedAnswers[currentIndex] === i) btn.classList.add("selected");
      btn.addEventListener("click", () => {
        selectedAnswers[currentIndex] = i;
        [...optionsDiv.children].forEach((c) => c.classList.remove("selected"));
        btn.classList.add("selected");
        el("next-btn").disabled = false;
      });
      optionsDiv.appendChild(btn);
    });

    el("next-btn").disabled = selectedAnswers[currentIndex] === null;
    el("next-btn").textContent =
      currentIndex === questions.length - 1 ? "Enviar respuestas" : "Siguiente";
  }

  el("next-btn").addEventListener("click", () => {
    if (currentIndex < questions.length - 1) {
      currentIndex++;
      renderQuestion();
    } else {
      submitQuiz();
    }
  });

  async function submitQuiz() {
    el("next-btn").disabled = true;
    el("next-btn").textContent = "Enviando…";
    try {
      const res = await fetch("/api/guest/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, answers: selectedAnswers }),
      });
      const data = await res.json();

      hide("step-quiz");
      show("step-result");
      el("result-score").textContent = `${data.score} / ${data.total}`;
      el("result-time").textContent = `Tiempo: ${fmtTime(data.timeMs)}`;
    } catch (err) {
      el("next-btn").disabled = false;
      el("next-btn").textContent = "Reintentar envío";
    }
  }

  el("view-ranking-btn").addEventListener("click", async () => {
    hide("step-result");
    show("step-ranking");
    const res = await fetch(`/api/guest/leaderboard?playerId=${encodeURIComponent(playerId)}`);
    const data = await res.json();
    const tbody = el("ranking-body");
    tbody.innerHTML = "";
    data.ranking.forEach((p) => {
      const tr = document.createElement("tr");
      if (p.key === playerId) tr.className = "me";
      tr.innerHTML = `
        <td><span class="position-badge">${p.position}</span></td>
        <td>${p.name}</td>
        <td>${p.score}/${p.total}</td>
        <td>${fmtTime(p.timeMs)}</td>`;
      tbody.appendChild(tr);
    });
  });
}

// ------------------------------------------------------------
//  ADMIN (admin.html)
// ------------------------------------------------------------
if (el("step-login")) {
  el("login-btn").addEventListener("click", login);
  el("admin-password").addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });

  async function login() {
    const password = el("admin-password").value;
    el("login-msg").style.display = "none";

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error();

      adminPassword = password; // Guardado en variable global
      hide("step-login");
      show("step-panel");
      loadPlayers();
    } catch {
      el("login-msg").textContent = "Contraseña incorrecta.";
      el("login-msg").style.display = "block";
    }
  }

  el("refresh-btn").addEventListener("click", loadPlayers);

  async function loadPlayers() {
    const res = await fetch("/api/admin/players", {
      headers: { "x-admin-password": adminPassword },
    });
    const data = await res.json();

    const completedCount = data.players.filter((p) => p.completed).length;
    el("panel-subtitle").textContent =
      `${data.players.length} jugadores · ${completedCount} han completado el quiz`;

    const list = el("players-list");
    list.innerHTML = "";

    if (data.players.length === 0) {
      list.innerHTML = `<p style="color:#9a978d">Todavía no ha jugado nadie.</p>`;
      return;
    }

    data.players.forEach((p) => {
      const row = document.createElement("div");
      row.className = "player-row";

      const statusTag = p.completed
        ? `<span class="tag">${p.score}/${p.total} · ${fmtTime(p.timeMs)}</span>`
        : `<span class="tag pending">En curso</span>`;

      const retryTag = p.canRetry ? `<span class="tag">Repetición permitida</span>` : "";

      row.innerHTML = `
        <div class="top">
          <div>
            <div class="name">${p.displayName}</div>
            <div class="meta">Intentos: ${p.attempts}</div>
          </div>
          <div>${statusTag} ${retryTag}</div>
        </div>
        <div style="margin-top:8px; display:flex; gap:14px;">
          ${p.completed ? `<button class="link-btn toggle-details">Ver respuestas</button>` : ""}
          <button class="link-btn allow-retry">Permitir repetir</button>
          <button class="link-btn delete-player" style="color:#a4392c">Eliminar</button>
        </div>
        <div class="details" id="details-${p.key}"></div>
      `;

      if (p.completed) {
        row.querySelector(".toggle-details").addEventListener("click", () => {
          const box = row.querySelector(`#details-${CSS.escape(p.key)}`);
          if (!box.classList.contains("open")) {
            box.innerHTML = p.answers
              .map(
                (a) => `
              <div class="qa">
                <div>${a.pregunta}</div>
                <div class="${a.acierto ? "a-correct" : "a-wrong"}">
                  Respondió: ${a.seleccionada !== null ? a.opciones[a.seleccionada] : "(sin responder)"}
                  ${a.acierto ? "✓" : `✗ (correcta: ${a.opciones[a.correcta]})`}
                </div>
              </div>`
              )
              .join("");
          }
          box.classList.toggle("open");
        });
      }

      row.querySelector(".allow-retry").addEventListener("click", async () => {
        await fetch(`/api/admin/allow-retry/${encodeURIComponent(p.key)}`, {
          method: "POST",
          headers: { "x-admin-password": adminPassword },
        });
        loadPlayers();
      });

      row.querySelector(".delete-player").addEventListener("click", async () => {
        if (!confirm(`¿Eliminar a ${p.displayName} de la lista?`)) return;
        await fetch(`/api/admin/players/${encodeURIComponent(p.key)}`, {
          method: "DELETE",
          headers: { "x-admin-password": adminPassword },
        });
        loadPlayers();
      });

      list.appendChild(row);
    });
  }
}
