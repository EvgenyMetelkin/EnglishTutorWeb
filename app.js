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
