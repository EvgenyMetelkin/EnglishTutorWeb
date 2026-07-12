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

initTheme();
$("theme-toggle").addEventListener("click", toggleTheme);
$("menu-toggle").addEventListener("click", () => $("sidebar").classList.toggle("open"));

$("style-select").addEventListener("change", (e) => { state.style = e.target.value; saveState(); });
$("model-select").addEventListener("change", (e) => { state.model = e.target.value; saveState(); });
$("refresh-models").addEventListener("click", refreshModels);

populateStyles();
refreshModels();
