import { STYLES, DEFAULT_STYLE } from "./prompts.js";

const OLLAMA_BASE = "http://localhost:11434";
const TURN_WINDOW = 4; // number of user+assistant pairs to send as context

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

function loadMessages() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEYS.messages) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const state = {
  model: localStorage.getItem(KEYS.model) || "llama3.2:3b",
  style: localStorage.getItem(KEYS.style) || DEFAULT_STYLE,
  messages: loadMessages()
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

let toastTimer;
function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}

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
  buf += decoder.decode();
  const rest = buf.trim();
  if (rest) {
    try {
      const obj = JSON.parse(rest);
      if (obj.message && obj.message.content) yield obj.message.content;
    } catch { /* ignore trailing partial */ }
  }
}

function renderMessage(role, content) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = content;
  const box = $("messages");
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
  return el;
}

function restoreHistory() {
  for (const m of state.messages) {
    if (m.role === "user" || m.role === "assistant") renderMessage(m.role, m.content);
  }
}

let controller = null;
let liveBubble = null;
let liveAcc = "";

function setGenerating(on) {
  $("stop").hidden = !on;
}

// Finalize the in-progress assistant turn when it is interrupted (new send / stop).
// Keeps any partial text so history and DOM stay in order; drops an empty bubble.
function commitPartial() {
  if (!liveBubble) return;
  if (liveAcc.trim()) {
    liveBubble.textContent = liveAcc;
    state.messages.push({ role: "assistant", content: liveAcc });
  } else {
    liveBubble.remove();
  }
  liveBubble = null;
  liveAcc = "";
  saveState();
}

async function sendMessage(text) {
  // A new send interrupts any running generation, finalizing its partial first
  // so message order stays correct.
  if (controller) { controller.abort(); controller = null; }
  commitPartial();

  const msgs = buildMessages(state.style, state.messages, text);
  state.messages.push({ role: "user", content: text });
  renderMessage("user", text);
  saveState();

  liveBubble = renderMessage("assistant", "");
  liveBubble.innerHTML = '<span class="cursor">▋</span>';
  liveAcc = "";
  const myController = new AbortController();
  controller = myController;
  setGenerating(true);

  try {
    for await (const delta of chatStream({ model: state.model, messages: msgs, signal: myController.signal })) {
      liveAcc += delta;
      liveBubble.textContent = liveAcc;
      $("messages").scrollTop = $("messages").scrollHeight;
    }
    if (liveAcc.trim() === "") liveBubble.textContent = "(пустой ответ)";
    state.messages.push({ role: "assistant", content: liveAcc });
    liveBubble = null;
    liveAcc = "";
    saveState();
  } catch (e) {
    if (e.name === "AbortError") {
      // Interruption is finalized by commitPartial() (new send) or the stop handler.
    } else {
      if (liveBubble) { liveBubble.remove(); liveBubble = null; liveAcc = ""; }
      renderMessage("error", "Ошибка связи с Ollama. Проверьте, что сервер запущен.");
      showToast("Ошибка: " + e.message);
    }
  } finally {
    if (controller === myController) {
      setGenerating(false);
      controller = null;
    }
  }
}

initTheme();
$("theme-toggle").addEventListener("click", toggleTheme);
$("menu-toggle").addEventListener("click", () => $("sidebar").classList.toggle("open"));

$("style-select").addEventListener("change", (e) => { state.style = e.target.value; saveState(); });
$("model-select").addEventListener("change", (e) => { state.model = e.target.value; saveState(); });
$("refresh-models").addEventListener("click", refreshModels);

populateStyles();
restoreHistory();
refreshModels();

$("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("input");
  const text = input.value.trim();
  if (!text) return;
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

$("stop").addEventListener("click", () => {
  if (controller) { controller.abort(); controller = null; }
  commitPartial();
  setGenerating(false);
});

$("clear-chat").addEventListener("click", () => {
  if (controller) { controller.abort(); controller = null; }
  liveBubble = null;
  liveAcc = "";
  state.messages = [];
  saveState();
  $("messages").innerHTML = "";
  setGenerating(false);
});
