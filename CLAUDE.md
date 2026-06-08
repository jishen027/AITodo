# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server (http://localhost:3000)
npm run build    # production build
npm run lint     # ESLint via next lint
```

No test suite is configured.

## Environment

Copy `.env.local.example` to `.env.local` and set:
```
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_MODEL=deepseek-chat   # optional, defaults to deepseek-chat
```

## Architecture

This is a **Next.js 15 / React 19** app with no database — all state lives in React memory (resets on page reload).

### Data flow

```
types/index.ts          ← shared types: Todo, Plan, ChatMessage, Step, Priority
hooks/usePlans.ts       ← single source of truth for all state + AI agent logic
app/page.tsx            ← root layout, wires hook to components
app/api/chat/route.ts   ← Next.js Route Handler, calls DeepSeek via OpenAI SDK
lib/api.ts              ← thin fetch wrapper (callChat)
lib/utils.ts            ← generateId, formatYMD, getPriorityColor
```

### Key types

- **`Todo`** — `{ id, text, completed, notes, dueDate, dueTime, priority, steps[] }`
- **`Plan`** — `{ id, title, todos[], chat[] }` — one plan owns one chat thread
- **`TodoWithPlan`** — `Todo` extended with `planId` / `planTitle` for cross-plan views

### `usePlans` hook

All business logic lives here. Key internals:

- `buildSystemInstruction(activePlan, allPlans)` — assembles the DeepSeek system prompt. It separates **EDITABLE** (incomplete) todos from **LOCKED** (completed) todos so the AI knows what it can modify. Rebuilt fresh on every message send.
- `parsePlanUpdate(responseText, currentTodos)` — extracts the JSON code block from the AI response, normalises it, and enforces the locked-completed rule via a `Map`. Returns `{ text, todos, planTitle }`.
- `stripControlToken(text)` — removes `<<<ASKING>>>` / `<<<PROPOSED>>>` / `<<<CONFIRMED>>>` tokens from the displayed text and returns which token was present.
- `pendingProposalRef` — tracks whether the AI is in Phase 2 (plan proposed, awaiting approval). Used to trigger a force-JSON retry when the model confirms without emitting JSON.
- `handleSendMessage` — builds full chat history from `activePlan.chat.slice(1)` (skips the opening greeting), calls the API, parses the response, and applies todo updates. If the model returns `<<<CONFIRMED>>>` without JSON, it sends a follow-up prompt to force the JSON block.

### AI agent 3-phase workflow

The system instruction drives a state machine:
1. **Phase 1 `<<<ASKING>>>`** — gather goal details, no JSON
2. **Phase 2 `<<<PROPOSED>>>`** — show plan as Markdown table, await approval
3. **Phase 3 `<<<CONFIRMED>>>`** — emit full todos JSON; also triggered directly for modifications to an existing plan (add/edit/remove/reschedule tasks)

### DeepSeek integration

`app/api/chat/route.ts` uses the `openai` npm package pointed at `https://api.deepseek.com`. The model defaults to `deepseek-chat` if `DEEPSEEK_MODEL` is not set.

### Components

- **`Sidebar`** — plan list + navigation; "New Plan" creates a plan with a fresh chat
- **`TodoList`** — active/completed todo columns for the selected plan; GSAP entry animation for AI-created todos
- **`ChatPanel`** — chat UI for the active plan; slides in/out relative to `TodoDetails`
- **`TodoDetails`** — slide-over panel for editing a single todo (title, priority, due date/time, steps, notes)
- **`CalendarView`** — monthly grid + all-tasks list; todos sorted by `dueDate + dueTime` within each day
