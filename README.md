# ¿Cuánto sabes de Macarena y Fran? 🎉

Quiz web para las Bodas de Plata, con acceso por QR, ranking en vivo y panel de administrador.

## 1. Probarlo en tu ordenador

Necesitas tener [Node.js](https://nodejs.org) instalado (versión 18 o superior).

\`\`\`bash
cd boda-quiz
npm install
npm start
\`\`\`

Abre `http://localhost:3000` en el navegador. Verás la pantalla de inicio con los dos botones: **Invitado** y **Acceso administrador**.

- Contraseña de admin por defecto: `boda2026` (cámbiala, ver más abajo).

## 2. Rellenar las preguntas

Abre `questions.json` y sustituye el texto entre `[ ]` por las respuestas reales. Cada pregunta tiene este formato:

\`\`\`json
{ "pregunta": "¿En qué año se casaron?", "opciones": ["2001", "1999", "2000", "2003"], "correcta": 2 }
\`\`\`

`"correcta"` es la posición (empezando en 0) de la respuesta correcta dentro de `"opciones"`.

## 3. Cambiar la contraseña de administrador

Antes de desplegarlo online, cambia la contraseña. Ábrela en `server.js`:

\`\`\`js
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "boda2026";
\`\`\`

Puedes cambiar directamente el texto `"boda2026"`, o (más seguro) definir una variable de entorno `ADMIN_PASSWORD` en el hosting, sin tocar el código.

## 4. Desplegarlo online gratis (Render)

1. Sube la carpeta `boda-quiz` a un repositorio de GitHub.
2. Entra en [render.com](https://render.com) y crea una cuenta gratuita.
3. "New" → "Web Service" → conecta tu repositorio de GitHub.
4. Configuración:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment Variable:** `ADMIN_PASSWORD` = la contraseña que quieras
5. Despliega. Render te dará una URL pública, por ejemplo:
   `https://boda-macarena-fran.onrender.com`

   ⚠️ Nota: en el plan gratuito, Render "duerme" el servicio si nadie lo usa en un rato, y tarda unos segundos en despertar la primera vez que alguien entra. Para el día de la boda, entra tú un rato antes para "despertarlo".

## 5. Generar el código QR

Una vez tengas tu URL pública, genera un QR gratis en [qr-code-generator.com](https://www.qr-code-generator.com) o [qrcode-monkey.com](https://www.qrcode-monkey.com) apuntando a esa URL. Imprímelo o ponlo en una pantalla el día del evento.

## 6. Panel de administrador — qué puedes hacer

Entra por el botón "Acceso administrador" con la contraseña:

- Ver todos los jugadores, su puntuación, tiempo y número de intentos.
- Ver el detalle de qué respondió cada uno, pregunta por pregunta.
- Pulsar **"Permitir repetir"** para que una persona concreta pueda volver a jugar (por defecto cada nombre solo puede jugar una vez).
- Eliminar un jugador de la lista (por ejemplo si alguien escribió mal su nombre).

## Estructura del proyecto

\`\`\`
boda-quiz/
├── package.json
├── server.js          → backend (rutas de invitado y admin, puntuación, persistencia)
├── questions.json      → las preguntas y respuestas (edítalo tú)
├── db.json              → se genera solo al arrancar (guarda jugadores y respuestas)
└── public/
    ├── index.html        → pantalla de inicio
    ├── invitado.html      → el quiz
    ├── admin.html          → panel de administrador
    ├── style.css            → estilos
    └── app.js                → lógica del frontend
\`\`\`

## Notas

- Cada persona juega con su **nombre** como identificador. Si dos invitados se llaman igual, pídeles que añadan la inicial de su apellido al escribirlo.
- El ranking ordena primero por aciertos y, en caso de empate, por menor tiempo.
- `db.json` es donde vive todo lo jugado. Si quieres reiniciar el marcador completamente, borra ese archivo y reinicia el servidor (se creará vacío de nuevo).