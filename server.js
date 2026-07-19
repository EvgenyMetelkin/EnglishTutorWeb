import "dotenv/config";
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET;
const PASSWORD_HASH = process.env.APP_PASSWORD_HASH;
const PORT = process.env.PORT || 3000;

if (!JWT_SECRET || !PASSWORD_HASH) {
  console.error("Missing JWT_SECRET or APP_PASSWORD_HASH in .env");
  process.exit(1);
}

const app = express();
app.use(express.json());

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }
  try {
    jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

app.post("/api/login", async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "Password required" });
  const ok = await bcrypt.compare(password, PASSWORD_HASH);
  if (!ok) return res.status(401).json({ error: "Invalid password" });
  const token = jwt.sign({ sub: "user" }, JWT_SECRET, { expiresIn: "24h" });
  res.json({ token });
});

function buildCloudRequest(provider, model, messages, options) {
  const opts = options || {};
  if (provider === "anthropic") {
    const systemContent = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const chatMsgs = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        system: systemContent,
        messages: chatMsgs,
        max_tokens: opts.num_predict || 1024,
        temperature: opts.temperature,
        top_p: opts.top_p,
        stream: true
      })
    };
  }
  const endpoints = {
    deepseek: "https://api.deepseek.com/v1/chat/completions",
    openai: "https://api.openai.com/v1/chat/completions"
  };
  const keys = { deepseek: process.env.DEEPSEEK_KEY, openai: process.env.OPENAI_KEY };
  return {
    url: endpoints[provider],
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${keys[provider]}`
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: opts.num_predict || 1024,
      temperature: opts.temperature,
      top_p: opts.top_p,
      stream: true
    })
  };
}

async function streamOpenAICompatible(res, upstream) {
  const reader = upstream.body.getReader();
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
      if (data === "[DONE]") { res.end(); return; }
      try {
        const obj = JSON.parse(data);
        const text = obj.choices?.[0]?.delta?.content;
        if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
      } catch {}
    }
  }
  res.end();
}

async function streamAnthropic(res, upstream) {
  const reader = upstream.body.getReader();
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
        if (obj.type === "content_block_delta" && obj.delta?.text) {
          res.write(`data: ${JSON.stringify({ text: obj.delta.text })}\n\n`);
        }
      } catch {}
    }
  }
  res.end();
}

app.post("/api/chat", requireAuth, async (req, res) => {
  const { provider, model, messages, options } = req.body;
  if (!provider || !model || !messages) {
    return res.status(400).json({ error: "provider, model, messages required" });
  }
  if (provider === "ollama") {
    return res.status(400).json({ error: "Use direct Ollama connection for local models" });
  }

  const { url, headers, body } = buildCloudRequest(provider, model, messages, options);

  try {
    const upstream = await fetch(url, { method: "POST", headers, body });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return res.status(upstream.status).json({ error: errText.slice(0, 500) });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    if (provider === "anthropic") {
      await streamAnthropic(res, upstream);
    } else {
      await streamOpenAICompatible(res, upstream);
    }
  } catch (e) {
    if (!res.headersSent) {
      res.status(502).json({ error: e.message });
    }
  }
});

app.use(express.static("."));

app.listen(PORT, () => {
  console.log(`English Tutor server: http://localhost:${PORT}`);
});
