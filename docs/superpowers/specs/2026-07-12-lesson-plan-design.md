# Lesson Plan for «Личный репетитор» — Design

Date: 2026-07-12

## Goal

Replace the freeform "Личный репетитор" style with a structured lesson-plan approach.
Each user exchange produces two assistant messages: response to input + next plan question,
separated by a `---` delimiter from a single API call.

## Decisions (locked)

- Plan file: separate `.js` files in `plans/`, aggregated in `plans/all.js`.
  Each exports `{ id, name, steps[] }`, each step `{ id, title, topic, purpose, question }`.
- Multiple plans, selectable via dropdown (visible when style is "personal").
  Default plan from `DEFAULT_PLAN`. Plan switch resets index to 0.
- Fixed-step advancement: one step per user exchange.
- Delimiter: tutor outputs `[response]\n---\n[question]` in a single request.
  Streaming loop detects `---`, flips target bubble.
- Plan progress persisted: `et.plan` (plan id) + `et.planIndex` (step index) in localStorage.
- `num_predict` increased from 200 → 280 for personal style.
- Other 5 styles untouched.

## Files

| File | Change |
|------|--------|
| `plans/english-basics.js` | Create — sample plan with ~6 steps |
| `plans/all.js` | Create — aggregates and re-exports all plans |
| `prompts.js` | Modify — personal system prompt now templated with `{PLAN_CONTEXT}`; few-shot examples updated to delimiter format |
| `app.js` | Modify — import plans, plan selector, plan state+persistence, delimiter-aware streaming in sendMessage, `buildMessages` plan-context injection |
| `index.html` | Modify — add `#plan-select` dropdown (after language, hidden when style != personal) |

## Delimiter protocol

Model outputs via single `/api/chat` request. System prompt instructs:
"First respond to the user. Then on a line containing ONLY `---`, ask the next plan question."

Streaming loop in `sendMessage`:
1. Accumulate deltas as normal.
2. On encountering `---` (with surrounding newlines or as start of line):
   - Strip the delimiter from accumulated response text.
   - Finalize response bubble and push to history.
   - Create second bubble for the question.
   - Continue streaming into question bubble.
3. On completion: push question to history.
4. If no delimiter found: single bubble (graceful degradation).

## System prompt assembly

For personal style, the system prompt is dynamic — current step context is injected
at request time. `buildMessages` substitutes `{PLAN_CONTEXT}` with full plan JSON
and current step marker. The `SYSTEM_TEMPLATE` lives in `prompts.js`.

## Plan progress

- `state.plan` (plan id), `state.planIndex` (0-based step).
- Incremented after each exchange.
- Wraps to 0 when exhausted, or tutor signals "completed".
- Plan switch resets index to 0.
- Persisted in localStorage, restored on boot.

## Plan selector

- `#plan-select` in sidebar, populated from `PLANS` import.
- Hidden when style ≠ "personal" (shown otherwise via `populatePlans`).
- On change: `state.plan = ...`, `state.planIndex = 0`, `saveState()`.
- Default: `DEFAULT_PLAN`.
