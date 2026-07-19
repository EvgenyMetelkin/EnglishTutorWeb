import { OLLAMA_BASE } from "./config.js";
import { KEEP_ALIVE } from "./prompts.js";

export async function* ollamaStream({ model, messages, options, signal }) {
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
}

export async function* cloudStream({ provider, model, messages, options, signal }) {
  const jwt = sessionStorage.getItem("et.jwt");
  if (!jwt) throw new Error("Not authenticated");

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${jwt}`
    },
    body: JSON.stringify({ provider, model, messages, options }),
    signal
  });

  if (!res.ok) {
    if (res.status === 401) {
      sessionStorage.removeItem("et.jwt");
      location.reload();
      throw new Error("Session expired");
    }
    let msg = `HTTP ${res.status}`;
    try { const e = await res.json(); msg = e.error || msg; } catch {}
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data) continue;
      try {
        const obj = JSON.parse(data);
        if (obj.text) yield obj.text;
      } catch {}
    }
  }
}
