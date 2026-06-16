# AI Todo

**Live:** https://todo.promptnotfound.com

An AI-powered task planning app built with Next.js. Chat with an AI agent to break down goals into actionable tasks, schedule them with due dates and times, and manage them across multiple plans. Data is persisted in PostgreSQL and access is protected by user authentication.

## Features

- **AI planning assistant** — describe a goal and the AI proposes a structured plan with tasks, priorities, due dates, times, and locations
- **Personal context** — save your location, schedule, and preferences once on the Personal Context page; the AI receives it with every conversation so generated plans are tailored to you
- **Iterative chat** — each plan has its own persistent chat thread; continue the conversation to add, edit, reschedule, or remove tasks
- **My Day** — a daily focus view that gathers tasks you flag for today, with AI-picked suggestions; the completed list shows only tasks completed today
- **Task details** — per-task notes, sub-steps with progress tracking, priority flags, due date + time, location
- **Task locations** — attach a place to a task via Google Places autocomplete with an embedded map and click-to-move pin (falls back to plain text without an API key)
- **Calendar view** — monthly grid showing all tasks across plans, sorted by time within each day
- **Task map** — every located task plotted on a Google Map below the calendar, pins colored by priority; the view auto-fits around incomplete tasks
- **Completed tasks are locked** — tasks you check off are never sent to the AI, regenerated, or modified
- **Incremental updates** — when you change a plan via chat, the AI emits only the tasks that were added, edited, or removed; unchanged and completed tasks are preserved untouched (no full-plan regeneration)
- **Non-blocking editing** — keep editing tasks manually throughout the conversation; the task list locks (with an "AI is updating your plan" overlay) only for the brief moment the AI is writing its changes
- **Persistent storage** — all plans, tasks, and chat history are saved in PostgreSQL
- **User authentication** — each user has their own private plans; email/password registration or Google sign-in via NextAuth

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and fill in all values:

```
# DeepSeek API
DEEPSEEK_API_KEY=sk-your-key-here
DEEPSEEK_MODEL=deepseek-chat

# PostgreSQL
DATABASE_URL=postgresql://user:password@host:5432/ai_todo

# NextAuth — generate a secret with:
# node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
AUTH_SECRET=your_random_secret_here
NEXTAUTH_URL=http://localhost:3000

# Google OAuth — create at https://console.cloud.google.com/apis/credentials
# Authorized redirect URI: http://localhost:3000/api/auth/callback/google
AUTH_GOOGLE_ID=your_google_client_id_here
AUTH_GOOGLE_SECRET=your_google_client_secret_here

# Google Maps (optional) — create an API key at
# https://console.cloud.google.com/google/maps-apis/credentials
# Enable: Maps JavaScript API, Places API (New), Geocoding API
# Without it, todo locations fall back to plain text (no map / autocomplete)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The database tables are created automatically on the first request.

## Usage

1. **Register** — create an account on the `/register` page (or sign in with Google); you are signed in automatically
2. **Create a plan** — click **New Plan** in the sidebar
3. **Chat with the AI** — describe your goal in the chat panel; the AI will ask clarifying questions, propose a plan for review, then create the tasks once you confirm
4. **Edit tasks manually** — click any task to open the details panel and edit the title, priority, due date/time, location, steps, or notes; manual edits stay available while you chat and are only briefly locked while the AI applies its own changes
5. **Update via chat** — send follow-up messages in the same chat to add, remove, or reschedule tasks; the AI changes only the affected incomplete tasks and leaves completed and unchanged ones alone
6. **My Day** — open the **My Day** view from the sidebar to plan your day; flag tasks for today or use AI **Suggestions**, and track what you've completed today
7. **Calendar** — switch to the Calendar view from the sidebar to see all tasks across plans on a monthly grid, with located tasks plotted on a map below
8. **Personalise** — open the user menu in the sidebar footer and choose **Personal Context** to tell the AI about your location, schedule, and preferences for more tailored plans
9. **Profile & sign out** — open the user menu in the sidebar footer for your profile, personal context, or to sign out

## Tech Stack

- **Next.js 15** with App Router and TypeScript
- **React 19**
- **Tailwind CSS**
- **NextAuth v5** (Auth.js) for authentication with JWT sessions — Credentials + Google providers
- **PostgreSQL** via the `pg` driver for persistent storage
- **bcryptjs** for password hashing
- **DeepSeek API** (via the `openai` npm package with a custom `baseURL`)
- **@vis.gl/react-google-maps** for the location picker and task map
- **vaul** for the task details drawer (bottom sheet on mobile)
- **GSAP** for task entry animations
- **react-markdown** + **remark-gfm** for rendering AI responses

## Project Structure

```
app/
  page.tsx                        # public landing page
  dashboard/page.tsx              # main app — plans, tasks, chat, calendar
  login/page.tsx                  # login form
  register/page.tsx               # registration form
  profile/page.tsx                # account details, stats, name + password
  profile/context/page.tsx        # personal context editor (fed to the AI)
  providers.tsx                   # SessionProvider wrapper
  api/
    auth/
      [...nextauth]/route.ts      # NextAuth route handler
      register/route.ts           # user registration endpoint
    chat/route.ts                 # calls DeepSeek
    profile/
      route.ts                    # GET account details + stats, PATCH name
      password/route.ts           # PUT change password
      context/route.ts            # GET/PUT personal context
    plans/
      route.ts                    # GET all plans, POST create plan
      [id]/route.ts               # PUT rename, DELETE plan
      [id]/todos/route.ts         # PUT bulk-replace todos
      [id]/todos/[todoId]/route.ts# PATCH single todo, DELETE
      [id]/chat/route.ts          # POST append chat messages
auth.config.ts                    # Edge-compatible NextAuth config (middleware)
auth.ts                           # full NextAuth config with Credentials provider
middleware.ts                     # route protection — logged-out → /login, logged-in → /dashboard
components/
  Sidebar.tsx                     # plan navigation + user menu (profile / context / sign out)
  TodoList.tsx                    # task list for the active plan
  MyDayView.tsx                   # daily focus view + AI suggestions panel
  ChatPanel.tsx                   # AI chat interface
  TodoDetails.tsx                 # task editor drawer (side panel / mobile bottom sheet)
  LocationPicker.tsx              # Places autocomplete + map inside TodoDetails
  CalendarView.tsx                # monthly calendar + all-tasks list
  TodoMap.tsx                     # map of all located tasks, pins colored by priority
  ConfirmModal.tsx                # confirmation dialog for destructive actions
hooks/
  usePlans.ts                     # all state, AI agent logic, and DB persistence
lib/
  db.ts                           # pg connection pool + schema auto-init
  api.ts                          # fetch wrapper for /api/chat
  utils.ts                        # shared helpers
types/
  index.ts                        # Todo, Plan, Step, Priority types
```

## Database Schema

Tables are created automatically via `CREATE TABLE IF NOT EXISTS` on the first server request.

```
users          id, name, email, password (null for Google users), personal_context, created_at
plans          id, title, user_id → users, is_my_day, created_at
todos          id, plan_id → plans, text, completed, notes, due_date, due_time, priority,
               location, location_lat, location_lng, my_day, completed_at, created_at, sort_order
steps          id, todo_id → todos, text, completed, sort_order
chat_messages  id, plan_id → plans, role, text, created_at
```

New columns are added idempotently via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` on the first server request, so existing databases migrate automatically. `personal_context` holds the user's saved context that is sent to the AI; `completed_at` records when a task was checked off (used by My Day to show only today's completions).

## Deployment

The app is containerised and deployed via GitHub Actions to a self-hosted runner.

### GitHub Actions secrets required

| Secret | Description |
|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API key |
| `DEEPSEEK_MODEL` | Model name (defaults to `deepseek-chat`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Random base64 string for NextAuth session signing |
| `NEXTAUTH_URL` | Public URL of the app (e.g. `https://todo.promptnotfound.com`) |
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps API key (passed as a Docker build arg — it is inlined into the client bundle at build time) |

### Docker

The app uses a 3-stage Dockerfile (deps → builder → runner) with Next.js standalone output. A `docker-compose.yml` is provided for deployment. The container listens on port `3000` internally and is exposed on host port `6001`.

The compose file joins `1panel-network` so the app container can reach the 1Panel-managed PostgreSQL instance by its container hostname.
