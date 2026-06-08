# AI Todo

An AI-powered task planning app built with Next.js. Chat with an AI agent to break down goals into actionable tasks, schedule them with due dates and times, and manage them across multiple plans.

## Features

- **AI planning assistant** — describe a goal and the AI proposes a structured plan with tasks, priorities, due dates, and times
- **Iterative chat** — each plan has its own persistent chat thread; continue the conversation to add, edit, reschedule, or remove tasks
- **Task details** — per-task notes, sub-steps with progress tracking, priority flags, due date + time
- **Calendar view** — monthly grid showing all tasks across plans, sorted by time within each day
- **Completed tasks are locked** — tasks you check off are never modified by the AI

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure your API key

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your [DeepSeek API key](https://platform.deepseek.com):

```
DEEPSEEK_API_KEY=sk-your-key-here
DEEPSEEK_MODEL=deepseek-chat
```

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. **Create a plan** — click **New Plan** in the sidebar
2. **Chat with the AI** — describe your goal in the chat panel; the AI will ask clarifying questions, propose a plan for review, then create the tasks once you confirm
3. **Edit tasks manually** — click any task to open the details panel and edit the title, priority, due date/time, steps, or notes
4. **Update via chat** — send follow-up messages in the same chat to add, remove, or reschedule tasks; the AI will update only the incomplete ones
5. **Calendar** — switch to the Calendar view from the sidebar to see all tasks across plans on a monthly grid

## Tech Stack

- **Next.js 15** with App Router and TypeScript
- **React 19**
- **Tailwind CSS**
- **DeepSeek API** (via the `openai` npm package with a custom `baseURL`)
- **GSAP** for task entry animations
- **react-markdown** + **remark-gfm** for rendering AI responses

## Project Structure

```
app/
  page.tsx              # root page, composes all views
  api/chat/route.ts     # API route — calls DeepSeek
components/
  Sidebar.tsx           # plan navigation
  TodoList.tsx          # task list for the active plan
  ChatPanel.tsx         # AI chat interface
  TodoDetails.tsx       # slide-over task editor
  CalendarView.tsx      # monthly calendar + all-tasks list
hooks/
  usePlans.ts           # all state and AI agent logic
lib/
  api.ts                # fetch wrapper for /api/chat
  utils.ts              # shared helpers
types/
  index.ts              # Todo, Plan, Step, Priority types
```

> **Note:** There is no database. All data lives in React state and is lost on page reload.
