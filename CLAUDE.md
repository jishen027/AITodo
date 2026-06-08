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
DEEPSEEK_MODEL=deepseek-chat        # optional, defaults to deepseek-chat

DATABASE_URL=postgresql://user:password@host:5432/ai_todo

AUTH_SECRET=<random base64 string>  # node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
NEXTAUTH_URL=http://localhost:3000
```

## Architecture

**Next.js 15 / React 19** app with PostgreSQL persistence and NextAuth v5 authentication.

### Data flow

```
types/index.ts               ← shared types: Todo, Plan, ChatMessage, Step, Priority
hooks/usePlans.ts            ← single source of truth for all state + AI agent logic + DB persistence
app/page.tsx                 ← root layout, wires hook to components
app/api/chat/route.ts        ← Next.js Route Handler, calls DeepSeek via OpenAI SDK
lib/api.ts                   ← thin fetch wrapper (callChat)
lib/utils.ts                 ← generateId, formatYMD, getPriorityColor
lib/db.ts                    ← pg Pool singleton + lazy schema init (CREATE TABLE IF NOT EXISTS)
auth.config.ts               ← Edge-compatible NextAuth config, used by middleware
auth.ts                      ← full NextAuth config with Credentials provider (pg + bcryptjs)
middleware.ts                ← protects all page routes, redirects unauthenticated → /login
```

### Key types

- **`Todo`** — `{ id, text, completed, notes, dueDate, dueTime, priority, steps[] }`
- **`Plan`** — `{ id, title, todos[], chat[] }` — one plan owns one chat thread
- **`TodoWithPlan`** — `Todo` extended with `planId` / `planTitle` for cross-plan views

### Database

`lib/db.ts` exports a `pg.Pool` singleton (dev-safe global to survive hot-reloads) and `ensureReady()`, a lazy initialiser that runs `CREATE TABLE IF NOT EXISTS` once per server process. Every API route calls `await ensureReady()` before touching the DB.

Tables: `users`, `plans` (has `user_id` FK), `todos`, `steps`, `chat_messages`.

All plan data is scoped to the authenticated user — `GET /api/plans` filters by `user_id`, `POST /api/plans` inserts with `user_id`.

### Authentication

Uses **NextAuth v5** split-config pattern to avoid Edge Runtime warnings:

- `auth.config.ts` — Edge-compatible: defines `pages`, `session`, and `callbacks` (jwt, session, authorized). No Node.js imports. Used by `middleware.ts`.
- `auth.ts` — Node.js only: spreads `authConfig` and adds the `Credentials` provider (which imports `pg` and `bcryptjs`). Exported `auth()` is used in API routes to get the session.
- `middleware.ts` — calls `NextAuth(authConfig).auth`; the `authorized` callback redirects unauthenticated users to `/login` and logged-in users away from `/login`/`/register`.

Registration is handled by `POST /api/auth/register` (custom endpoint, not part of NextAuth). It validates input, checks for duplicate email, bcrypt-hashes the password (cost 12), and inserts into `users`.

### `usePlans` hook

All business logic lives here. Key internals:

- Loads plans from `GET /api/plans` on mount; starts with `plans = []` and `isLoading = true`.
- `buildSystemInstruction(activePlan, allPlans)` — assembles the DeepSeek system prompt. Separates **EDITABLE** (incomplete) todos from **LOCKED** (completed) todos. Rebuilt fresh on every message send.
- `parsePlanUpdate(responseText, currentTodos)` — extracts the JSON code block from the AI response, normalises it, and enforces the locked-completed rule via a `Map`. Returns `{ text, todos, planTitle }`.
- `stripControlToken(text)` — removes `<<<ASKING>>>` / `<<<PROPOSED>>>` / `<<<CONFIRMED>>>` tokens from the displayed text and returns which token was present.
- `pendingProposalRef` — tracks whether the AI is in Phase 2 (plan proposed, awaiting approval). Used to trigger a force-JSON retry when the model confirms without emitting JSON.
- `handleSendMessage` — builds full chat history from `activePlan.chat.slice(1)` (skips the opening greeting), calls the API, parses the response, applies todo updates, then persists chat messages and todos to the DB.

Every mutation (create/delete plan, rename, toggle/delete/add/edit todo, AI response) fires the appropriate API route optimistically — React state is updated first, then the fetch is dispatched.

### AI agent 3-phase workflow

The system instruction drives a state machine:
1. **Phase 1 `<<<ASKING>>>`** — gather goal details, no JSON
2. **Phase 2 `<<<PROPOSED>>>`** — show plan as Markdown table, await approval
3. **Phase 3 `<<<CONFIRMED>>>`** — emit full todos JSON; also triggered directly for modifications to an existing plan (add/edit/remove/reschedule tasks)

### API routes

| Route | Methods | Purpose |
|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | NextAuth handler |
| `/api/auth/register` | POST | Create user account |
| `/api/chat` | POST | Proxy to DeepSeek |
| `/api/plans` | GET, POST | List/create plans (scoped to user) |
| `/api/plans/[id]` | PUT, DELETE | Rename/delete plan |
| `/api/plans/[id]/todos` | PUT | Bulk-replace all todos for a plan |
| `/api/plans/[id]/todos/[todoId]` | PATCH, DELETE | Update/delete single todo |
| `/api/plans/[id]/chat` | POST | Append chat messages |

All plan/todo/chat routes check `auth()` and return 401 if unauthenticated.

### DeepSeek integration

`app/api/chat/route.ts` uses the `openai` npm package pointed at `https://api.deepseek.com`. The model defaults to `deepseek-chat` if `DEEPSEEK_MODEL` is not set.

### Components

- **`Sidebar`** — plan list + navigation; user initials + sign-out button in footer
- **`TodoList`** — active/completed todo columns for the selected plan; GSAP entry animation for AI-created todos
- **`ChatPanel`** — chat UI for the active plan; slides in/out relative to `TodoDetails`
- **`TodoDetails`** — slide-over panel for editing a single todo (title, priority, due date/time, steps, notes)
- **`CalendarView`** — monthly grid + all-tasks list; todos sorted by `dueDate + dueTime` within each day
