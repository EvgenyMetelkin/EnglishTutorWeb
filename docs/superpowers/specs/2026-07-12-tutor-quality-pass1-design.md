# Tutor Response Quality — Pass 1 Design

Date: 2026-07-12

## Goal

Improve tutor answer quality on the weak `llama3.2:3b` model without hurting
performance, via few-shot examples, per-style sampling, and keeping the model
resident in RAM.

## Decisions (locked)

- Scope: few-shot examples + per-style `temperature`/`num_predict` + `keep_alive`.
  No context-window or warm-up changes this pass.
- Few-shot examples are **per language** (ru + en); English is preserved for the
  taught sentence/words even when prose is Russian.
- Few-shot delivered as **real user/assistant message turns**, not inline text.
- Count: 1 example pair per style; 2 for `personal`.
- Sampling: `top_p 0.9`, `repeat_penalty 1.1`, `keep_alive "30m"`.
  Per-style temperature/num_predict:
  | style | temperature | num_predict |
  |-------|-------------|-------------|
  | correct | 0.1 | 60 |
  | explain | 0.3 | 150 |
  | tip | 0.3 | 120 |
  | natural | 0.5 | 150 |
  | personal | 0.4 | 200 |

## Data model (`prompts.js`)

Each `STYLES[key]` gains:
```js
{
  label, system,                        // system gets an anti-preamble line
  options: { temperature, num_predict },
  examples: { ru: [ {role, content}, ... ], en: [ ... ] }  // user→assistant pairs
}
```
New exports: `SAMPLING = { top_p: 0.9, repeat_penalty: 1.1 }`, `KEEP_ALIVE = "30m"`.

Anti-preamble line appended to every style system prompt:
"No greetings, no 'Sure'/'Here is'. Answer directly."

## `buildMessages(style, lang, history, input)`

Returns `[system(style+lang), ...examples[lang], ...window, userInput]`.
- system content = `style.system + " " + lang.system`
- examples = `STYLES[style].examples[lang]` (falls back to `[]`)
- window = last `TURN_WINDOW*2` history messages (unchanged)

## `chatStream`

Body adds:
```js
{ model, messages, stream: true, keep_alive: KEEP_ALIVE, options }
```
where `options = { ...SAMPLING, ...(STYLES[style] || default).options }`, computed
in `sendMessage` via a `styleOptions(style)` helper and passed into `chatStream`.

## Few-shot content

Correction output is pure English (identical across languages). All other styles:
prose in selected language, English kept for corrected sentence / quoted words.

- **correct**: `She don't likes apples.` → `She doesn't like apples.`
- **explain** (ru): `He go to school every day.` → `В Present Simple для he/she/it глагол получает -s.\nHe goes to school every day.`
- **tip** (ru): `I enjoy to read books.` → `Запомни: после «enjoy» всегда герундий (-ing): "enjoy reading".`
- **natural** (ru): `It is raining very strongly.` → `Грамматика верна, но живее: "It's raining really hard."`
- **personal** (ru, 2 ex):
  1. `Yesterday I go to the party and it was very funny.` → `Прошедшее: "went". И "funny" — смешной; тебе нужно "fun".\n"Yesterday I went to the party and it was a lot of fun."\nСовет: funny = смех, fun = удовольствие.`
  2. `Can you tell me where is the station?` → `В косвенном вопросе прямой порядок слов.\n"Can you tell me where the station is?"`

EN example sets mirror the prose in English.

## Out of scope

- num_ctx / TURN_WINDOW tuning, warm-up request (possible pass 2).
