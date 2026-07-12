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

initTheme();
$("theme-toggle").addEventListener("click", toggleTheme);
$("menu-toggle").addEventListener("click", () => $("sidebar").classList.toggle("open"));
