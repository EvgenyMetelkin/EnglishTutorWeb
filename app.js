import { STYLES, DEFAULT_STYLE, LANGUAGES, DEFAULT_LANG, SAMPLING, KEEP_ALIVE, formatPlanContext } from "./prompts.js";
import { PLANS, DEFAULT_PLAN } from "./plans/all.js";

const OLLAMA_BASE = "http://localhost:11434";
const TURN_WINDOW = 4; // number of user+assistant pairs to send as context

const KEYS = { model: "et.model", style: "et.style", lang: "et.lang", theme: "et.theme", messages: "et.messages", plan: "et.plan", planIndex: "et.planIndex" };

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
  lang: localStorage.getItem(KEYS.lang) || DEFAULT_LANG,
  plan: localStorage.getItem(KEYS.plan) || DEFAULT_PLAN,
  planIndex: parseInt(localStorage.getItem(KEYS.planIndex) || "0"),
  messages: loadMessages()
};

function saveState() {
  localStorage.setItem(KEYS.model, state.model);
  localStorage.setItem(KEYS.style, state.style);
  localStorage.setItem(KEYS.lang, state.lang);
  localStorage.setItem(KEYS.plan, state.plan);
  localStorage.setItem(KEYS.planIndex, String(state.planIndex));
  localStorage.setItem(KEYS.messages, JSON.stringify(state.messages));
}

function activePlan() {
  return PLANS[state.plan] || PLANS[DEFAULT_PLAN];
}

function buildMessages(style, lang, history, input) {
  const styleDef = STYLES[style] || STYLES[DEFAULT_STYLE];
  const langPrompt = (LANGUAGES[lang] || LANGUAGES[DEFAULT_LANG]).system;
  let sysText = `${styleDef.system} ${langPrompt}`;
  if (style === "personal") {
    const plan = activePlan();
    const context = formatPlanContext(plan, state.planIndex);
    if (context) sysText += "\n\n" + context;
  }
  const sys = { role: "system", content: sysText };
  const examples = (styleDef.examples && styleDef.examples[lang]) || [];
  const window = history.slice(-TURN_WINDOW * 2);
  return [sys, ...examples, ...window, { role: "user", content: input }];
}

function styleOptions(style) {
  const styleDef = STYLES[style] || STYLES[DEFAULT_STYLE];
  return { ...SAMPLING, ...(styleDef.options || {}) };
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

function populateLanguages() {
  const sel = $("lang-select");
  sel.innerHTML = "";
  for (const [key, { label }] of Object.entries(LANGUAGES)) {
    const opt = document.createElement("option");
    opt.value = key; opt.textContent = label;
    if (key === state.lang) opt.selected = true;
    sel.appendChild(opt);
  }
}

function populatePlans() {
  const sel = $("plan-select");
  sel.innerHTML = "";
  for (const [key, plan] of Object.entries(PLANS)) {
    const opt = document.createElement("option");
    opt.value = key; opt.textContent = plan.name;
    if (key === state.plan) opt.selected = true;
    sel.appendChild(opt);
  }
  $("plan-field").hidden = state.style !== "personal";
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

async function* chatStream({ model, messages, options, signal }) {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true, keep_alive: KEEP_ALIVE, options }),
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

  const msgs = buildMessages(state.style, state.lang, state.messages, text);
  state.messages.push({ role: "user", content: text });
  renderMessage("user", text);
  saveState();

  liveBubble = renderMessage("assistant", "");
  liveBubble.innerHTML = '<span class="cursor">▋</span>';
  liveAcc = "";
  const myController = new AbortController();
  controller = myController;
  setGenerating(true);

  const isPersonal = state.style === "personal";
  let liveQuestionBubble = null;
  let splitDone = false;

  try {
    for await (const delta of chatStream({ model: state.model, messages: msgs, options: styleOptions(state.style), signal: myController.signal })) {
      if (isPersonal && !splitDone) {
        liveAcc += delta;
        // Detect delimiter: "\n---\n" or starting "---\n"
        const dm = liveAcc.indexOf("\n---\n");
        const dmStart = dm === -1 && liveAcc.startsWith("---\n") ? 0 : -1;
        const delimIdx = dm !== -1 ? dm : dmStart;
        if (delimIdx !== -1) {
          const before = liveAcc.slice(0, delimIdx).trim();
          const after = liveAcc.slice(delimIdx + (dm !== -1 ? 5 : 4)).trim(); // skip "\n---\n" or "---\n"
          if (before) { liveBubble.textContent = before; state.messages.push({ role: "assistant", content: before }); }
          else { liveBubble.remove(); }
          saveState();
          liveQuestionBubble = renderMessage("assistant", "");
          liveQuestionBubble.innerHTML = '<span class="cursor">▋</span>';
          liveAcc = after;
          liveBubble = liveQuestionBubble;
          splitDone = true;
        } else {
          liveBubble.textContent = liveAcc;
        }
      } else {
        liveAcc += delta;
        liveBubble.textContent = liveAcc;
      }
      $("messages").scrollTop = $("messages").scrollHeight;
    }
    if (liveAcc.trim() === "") {
      if (liveBubble && liveBubble !== liveQuestionBubble) liveBubble.textContent = "(пустой ответ)";
      else if (liveBubble) liveBubble.textContent = "";
    }
    if (liveAcc.trim()) {
      state.messages.push({ role: "assistant", content: liveAcc });
    }
    liveBubble = null;
    liveQuestionBubble = null;
    liveAcc = "";
    saveState();

    // Advance plan step after successful personal exchange
    if (isPersonal) {
      state.planIndex++;
      const plan = activePlan();
      if (state.planIndex >= plan.steps.length) state.planIndex = 0;
      saveState();
    }
  } catch (e) {
    if (e.name === "AbortError") {
      // Interruption is finalized by commitPartial() (new send) or the stop handler.
    } else {
      if (liveBubble) { liveBubble.remove(); liveBubble = null; liveAcc = ""; }
      if (liveQuestionBubble) { liveQuestionBubble.remove(); liveQuestionBubble = null; }
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
$("info-toggle").addEventListener("click", () => { $("info-overlay").hidden = false; });
$("info-close").addEventListener("click", () => { $("info-overlay").hidden = true; });
$("info-overlay").addEventListener("click", (e) => { if (e.target === $("info-overlay")) $("info-overlay").hidden = true; });

$("style-select").addEventListener("change", (e) => { state.style = e.target.value; saveState(); populatePlans(); });
$("lang-select").addEventListener("change", (e) => { state.lang = e.target.value; saveState(); });
$("plan-select").addEventListener("change", (e) => { state.plan = e.target.value; state.planIndex = 0; saveState(); });
$("model-select").addEventListener("change", (e) => { state.model = e.target.value; saveState(); });
$("refresh-models").addEventListener("click", refreshModels);

populateStyles();
populateLanguages();
populatePlans();
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
