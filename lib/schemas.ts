import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared Zod schemas for the AI SDK's `generateObject` calls. These enforce the
// structure that used to be coaxed out of free-text replies and hand-parsed on
// the client, so the route returns validated, typed JSON directly.
// ---------------------------------------------------------------------------

const stepSchema = z.object({
  id: z.string(),
  text: z.string(),
  completed: z.boolean(),
});

// One AI-writable task in the plan delta. Mirrors the editable fields of `Todo`
// (types/index.ts) — the client/server-owned fields (coordinates, myDay,
// createdAt, completed) are restored by `mergeUpsertTodo`, never sent by the AI.
export const upsertTodoSchema = z.object({
  id: z.string().describe('Reuse the existing id to MODIFY a task, or a short random id for a NEW one'),
  text: z.string().describe('Action-oriented title, max 60 chars'),
  notes: z.string().describe('Rich detail: purpose, steps, acceptance criteria, resources, blockers, estimated duration'),
  dueDate: z.string().describe('YYYY-MM-DD or empty string'),
  dueTime: z.string().describe('HH:MM 24-hour or empty string'),
  priority: z.enum(['high', 'medium', 'low', 'none']),
  location: z
    .string()
    .describe(
      'A Google-Maps-searchable place where the task happens: a specific venue/business name or a full street address. NEVER a vague/relative term like "home", "家中", "office", or "online" — use the user\'s real address from their personal context for at-home/at-work tasks, otherwise an empty string. Empty string when there is no physical place.'
    ),
  steps: z.array(stepSchema).describe('3-7 specific actionable steps'),
});

// Call 2 output — an incremental delta, never the whole plan.
export const planDeltaSchema = z.object({
  planTitle: z.string().nullish().describe('Include only to rename the plan'),
  upsert: z.array(upsertTodoSchema).describe('Only the incomplete tasks that are new or changed this turn'),
  remove: z.array(z.string()).describe('Ids of existing incomplete tasks to delete'),
});

// My Day suggestions. Wrapped in an object (rather than a bare array) because
// DeepSeek's JSON object mode produces an object reliably.
export const suggestionsSchema = z.object({
  suggestions: z.array(
    z.object({
      id: z.string(),
      reason: z.string().describe('Max 10 words on why it belongs today'),
    })
  ),
});

export type UpsertTodo = z.infer<typeof upsertTodoSchema>;
export type PlanDelta = z.infer<typeof planDeltaSchema>;
export type Suggestion = z.infer<typeof suggestionsSchema>['suggestions'][number];
