# English Tutor SPA — Design

Date: 2026-07-12

## Purpose

Single-page chat app for practicing English. A local LLM (Llama 3.2 3B via Ollama)
acts as the tutor. Responses stay short and stream token-by-token so the app stays
fast on weak hardware.

## Decisions (locked)

- **Stack:** Vanilla HTML/CSS/JS, no build step, zero runtime dependencies.
- **Persistence:** Settings (model, style, theme) AND full chat history in `localStorage`.
- **Model context:** Sliding window — send system prompt + last 4 turns + current message.
- **Theme:** Follow `prefers-color-scheme` by default, plus a manual toggle that overrides and persists.

## Files

| File | Responsibility |
|------|----------------|
| `index.html` | Markup: header (title + theme toggle), settings sidebar, chat message area, input bar. |
| `styles.css` | CSS custom properties for light/dark, mobile-first responsive layout, message bubbles, toast. |
| `app.js` | ES6 module. App state, Ollama client (list + chat stream), rendering, persistence, error handling. |
| `prompts.js` | The 5 tutor-style system prompts as an exported map. Designed to be easily replaceable (spec §4). |

## Architecture

Plain ES modules loaded via `<script type="module">`. No framework.

### State

```
state = {
  model:    string,   // selected Ollama model, default "llama3.2:3b"
  style:    string,    // key into prompts map, default "personal" (Личный репетитор)
  theme:    "light" | "dark" | null,  // null = follow system
  messages: [ { role: "user" | "assistant", content: string } ]
}
```

Loaded from `localStorage` on boot, persisted on every mutation.

### Ollama client (inside app.js)

- `listModels()` → `GET http://localhost:11434/api/tags` → array of model names.
- `chatStream({ model, messages, signal })` → `POST /api/chat` with `stream: true`.
  Reads the `ReadableStream`, splits NDJSON lines, yields `message.content` deltas.
- Base URL constant `http://localhost:11434`.

### Request payload

`messages` = `[ { role: "system", content: prompt[style] }, ...lastFourTurns, { role: "user", content: input } ]`.

## Data flow

1. **Boot** → load state → render persisted history → fetch model list → populate
   selectors (default `llama3.2:3b`, fall back gracefully if absent).
2. **Send** → append user bubble → open empty assistant bubble → stream tokens into it →
   persist history. Disable send + show Stop while generating.
3. **Settings change** (model / style) → update state → persist. Next request uses new
   values immediately.
4. **Refresh models** button → re-run `listModels()`.

## Tutor styles

Five prompts in `prompts.js`, keyed and dropdown-selectable:

1. **Естественный диалог** — suggest more natural phrasing; don't fix grammar if none wrong.
2. **Исправление предложения** — corrected sentence only, no explanation.
3. **Объяснение ошибки** — brief explanation of what was wrong (rule allowed, no lecture).
4. **Краткий совет** — one short memorable tip/rule, max ~2 sentences.
5. **Личный репетитор** — internally choose best of the above four, may combine, stays terse.

All prompts hard-cap length and role in English, per spec §4. Prompts are the single
source of truth for tutor behavior and can be swapped without touching app logic.

## Theme

`prefers-color-scheme` drives default. Toggle button flips `data-theme` attribute on
`<html>` and persists the override in `localStorage`. CSS variables switch on
`[data-theme="dark"]` / `[data-theme="light"]` and the media query.

## Error handling

- Ollama unreachable / fetch failure → error bubble in chat + non-blocking toast; UI stays usable.
- New send aborts any in-flight stream (`AbortController`).
- Stop button cancels the current generation.
- Empty / whitespace input ignored.

## Persistence details

- Keys: `et.model`, `et.style`, `et.theme`, `et.messages`.
- Clear-chat button wipes history (keeps settings).

## Out of scope (YAGNI)

- No backend/proxy — browser talks to Ollama directly (CORS assumed allowed on localhost).
- No auth, no multi-conversation management, no export.
- No client-side heavy computation.
