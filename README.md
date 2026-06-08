# AI Todo

An AI-powered task planning app built with Next.js. Chat with an AI agent to break down goals into actionable tasks, schedule them with due dates and times, and manage them across multiple plans. Data is persisted in PostgreSQL and access is protected by user authentication.

## Features

- **AI planning assistant** — describe a goal and the AI proposes a structured plan with tasks, priorities, due dates, and times
- **Iterative chat** — each plan has its own persistent chat thread; continue the conversation to add, edit, reschedule, or remove tasks
- **Task details** — per-task notes, sub-steps with progress tracking, priority flags, due date + time
- **Calendar view** — monthly grid showing all tasks across plans, sorted by time within each day
- **Completed tasks are locked** — tasks you check off are never modified by the AI
- **Persistent storage** — all plans, tasks, and chat history are saved in PostgreSQL
- **User authentication** — each user has their own private plans; login and registration via NextAuth

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
```

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The database tables are created automatically on the first request.

## Usage

1. **Register** — create an account on the `/register` page; you are signed in automatically
2. **Create a plan** — click **New Plan** in the sidebar
3. **Chat with the AI** — describe your goal in the chat panel; the AI will ask clarifying questions, propose a plan for review, then create the tasks once you confirm
4. **Edit tasks manually** — click any task to open the details panel and edit the title, priority, due date/time, steps, or notes
5. **Update via chat** — send follow-up messages in the same chat to add, remove, or reschedule tasks; the AI will update only the incomplete ones
6. **Calendar** — switch to the Calendar view from the sidebar to see all tasks across plans on a monthly grid
7. **Sign out** — click the arrow icon next to your name in the sidebar footer

## Tech Stack

- **Next.js 15** with App Router and TypeScript
- **React 19**
- **Tailwind CSS**
- **NextAuth v5** (Auth.js) for authentication with JWT sessions
- **PostgreSQL** via the `pg` driver for persistent storage
- **bcryptjs** for password hashing
- **DeepSeek API** (via the `openai` npm package with a custom `baseURL`)
- **GSAP** for task entry animations
- **react-markdown** + **remark-gfm** for rendering AI responses

## Project Structure

```
app/
  page.tsx                        # root page, composes all views
  login/page.tsx                  # login form
  register/page.tsx               # registration form
  providers.tsx                   # SessionProvider wrapper
  api/
    auth/
      [...nextauth]/route.ts      # NextAuth route handler
      register/route.ts           # user registration endpoint
    chat/route.ts                 # calls DeepSeek
    plans/
      route.ts                    # GET all plans, POST create plan
      [id]/route.ts               # PUT rename, DELETE plan
      [id]/todos/route.ts         # PUT bulk-replace todos
      [id]/todos/[todoId]/route.ts# PATCH single todo, DELETE
      [id]/chat/route.ts          # POST append chat messages
auth.config.ts                    # Edge-compatible NextAuth config (middleware)
auth.ts                           # full NextAuth config with Credentials provider
middleware.ts                     # route protection — redirects to /login
components/
  Sidebar.tsx                     # plan navigation + user info + sign out
  TodoList.tsx                    # task list for the active plan
  ChatPanel.tsx                   # AI chat interface
  TodoDetails.tsx                 # slide-over task editor
  CalendarView.tsx                # monthly calendar + all-tasks list
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
users          id, name, email, password, created_at
plans          id, title, user_id → users, created_at
todos          id, plan_id → plans, text, completed, notes, due_date, due_time, priority, sort_order
steps          id, todo_id → todos, text, completed, sort_order
chat_messages  id, plan_id → plans, role, text, created_at
```
