# English Tutor SPA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page English-tutor chat app that streams short responses from a local Ollama model, with selectable model and 5 tutor styles.

**Architecture:** Vanilla ES modules, no build step. `app.js` holds state + Ollama client + rendering; `prompts.js` holds the 5 style system prompts; `index.html`/`styles.css` provide markup and theming. Browser talks to Ollama directly at `http://localhost:11434`.

**Tech Stack:** HTML5, CSS (custom properties), modern JS (ES6+ modules, fetch, ReadableStream, AbortController). No frameworks, no npm, no build.

## Global Constraints

- **Zero runtime/build dependencies.** No npm install, no bundler, no framework. Opens by loading `index.html`.
- Because the spec forbids dependencies, there is **no test framework**. Verification = pure functions kept isolated + manual browser/console checks described per task.
- Ollama base URL: `http://localhost:11434`. Endpoints: `GET /api/tags`, `POST /api/chat` with `stream: true`.
- Default model: `llama3.2:3b`. Default style: `personal`.
- Persist to `localStorage`: `et.model`, `et.style`, `et.theme`, `et.messages`.
- Sliding-window context: system prompt + last 4 turns (8 messages) + current user message.
- Theme: follow `prefers-color-scheme` by default; manual toggle overrides and persists.
- Must not block UI; all network work async; errors surface as chat error bubble + toast.

---

### Task 1: Scaffold markup, theme, and module wiring

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `app.js` (theme logic only in this task)

**Interfaces:**
- Consumes: nothing.
- Produces: DOM element IDs used by later tasks — `#messages`, `#input`, `#send`, `#stop`, `#model-select`, `#refresh-models`, `#style-select`, `#clear-chat`, `#theme-toggle`, `#toast`. Exposes `initTheme()`, `toggleTheme()` in `app.js`.

- [ ] **Step 1: Write `index.html`**

```html
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Репетитор английского</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div class="app">
    <aside class="sidebar" id="sidebar">
      <h2>Настройки</h2>

      <label class="field">
        <span>Модель</span>
        <div class="row">
          <select id="model-select"></select>
          <button id="refresh-models" title="Обновить список" type="button">⟳</button>
        </div>
      </label>

      <label class="field">
        <span>Стиль репетитора</span>
        <select id="style-select"></select>
      </label>

      <button id="clear-chat" class="secondary" type="button">Очистить чат</button>
    </aside>

    <main class="chat">
      <header class="chat-header">
        <button id="menu-toggle" class="icon" type="button" aria-label="Меню">☰</button>
        <h1>Репетитор английского</h1>
        <button id="theme-toggle" class="icon" type="button" aria-label="Тема">◐</button>
      </header>

      <div id="messages" class="messages" aria-live="polite"></div>

      <form id="composer" class="composer">
        <textarea id="input" rows="1" placeholder="Напишите фразу на английском…"></textarea>
        <button id="send" type="submit">Отправить</button>
        <button id="stop" type="button" class="danger" hidden>Стоп</button>
      </form>
    </main>
  </div>

  <div id="toast" class="toast" hidden></div>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `styles.css`**

```css
:root {
  --bg: #f7f7f8; --panel: #ffffff; --text: #1a1a1a; --muted: #666;
  --border: #e2e2e6; --user: #2563eb; --user-text: #fff;
  --assistant: #ececf1; --assistant-text: #1a1a1a; --danger: #dc2626;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1a1a1e; --panel: #26262c; --text: #ececf1; --muted: #9a9aa5;
    --border: #33333b; --user: #3b82f6; --user-text: #fff;
    --assistant: #33333b; --assistant-text: #ececf1; --danger: #f87171;
  }
}
[data-theme="light"] {
  --bg: #f7f7f8; --panel: #ffffff; --text: #1a1a1a; --muted: #666;
  --border: #e2e2e6; --user: #2563eb; --user-text: #fff;
  --assistant: #ececf1; --assistant-text: #1a1a1a; --danger: #dc2626;
}
[data-theme="dark"] {
  --bg: #1a1a1e; --panel: #26262c; --text: #ececf1; --muted: #9a9aa5;
  --border: #33333b; --user: #3b82f6; --user-text: #fff;
  --assistant: #33333b; --assistant-text: #ececf1; --danger: #f87171;
}

* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: var(--bg); color: var(--text);
}
.app { display: flex; height: 100vh; }

.sidebar {
  width: 260px; flex-shrink: 0; background: var(--panel);
  border-right: 1px solid var(--border); padding: 16px; overflow-y: auto;
}
.sidebar h2 { margin: 0 0 16px; font-size: 1rem; }
.field { display: block; margin-bottom: 16px; font-size: .85rem; color: var(--muted); }
.field span { display: block; margin-bottom: 4px; }
.field .row { display: flex; gap: 6px; }
select, textarea, button {
  font: inherit; border-radius: 8px; border: 1px solid var(--border);
  background: var(--bg); color: var(--text); padding: 8px;
}
select { width: 100%; }
button { cursor: pointer; background: var(--panel); }
button.secondary { width: 100%; color: var(--danger); }
button.danger { background: var(--danger); color: #fff; border-color: var(--danger); }
button.icon { border: none; background: none; font-size: 1.2rem; padding: 4px 8px; }

.chat { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.chat-header {
  display: flex; align-items: center; gap: 8px; padding: 10px 16px;
  border-bottom: 1px solid var(--border); background: var(--panel);
}
.chat-header h1 { font-size: 1rem; margin: 0; flex: 1; }
#menu-toggle { display: none; }

.messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.msg { max-width: 80%; padding: 10px 14px; border-radius: 14px; white-space: pre-wrap; word-wrap: break-word; line-height: 1.4; }
.msg.user { align-self: flex-end; background: var(--user); color: var(--user-text); border-bottom-right-radius: 4px; }
.msg.assistant { align-self: flex-start; background: var(--assistant); color: var(--assistant-text); border-bottom-left-radius: 4px; }
.msg.error { align-self: center; background: transparent; color: var(--danger); border: 1px solid var(--danger); font-size: .9rem; }
.msg .cursor { animation: blink 1s steps(1) infinite; }
@keyframes blink { 50% { opacity: 0; } }

.composer { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border); background: var(--panel); }
.composer textarea { flex: 1; resize: none; max-height: 160px; }

.toast {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
  background: var(--danger); color: #fff; padding: 10px 16px; border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,.2); z-index: 10;
}

@media (max-width: 640px) {
  .sidebar {
    position: fixed; z-index: 5; height: 100%; transform: translateX(-100%);
    transition: transform .2s; box-shadow: 2px 0 12px rgba(0,0,0,.2);
  }
  .sidebar.open { transform: translateX(0); }
  #menu-toggle { display: block; }
  .msg { max-width: 90%; }
}
```

- [ ] **Step 3: Write `app.js` theme skeleton**

```js
const KEYS = { model: "et.model", style: "et.style", theme: "et.theme", messages: "et.messages" };

function initTheme() {
  const saved = localStorage.getItem(KEYS.theme);
  if (saved) document.documentElement.setAttribute("data-theme", saved);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  const sysDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const now = cur || (sysDark ? "dark" : "light");
  const next = now === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(KEYS.theme, next);
}

const $ = (id) => document.getElementById(id);

initTheme();
$("theme-toggle").addEventListener("click", toggleTheme);
$("menu-toggle").addEventListener("click", () => $("sidebar").classList.toggle("open"));
```

- [ ] **Step 4: Verify in browser**

Open `index.html` in a browser. Expected: layout renders (sidebar + chat). Click theme toggle → colors flip light/dark and persist across reload. Resize to <640px → hamburger appears and toggles sidebar.

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css app.js
git commit -m "feat: scaffold markup, theming, and module wiring"
```

---

### Task 2: Tutor style prompts

**Files:**
- Create: `prompts.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `export const STYLES` — object keyed by style id, each `{ label: string, system: string }`. Keys: `natural`, `correct`, `explain`, `tip`, `personal`. `export const DEFAULT_STYLE = "personal"`.

- [ ] **Step 1: Write `prompts.js`**

```js
export const STYLES = {
  natural: {
    label: "Естественный диалог",
    system:
      "You are a friendly English conversation partner. If the user's sentence is grammatically correct but sounds unnatural or stiff, offer a more natural, conversational alternative. If it is already correct and natural, briefly confirm it sounds good. Do NOT correct grammar when there is no error. Reply in 1-2 short sentences."
  },
  correct: {
    label: "Исправление предложения",
    system:
      "You are a strict English corrector. Reply ONLY with the corrected version of the user's sentence. Do not add any explanations, comments, greetings, or extra words. If the sentence is already correct, repeat it unchanged."
  },
  explain: {
    label: "Объяснение ошибки",
    system:
      "You are a concise English teacher. Briefly explain what was grammatically wrong in the user's sentence and why. You may name the rule, but do not lecture. Then give the corrected sentence on a new line. Maximum 3 short sentences."
  },
  tip: {
    label: "Краткий совет",
    system:
      "You are a concise English tutor. Give only a short, memorable tip or rule that helps the user avoid their mistake. Do not provide the full correction unless it is needed for the tip. Maximum 2 sentences."
  },
  personal: {
    label: "Личный репетитор",
    system:
      "You are a personal English tutor. Silently decide which approach fits best: natural rephrasing, correction, error explanation, or a memorable tip. Then reply combining only what is useful (correction + short explanation + tip + natural alternative as needed). Always stay concise: max 3-4 short sentences. Never reveal which approach you chose."
  }
};

export const DEFAULT_STYLE = "personal";
```

- [ ] **Step 2: Verify keys**

In browser console on the page: `import('./prompts.js').then(m => console.log(Object.keys(m.STYLES), m.DEFAULT_STYLE))`.
Expected: `["natural","correct","explain","tip","personal"] "personal"`.

- [ ] **Step 3: Commit**

```bash
git add prompts.js
git commit -m "feat: add 5 tutor-style system prompts"
```

---

### Task 3: State, persistence, and message-building pure function

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `STYLES`, `DEFAULT_STYLE` from `prompts.js`; `KEYS` from Task 1.
- Produces: module `state = { model, style, theme, messages }`; `loadState()`, `saveState()`; pure `buildMessages(style, history, input)` returning `[{role:"system",...}, ...last8, {role:"user",content:input}]`; constant `OLLAMA_BASE`.

- [ ] **Step 1: Add imports and state to top of `app.js`**

Insert at the very top of `app.js`, above the existing `KEYS` line:

```js
import { STYLES, DEFAULT_STYLE } from "./prompts.js";

const OLLAMA_BASE = "http://localhost:11434";
const TURN_WINDOW = 4; // number of user+assistant pairs to send as context
```

- [ ] **Step 2: Add state + persistence after the `$` helper**

```js
const state = {
  model: localStorage.getItem(KEYS.model) || "llama3.2:3b",
  style: localStorage.getItem(KEYS.style) || DEFAULT_STYLE,
  messages: JSON.parse(localStorage.getItem(KEYS.messages) || "[]")
};

function saveState() {
  localStorage.setItem(KEYS.model, state.model);
  localStorage.setItem(KEYS.style, state.style);
  localStorage.setItem(KEYS.messages, JSON.stringify(state.messages));
}

function buildMessages(style, history, input) {
  const sys = { role: "system", content: (STYLES[style] || STYLES[DEFAULT_STYLE]).system };
  const window = history.slice(-TURN_WINDOW * 2);
  return [sys, ...window, { role: "user", content: input }];
}
```

- [ ] **Step 3: Verify `buildMessages` in console**

Open the page, in console:

```js
const m = await import('./app.js'); // note: app.js has no exports yet for this; instead paste buildMessages logic manually
```

Simpler check — temporarily add `window._buildMessages = buildMessages;` at the end of app.js, reload, then run:

```js
_buildMessages("correct", [{role:"user",content:"a"},{role:"assistant",content:"b"}], "hello")
```

Expected: array of length 4, `[0].role === "system"` with the corrector prompt, last element `{role:"user",content:"hello"}`. Then remove the temporary `window._buildMessages` line.

- [ ] **Step 4: Verify sliding window trims to 8**

```js
const hist = Array.from({length: 20}, (_, i) => ({role: i%2?"assistant":"user", content: String(i)}));
_buildMessages("tip", hist, "x").length
```

Expected: `10` (1 system + 8 window + 1 current).

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat: add state, persistence, and message-building"
```

---

### Task 4: Ollama model list + populate selectors

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `OLLAMA_BASE`, `state`, `saveState`, `STYLES`, `$`.
- Produces: `async listModels()`; `populateStyles()`; `populateModels(names)`; `refreshModels()`; `showToast(msg)`.

- [ ] **Step 1: Add toast helper**

```js
let toastTimer;
function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}
```

- [ ] **Step 2: Add style selector population**

```js
function populateStyles() {
  const sel = $("style-select");
  sel.innerHTML = "";
  for (const [key, { label }] of Object.entries(STYLES)) {
    const opt = document.createElement("option");
    opt.value = key; opt.textContent = label;
    if (key === state.style) opt.selected = true;
    sel.appendChild(opt);
  }
}
```

- [ ] **Step 3: Add model listing + population**

```js
async function listModels() {
  const res = await fetch(`${OLLAMA_BASE}/api/tags`);
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  return (data.models || []).map((m) => m.name);
}

function populateModels(names) {
  const sel = $("model-select");
  sel.innerHTML = "";
  const all = names.includes(state.model) ? names : [state.model, ...names];
  for (const name of all) {
    const opt = document.createElement("option");
    opt.value = name; opt.textContent = name;
    if (name === state.model) opt.selected = true;
    sel.appendChild(opt);
  }
}

async function refreshModels() {
  try {
    const names = await listModels();
    populateModels(names);
    if (names.length === 0) showToast("Модели не найдены в Ollama.");
  } catch (e) {
    populateModels([]);
    showToast("Не удалось получить список моделей. Ollama запущен?");
  }
}
```

- [ ] **Step 4: Wire selectors + boot calls**

Add near the bottom (after the theme wiring from Task 1):

```js
$("style-select").addEventListener("change", (e) => { state.style = e.target.value; saveState(); });
$("model-select").addEventListener("change", (e) => { state.model = e.target.value; saveState(); });
$("refresh-models").addEventListener("click", refreshModels);

populateStyles();
refreshModels();
```

- [ ] **Step 5: Verify with Ollama running**

Start Ollama (`ollama serve`) with at least one model pulled. Reload page.
Expected: style dropdown shows 5 Russian labels with "Личный репетитор" selected; model dropdown lists local models with `llama3.2:3b` selected if present. Click ⟳ → list refreshes. Stop Ollama, click ⟳ → toast "Не удалось получить список моделей…" and UI stays usable.

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "feat: list Ollama models and populate selectors"
```

---

### Task 5: Streaming chat send/receive with abort

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `OLLAMA_BASE`, `state`, `saveState`, `buildMessages`, `showToast`, `$`.
- Produces: `async* chatStream({model, messages, signal})`; `renderMessage(role, content)` returning the content element; `sendMessage(text)`; module var `controller` (AbortController) and `generating` flag; `setGenerating(bool)`.

- [ ] **Step 1: Add stream generator**

```js
async function* chatStream({ model, messages, signal }) {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
    signal
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj.message && obj.message.content) yield obj.message.content;
      if (obj.done) return;
    }
  }
}
```

- [ ] **Step 2: Add rendering helper**

```js
function renderMessage(role, content) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = content;
  const box = $("messages");
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
  return el;
}
```

- [ ] **Step 3: Add generation state + send logic**

```js
let controller = null;

function setGenerating(on) {
  $("send").hidden = on;
  $("stop").hidden = !on;
  $("input").disabled = on;
}

async function sendMessage(text) {
  const msgs = buildMessages(state.style, state.messages, text);
  state.messages.push({ role: "user", content: text });
  renderMessage("user", text);
  saveState();

  const bubble = renderMessage("assistant", "");
  bubble.innerHTML = '<span class="cursor">▋</span>';
  let acc = "";
  controller = new AbortController();
  setGenerating(true);

  try {
    for await (const delta of chatStream({ model: state.model, messages: msgs, signal: controller.signal })) {
      acc += delta;
      bubble.textContent = acc;
      $("messages").scrollTop = $("messages").scrollHeight;
    }
    if (acc.trim() === "") bubble.textContent = "(пустой ответ)";
    state.messages.push({ role: "assistant", content: acc });
    saveState();
  } catch (e) {
    if (e.name === "AbortError") {
      state.messages.push({ role: "assistant", content: acc });
      saveState();
    } else {
      bubble.remove();
      renderMessage("error", "Ошибка связи с Ollama. Проверьте, что сервер запущен.");
      showToast("Ошибка: " + e.message);
    }
  } finally {
    setGenerating(false);
    controller = null;
  }
}
```

- [ ] **Step 4: Wire composer + stop button**

```js
$("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("input");
  const text = input.value.trim();
  if (!text || controller) return;
  input.value = "";
  input.style.height = "auto";
  sendMessage(text);
});

$("input").addEventListener("input", (e) => {
  e.target.style.height = "auto";
  e.target.style.height = e.target.scrollHeight + "px";
});

$("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("composer").requestSubmit();
  }
});

$("stop").addEventListener("click", () => { if (controller) controller.abort(); });
```

- [ ] **Step 5: Verify streaming**

With Ollama running and `llama3.2:3b` pulled: type "I has a apple" with style "Исправление предложения" → assistant bubble fills token-by-token, ends with corrected sentence only. Switch to "Объяснение ошибки", send again → get brief explanation + correction. Click Стоп mid-generation → generation halts, partial text kept, UI re-enables.

- [ ] **Step 6: Verify offline error**

Stop Ollama, send a message. Expected: error bubble "Ошибка связи с Ollama…" + toast; input re-enabled; app not frozen.

- [ ] **Step 7: Commit**

```bash
git add app.js
git commit -m "feat: streaming chat send/receive with abort and errors"
```

---

### Task 6: Restore history on boot + clear chat

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `state`, `renderMessage`, `saveState`, `$`.
- Produces: `restoreHistory()`; clear-chat wiring.

- [ ] **Step 1: Add history restore**

```js
function restoreHistory() {
  for (const m of state.messages) {
    if (m.role === "user" || m.role === "assistant") renderMessage(m.role, m.content);
  }
}
```

- [ ] **Step 2: Wire clear-chat + call restore on boot**

Add `restoreHistory();` near the boot calls (after `populateStyles()`), and:

```js
$("clear-chat").addEventListener("click", () => {
  if (controller) controller.abort();
  state.messages = [];
  saveState();
  $("messages").innerHTML = "";
});
```

- [ ] **Step 3: Verify persistence**

Send a couple of messages, reload page. Expected: prior user + assistant bubbles reappear in order, settings preserved. Click "Очистить чат" → messages cleared and stay cleared after reload; model/style unchanged.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: restore chat history on boot and clear-chat"
```

---

### Task 7: Final verification pass

**Files:** none (manual QA).

- [ ] **Step 1: Style behavior matrix**

With Ollama running, send the same wrong sentence "I go to school yesterday" under each style and confirm behavior:
- **Естественный диалог:** natural rephrase, no nitpicking if correct.
- **Исправление предложения:** only the corrected sentence, no commentary.
- **Объяснение ошибки:** short reason + correction.
- **Краткий совет:** one memorable rule/tip.
- **Личный репетитор:** concise mixed response, no meta about approach.

- [ ] **Step 2: Responsive + theme check**

Mobile width: hamburger opens sidebar, chat usable, bubbles ≤90% width. Theme toggle flips and persists; with no override the OS setting is followed.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: polish from final verification pass"
```
