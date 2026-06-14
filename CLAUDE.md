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

NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...  # optional — enables map + place autocomplete in TodoDetails
                                     # (Maps JavaScript API, Places API (New), Geocoding API)
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

- **`Todo`** — `{ id, text, completed, notes, dueDate, dueTime, priority, steps[], location?, locationLat?, locationLng? }`
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
- The AI agent runs as **two separate calls** so each output is single-purpose (conversation vs. data). No response ever mixes prose and JSON.
- `buildChatInstruction(activePlan, allPlans)` — **Call 1** system prompt: the conversational reply, **Markdown only, never JSON**. Drives the phase via a control token (ASKING / PROPOSED / CONFIRMED). Gets a compact task view + locked-task list as context.
- `buildPlanInstruction(activePlan, allPlans)` — **Call 2** system prompt: invoked only when Call 1 returns CONFIRMED. Returns the complete plan as **JSON only** (no prose). Includes the full EDITABLE/LOCKED todos and schema.
- `planContext(activePlan, allPlans)` — shared helper both builders use (date, global stats, incomplete/completed todo split).
- `extractJsonBlock(responseText)` — pulls JSON from a reply: prefers a fenced ```json block, falls back to the outermost `{}`/`[]` span (handles unfenced JSON).
- `parsePlanUpdate(responseText)` — runs `extractJsonBlock`, parses, and returns the **raw** `{ text, todos, planTitle }`. Does **not** reconcile (that's deferred to commit time).
- `reconcileTodos(aiTodos, base, knownIds)` — merges the AI's array against the **latest** live todos (read inside the `setPlans` updater, not a send-time snapshot). Re-locks completed tasks, preserves `myDay`/coords/`createdAt`, drops tasks the user deleted mid-request, and keeps tasks the user added mid-request. Prevents a stale AI array from clobbering concurrent edits.
- `stripControlToken(text)` — removes `<<<ASKING>>>` / `<<<PROPOSED>>>` / `<<<CONFIRMED>>>` / `<<<TRUNCATED>>>` tokens from the displayed text and returns which control token was present.
- `trimTrailingLeadIn(text)` — drops a dangling "here is the plan:" colon lead-in from the conversational reply.
- `pendingProposalRef` — tracks whether the AI is in Phase 2 (plan proposed, awaiting approval). Used to fire Call 2 when the user approves but the model forgot the CONFIRMED token.
- `handleSendMessage` — builds chat history from `activePlan.chat.slice(1)` (skips the opening greeting); streams Call 1 and shows it immediately; if CONFIRMED, runs Call 2 (JSON, up to 3 attempts) and applies the reconciled todos. Persists chat + todos optimistically.

`app/api/chat/route.ts` sets `max_tokens: 8192` and appends a `<<<TRUNCATED>>>` sentinel when the model stops on `finish_reason === 'length'`, so the client can fail loudly instead of parsing a half-finished plan.

Every mutation (create/delete plan, rename, toggle/delete/add/edit todo, AI response) fires the appropriate API route optimistically — React state is updated first, then the fetch is dispatched.

### AI agent 3-phase workflow

Call 1 (the conversation) drives a state machine via a control token:
1. **Phase 1 `<<<ASKING>>>`** — gather goal details (Markdown questions)
2. **Phase 2 `<<<PROPOSED>>>`** — show plan as Markdown table, await approval
3. **Phase 3 `<<<CONFIRMED>>>`** — a short Markdown confirmation of what changed; also triggered directly for modifications to an existing plan (add/edit/remove/reschedule tasks)

Call 1 **never emits JSON**. When it reaches Phase 3, `handleSendMessage` fires **Call 2** (`buildPlanInstruction`), which returns the full todos JSON. This is the only call that produces plan data.

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
- **`TodoDetails`** — drawer (shadcn-style, built on `vaul`) for editing a single todo (title, priority, due date/time, location, steps, notes); right-side panel on `md:`+, bottom sheet with drag handle on mobile; portaled with dimmed overlay, closes via Esc, overlay click, or drag-to-dismiss
- **`LocationPicker`** — location field inside `TodoDetails`: Places autocomplete + embedded Google Map (`@vis.gl/react-google-maps`); lazily geocodes plain-text locations (e.g. set by the AI), click-to-move pin with reverse geocoding; falls back to a plain text input when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is unset. AI-emitted coordinates are never trusted — `reconcileTodos` resets coords whenever the location text changes.
- **`CalendarView`** — monthly grid + all-tasks list; todos sorted by `dueDate + dueTime` within each day; `TodoMap` rendered below the grid
- **`TodoMap`** — Google Map plotting every todo that has coordinates; pins colored by priority (gray when completed), click selects the todo. Auto-fit bounds track only *incomplete* pins (falling back to all pins when every located task is done), so completing a todo re-fits the view around the remaining active tasks with an eased camera animation (disabled under `prefers-reduced-motion`). Renders nothing without `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
