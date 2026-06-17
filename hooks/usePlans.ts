'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { Plan, Todo, TodoWithPlan, MyDaySuggestion } from '@/types';
import { generateId } from '@/lib/utils';
import {
  callChatStream,
  generatePlanDelta,
  generateSuggestions,
  type ApiMessage,
} from '@/lib/api';
import type { PlanDelta, UpsertTodo } from '@/lib/schemas';

// ---------------------------------------------------------------------------
// Agent System Instructions
//
// The agent runs as TWO separate calls so each output stays single-purpose:
//   1. buildChatInstruction → the conversational reply shown to the user
//      (Markdown only, NEVER JSON). It decides the phase via a control token.
//   2. buildPlanInstruction → invoked only when the chat phase is CONFIRMED;
//      returns the plan as JSON ONLY (no prose), which becomes the todo data.
// ---------------------------------------------------------------------------
function planContext(activePlan: Plan, allPlans: Plan[]) {
  const today = new Date().toISOString().split('T')[0];
  const completedCount = allPlans.flatMap((p) => p.todos.filter((t) => t.completed)).length;
  const pendingCount = allPlans.flatMap((p) => p.todos.filter((t) => !t.completed)).length;
  const overdueCount = allPlans.flatMap((p) =>
    p.todos.filter((t) => !t.completed && t.dueDate && t.dueDate < today)
  ).length;
  const incompleteTodos = activePlan.todos.filter((t) => !t.completed);
  const completedTodos = activePlan.todos.filter((t) => t.completed);
  return { today, completedCount, pendingCount, overdueCount, incompleteTodos, completedTodos };
}

// Renders the user's saved personal context as a prompt section, or '' when empty.
// Injected into every AI call so plans are tailored to the user's life (home base,
// schedule, preferences, constraints) without them repeating it each conversation.
function personalContextSection(personalContext: string): string {
  const trimmed = personalContext.trim();
  if (!trimmed) return '';
  return `
# About the user (personal context they provided)
Use this to tailor the plan — infer locations, realistic timing, and constraints from it. Never contradict it. Do not repeat it back verbatim unless relevant.
${trimmed}

---
`;
}

// Call 1 — conversation. Markdown only, never JSON.
function buildChatInstruction(activePlan: Plan, allPlans: Plan[], personalContext: string): string {
  const { today, completedCount, pendingCount, overdueCount, incompleteTodos, completedTodos } =
    planContext(activePlan, allPlans);
  const hasExistingTodos = incompleteTodos.length > 0 || completedTodos.length > 0;
  // Compact task view — enough to converse about, without the full notes/steps.
  const compact = incompleteTodos.map((t) => ({
    id: t.id, text: t.text, dueDate: t.dueDate, dueTime: t.dueTime, priority: t.priority, location: t.location,
  }));

  return `
# Role
You are a persistent, empathetic Planning Assistant embedded in an AI Todo app.
Each plan has its own dedicated chat. The conversation history you receive IS the full history of this plan's chat — use it as context.
Always match the user's language. Reply in clean Markdown.
NEVER output JSON or code blocks — a separate system step converts the plan into data. Your job is only to talk to the user.

# Current Date: ${today}
# Global Stats: ${completedCount} tasks completed · ${pendingCount} pending · ${overdueCount} overdue

---
${personalContextSection(personalContext)}
# ACTIVE PLAN: "${activePlan.title}"

## Current incomplete tasks:
${compact.length > 0 ? JSON.stringify(compact, null, 2) : '(none yet — plan is empty)'}

## Completed tasks: ${completedTodos.length} done and locked — never reopen, re-list, or re-create them.

---

# Workflow
Output EXACTLY ONE control token on its own final line at the end of EVERY reply.

## Phase 1 → \`<<<ASKING>>>\`
**Trigger:** User states a vague new goal without enough detail.
**Action:** Ask 1–3 focused questions (timeline, constraints, outcomes, and — when tasks happen at physical places — where, e.g. which gym, store, or venue). Markdown text only.

## Phase 2 → \`<<<PROPOSED>>>\`
**Trigger:** You have enough context (goal + rough timeline + at least one constraint/priority).
**Action:** Present the proposed plan as a Markdown table (Task | Priority | Deadline | Time | Location | Brief Steps). Use "—" for empty locations. Ask: "Does this look good?" Adjust and re-propose on tweaks (stay in Phase 2).

## Phase 3 → \`<<<CONFIRMED>>>\`
**Trigger A:** User approves the Phase 2 proposal (e.g. "looks good", "go ahead", "yes").
**Trigger B:** ${hasExistingTodos
    ? 'The plan already has tasks AND the user asks for a direct modification — add/remove/reschedule/rename/reprioritise a task. SKIP Phases 1 & 2 and go straight here.'
    : 'User asks for a direct edit to an already-existing plan.'}
**Action:** Reply with ONE short, friendly sentence stating what you changed (e.g. "Done — moved the train to 8:00 and added the SSD to your shopping run."). The app regenerates the task list automatically.
**Do NOT** output the task list, a table, or JSON. **Do NOT** end with a colon or say "here is the plan".
**You MUST end the reply with the \`<<<CONFIRMED>>>\` token** — it is the ONLY signal that tells the app to apply the change. Forgetting it means the plan silently does not update. Whenever the user asks to add, remove, change, reschedule, rename, or reprioritise a task, you are in Phase 3 — confirm and emit \`<<<CONFIRMED>>>\`.
`.trim();
}

// Call 2 — plan generation. Returns a structured plan delta (the response shape
// is enforced by planDeltaSchema via the AI SDK's generateObject, so this prompt
// only has to describe the BEHAVIOUR, not the JSON format). Invoked only on CONFIRMED.
function buildPlanInstruction(activePlan: Plan, allPlans: Plan[], personalContext: string): string {
  const { today, incompleteTodos, completedTodos } = planContext(activePlan, allPlans);

  return `
# Role
You convert the conversation above into the plan's editable task list, emitting ONLY a DELTA (what changed this turn) — never the whole plan.

# Current Date: ${today}
${personalContextSection(personalContext)}
# ACTIVE PLAN: "${activePlan.title}"

## EDITABLE Todos — you MAY add, modify, reschedule, or remove any of these:
${incompleteTodos.length > 0 ? JSON.stringify(incompleteTodos, null, 2) : '(no incomplete tasks yet — plan is empty)'}

# Note: ${completedTodos.length} completed task(s) are intentionally hidden. They are locked and preserved automatically — do NOT output them.

# Rules — INCREMENTAL UPDATES ONLY
- "upsert" = ONLY the incomplete tasks that are NEW or that CHANGED in this turn. Include each such task in full.
- "remove" = ids of existing incomplete tasks the user asked to delete. Use [] if none.
- "planTitle" = include only to rename the plan; otherwise omit it.
- DO NOT re-send unchanged tasks — leave them out entirely; they are kept automatically. (Building a brand-new plan? Then every task is new, so upsert them all.)
- NEVER output completed tasks in either array — they are locked.
- When modifying an existing task, reuse its exact id and include the complete updated object (all fields), not just the changed field. Use a short random id for a brand-new task.
- steps: 3–7 specific steps per task; preserve existing step IDs and completed state.
- notes: always rich (purpose · steps · acceptance criteria · resources · blockers · estimated duration); never a single sentence or empty string.
- dueDate: YYYY-MM-DD or empty string. dueTime: HH:MM 24-hour or empty string — assign a realistic time of day.
- location: MUST be a place that Google Maps can find — a specific venue/business name (e.g. "PureGym Birmingham City Centre", "Trader Joe's Union Square") or a full street address. Plain text only, never coordinates.
  - NEVER use vague or relative terms that cannot be geocoded: do NOT write "家中", "家", "公司", "办公室", "home", "my house", "the office", "online", "anywhere", "TBD", or similar. These produce a wrong map pin.
  - For a task done at home or at work: if the personal context above gives the user's real home/work address or city, use that actual address; if it does not, leave location as an EMPTY string rather than writing "home"/"家中".
  - Only set a location for tasks tied to a real physical place. Infer a plausible nearby place from the user's city/context, but never invent a specific venue the user hasn't hinted at — when unsure, prefer a full address or leave it empty.
  - Keep existing locations unless the user asked to change them; use an empty string when there is no physical place (e.g. phone calls, online, reading, thinking).
`.trim();
}

// ---------------------------------------------------------------------------
// Conversation reply helpers (Call 1 cleanup). The plan delta (Call 2) and My
// Day suggestions are now returned as validated JSON by the AI SDK's
// generateObject, so the old JSON extraction / salvage / parse helpers are gone.
// ---------------------------------------------------------------------------
type ControlToken = 'asking' | 'proposed' | 'confirmed' | null;

function stripControlToken(text: string): { text: string; token: ControlToken } {
  let token: ControlToken = null;
  if (/<<<\s*CONFIRMED\s*>>>/i.test(text)) token = 'confirmed';
  else if (/<<<\s*PROPOSED\s*>>>/i.test(text)) token = 'proposed';
  else if (/<<<\s*ASKING\s*>>>/i.test(text)) token = 'asking';
  const cleaned = text.replace(/<<<\s*(CONFIRMED|PROPOSED|ASKING|READY|TRUNCATED)\s*>>>/gi, '').trim();
  return { text: cleaned, token };
}

// When a reply ends with a colon lead-in to the JSON we strip out (e.g.
// "...以下是更新后的完整计划：" or "Here is the updated plan:"), that dangling
// sentence points at content the user never sees. Drop the trailing colon clause
// so the displayed message reads cleanly. The tasks themselves show in the list.
function trimTrailingLeadIn(text: string): string {
  const trimmed = text.trim();
  if (!/[:：]\s*$/.test(trimmed)) return trimmed;
  return trimmed.replace(/[^\n。．.!?！？]*[:：]\s*$/u, '').trim();
}

// Normalise one upserted task, restoring the client/server-owned fields the AI
// Vague / relative "locations" the AI sometimes emits that Google Maps cannot
// geocode into a meaningful pin (it would drop a pin on a random literal match).
// Matched as a whole string (case-insensitive, punctuation-trimmed) so real place
// names that merely contain these words — "Homebase Birmingham", "宜家家居" — are
// kept. The user's real home/work address (when known) is a proper address and is
// not in this set, so it passes through.
const NON_GEOCODABLE_LOCATIONS = new Set([
  'home', 'at home', 'my home', 'my house', 'house', 'house/home',
  'work', 'at work', 'the office', 'office', 'workplace', 'my office',
  'online', 'remote', 'anywhere', 'various', 'tbd', 'tba', 'n/a', 'na', 'none',
  '家', '家中', '在家', '家里', '公司', '在公司', '办公室', '线上', '网上', '在线', '远程', '任意地点', '无',
]);

// Drop locations that are not real, geocodable places so the map never shows a
// misplaced pin. Returns '' for a vague term, the trimmed value otherwise.
function sanitizeLocation(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const normalized = trimmed.toLowerCase().replace(/[.。!！?？,，;；:：]+$/u, '').trim();
  return NON_GEOCODABLE_LOCATIONS.has(normalized) ? '' : trimmed;
}

// never sees (coordinates, My Day, createdAt) from the existing copy when there
// is one. New tasks get fresh defaults.
function mergeUpsertTodo(up: UpsertTodo, existing: Todo | undefined): Todo {
  const rawLocation = typeof up.location === 'string' ? up.location : existing?.location ?? '';
  const location = sanitizeLocation(rawLocation);
  // Never trust AI-emitted coordinates: keep the stored ones while the location
  // text is unchanged, otherwise reset so the map re-geocodes.
  const keepCoords = !!existing && (existing.location ?? '') === location;
  // Todo/step ids are GLOBAL primary keys, but the AI emits terse ids ("t10"/"s1")
  // that repeat across plans and collide in the DB. So never persist an AI id:
  // keep an existing todo's real id (an in-place update), but mint a fresh UUID
  // for a brand-new todo and for every step of an upserted task (the AI re-sends a
  // task's full step list on each change, carrying the completed flag by value).
  const id = existing?.id ?? generateId();
  const steps = (up.steps ?? []).map((s) => ({
    id: generateId(),
    text: s.text,
    completed: s.completed ?? false,
  }));
  return {
    ...up,
    id,
    completed: false, // upserts only ever touch incomplete tasks
    steps,
    dueTime: up.dueTime ?? '',
    location,
    locationLat: keepCoords ? existing!.locationLat ?? null : null,
    locationLng: keepCoords ? existing!.locationLng ?? null : null,
    myDay: existing?.myDay ?? false,
    myDayOrder: existing?.myDayOrder ?? 0,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
}

// Apply an incremental delta (upsert + remove) from the AI against the LATEST
// plan state (`base`), not the snapshot taken when the message was sent. Only the
// tasks the AI names are touched; everything else is preserved untouched —
// completed/locked tasks AND incomplete tasks the user edited, added, or is
// otherwise mutating concurrently. This sidesteps the "stale AI array clobbers
// concurrent edits" bug by construction: we never rewrite the whole list.
//   base     = the current live todos (read inside the setPlans updater)
//   knownIds = ids the AI saw at send time (so a task the user deleted
//              mid-request is not resurrected as a "new" upsert)
function applyTodoDelta(
  upsert: UpsertTodo[],
  remove: string[],
  base: Todo[],
  knownIds: Set<string>
): Todo[] {
  const removeSet = new Set(remove);
  const upsertById = new Map(upsert.map((t) => [t.id, t]));

  const result: Todo[] = [];
  for (const existing of base) {
    // Completed tasks are sacred — the AI never sees them and can't modify or
    // delete them, regardless of what it emitted.
    if (existing.completed) {
      result.push(existing);
      continue;
    }
    if (removeSet.has(existing.id)) continue; // user-approved deletion
    const up = upsertById.get(existing.id);
    if (up) {
      result.push(mergeUpsertTodo(up, existing));
      upsertById.delete(existing.id);
    } else {
      result.push(existing); // unchanged — kept verbatim, never re-sent by the AI
    }
  }

  // Leftover upserts are brand-new tasks — unless the id was in the AI's snapshot
  // but is gone from base, which means the user deleted it mid-request; don't
  // resurrect it.
  for (const [id, up] of upsertById) {
    if (knownIds.has(id)) continue;
    result.push(mergeUpsertTodo(up, undefined));
  }

  // Both todo ids AND step ids are GLOBAL primary keys in the DB, but the AI
  // routinely emits terse ids like "t10"/"s1" that collide — with each other
  // across tasks, or with ids already in the plan (e.g. "add more tasks" makes it
  // re-number from "t10" onto an existing "t10"). A single such clash made the
  // bulk save throw a duplicate-key error and roll back the WHOLE write, so the
  // plan vanished on refresh. Give every todo and every step a globally-unique id
  // before persist: keep the first occurrence and regenerate any later duplicate
  // (or blank id). Only the colliding objects are cloned, preserving referential
  // stability for untouched tasks.
  const seenTodoIds = new Set<string>();
  const seenStepIds = new Set<string>();
  return result.map((todo) => {
    let id = todo.id;
    if (!id || seenTodoIds.has(id)) id = generateId();
    seenTodoIds.add(id);

    let stepsChanged = false;
    const steps = (todo.steps ?? []).map((s) => {
      let sid = s.id;
      if (!sid || seenStepIds.has(sid)) sid = generateId();
      seenStepIds.add(sid);
      if (sid === s.id) return s;
      stepsChanged = true;
      return { ...s, id: sid };
    });

    if (id === todo.id && !stepsChanged) return todo;
    return { ...todo, id, steps };
  });
}

// Filter raw suggestions down to valid, unique task ids (the AI may name a task
// that was completed/deleted between the request and the reply). Returns the
// `{ id, reason }` shape stored in `suggestionRaw`.
function filterSuggestions(
  raw: { id: string; reason: string }[],
  validIds: Set<string>
): { id: string; reason: string }[] {
  const seen = new Set<string>();
  const out: { id: string; reason: string }[] = [];
  for (const item of raw) {
    const id = String(item?.id ?? '');
    if (!id || !validIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, reason: typeof item.reason === 'string' ? item.reason.trim() : '' });
  }
  return out;
}

// ---------------------------------------------------------------------------
// DB persistence helpers
// ---------------------------------------------------------------------------
function persistTodos(planId: string, todos: Todo[]) {
  fetch(`/api/plans/${planId}/todos`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ todos }),
  }).catch(console.error);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function usePlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // The user's saved personal context, injected into every AI call so plans are
  // tailored to them. Loaded on mount and refreshed when the window regains focus
  // (the user may have just edited it on the profile page).
  const [personalContext, setPersonalContext] = useState('');
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [typingPlanIds, setTypingPlanIds] = useState<Record<string, boolean>>({});
  // True only while Call 2 (plan JSON generation) is running for a plan. Editing
  // the plan's todos is locked during this window; the conversation phase (Call 1)
  // leaves it false so the user can keep editing while just chatting.
  const [updatingPlanIds, setUpdatingPlanIds] = useState<Record<string, boolean>>({});
  const [streamingTexts, setStreamingTexts] = useState<Record<string, string>>({});
  const [newTaskText, setNewTaskText] = useState('');
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editedTitle, setEditedTitle] = useState('');
  const [aiAddedTodoIds, setAiAddedTodoIds] = useState<string[]>([]);
  const pendingProposalRef = useRef<Record<string, boolean>>({});
  // My Day AI suggestions — stored as raw {id, reason}; the display list is derived
  // from live todos so completed/added/deleted tasks drop out automatically.
  const [suggestionRaw, setSuggestionRaw] = useState<{ id: string; reason: string }[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false);
  const suggestionsInFlight = useRef(false);

  // Fetch all plans from the database and merge into state. Used on mount and by
  // pull-to-refresh. Preserves the current active plan when it still exists,
  // otherwise falls back to the first visible (non-"My Day") plan.
  const loadPlans = useCallback(async () => {
    const r = await fetch('/api/plans');
    if (!r.ok) throw new Error(`GET /api/plans failed: ${r.status}`);
    const data: Plan[] = await r.json();
    if (!Array.isArray(data)) return;
    setPlans(data);
    setActivePlanId((cur) => {
      // Never default the active plan to the hidden "My Day" backing plan.
      const visible = data.filter((p) => !p.isMyDay);
      if (cur && visible.some((p) => p.id === cur)) return cur;
      return visible[0]?.id ?? cur;
    });
  }, []);

  // Load all plans from the database on mount
  useEffect(() => {
    loadPlans()
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [loadPlans]);

  // Load the user's personal context on mount, and re-load when the tab regains
  // focus so an edit made on the profile page is picked up without a full reload.
  useEffect(() => {
    const loadContext = () => {
      fetch('/api/profile/context')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && typeof data.personalContext === 'string') {
            setPersonalContext(data.personalContext);
          }
        })
        .catch(console.error);
    };
    loadContext();
    window.addEventListener('focus', loadContext);
    return () => window.removeEventListener('focus', loadContext);
  }, []);

  // Re-fetch plans on demand (pull-to-refresh). Swallows errors so the pull
  // indicator always resolves, and holds the spinner briefly so a near-instant
  // refresh still reads as one.
  const refreshPlans = useCallback(async () => {
    const started = Date.now();
    try {
      await loadPlans();
    } catch (e) {
      console.error('[usePlans] refreshPlans failed:', e);
    }
    const elapsed = Date.now() - started;
    if (elapsed < 400) await new Promise((res) => setTimeout(res, 400 - elapsed));
  }, [loadPlans]);

  // --- Computed ---
  // The "My Day" backing plan is hidden from the regular plan list/picker.
  const visiblePlans = plans.filter((p) => !p.isMyDay);
  const activePlan = visiblePlans.find((p) => p.id === activePlanId) ?? visiblePlans[0] ?? null;
  const activeTodos = activePlan?.todos.filter((t) => !t.completed) ?? [];
  const completedTodos = activePlan?.todos.filter((t) => t.completed) ?? [];

  const allTodos: TodoWithPlan[] = plans.flatMap((p) =>
    p.todos.map((t) => ({ ...t, planId: p.id, planTitle: p.title }))
  );

  // "My Day" — every todo (across all plans) the user has flagged for today,
  // ordered by the user's manual My Day ordering (stable sort keeps the original
  // order among items that share a value, e.g. all-zero before any reorder).
  const myDayTodos: TodoWithPlan[] = allTodos
    .filter((t) => t.myDay)
    .sort((a, b) => (a.myDayOrder ?? 0) - (b.myDayOrder ?? 0));

  // Suggested tasks, resolved against current todos: a suggestion disappears once
  // the underlying task is completed, deleted, or already added to My Day.
  const myDaySuggestions: MyDaySuggestion[] = suggestionRaw
    .map((s) => {
      const todo = allTodos.find((t) => t.id === s.id);
      return todo ? { ...todo, reason: s.reason } : null;
    })
    .filter((x): x is MyDaySuggestion => !!x && !x.completed && !x.myDay);

  // Candidates not yet in My Day, for the non-AI suggestion lists.
  const myDayCandidates = allTodos.filter((t) => !t.completed && !t.myDay);

  // Tasks due within the next 3 days (or already overdue).
  const dueSoonCutoff = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  })();
  const dueSoonTodos: TodoWithPlan[] = myDayCandidates
    .filter((t) => t.dueDate && t.dueDate <= dueSoonCutoff)
    .sort((a, b) =>
      `${a.dueDate}T${a.dueTime || '00:00'}`.localeCompare(`${b.dueDate}T${b.dueTime || '00:00'}`)
    )
    .slice(0, 8);

  // Most recently created tasks (those without a timestamp sort last).
  const recentlyAddedTodos: TodoWithPlan[] = [...myDayCandidates]
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, 8);

  const sortedAllTodos = [...allTodos].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.dueDate && b.dueDate) {
      const aTs = new Date(`${a.dueDate}T${a.dueTime || '00:00'}`).getTime();
      const bTs = new Date(`${b.dueDate}T${b.dueTime || '00:00'}`).getTime();
      return aTs - bTs;
    }
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });

  const selectedTodo = allTodos.find((t) => t.id === selectedTodoId);

  useEffect(() => {
    setSelectedTodoId(null);
  }, [activePlanId]);

  // --- Plan Handlers ---
  const createPlan = () => {
    const newPlan: Plan = {
      id: generateId(),
      title: 'New Plan',
      todos: [],
      chat: [{ role: 'ai', text: "New plan created! Tell me your goal and I'll break it down using the SMART framework." }],
    };
    setPlans((prev) => [newPlan, ...prev]);
    setActivePlanId(newPlan.id);
    fetch('/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newPlan),
    }).catch(console.error);
  };

  const deletePlan = (id: string) => {
    setPlans((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (activePlanId === id) setActivePlanId(next[0]?.id ?? null);
      return next;
    });
    fetch(`/api/plans/${id}`, { method: 'DELETE' }).catch(console.error);
  };

  const updatePlanTitle = (id: string, newTitle: string) => {
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, title: newTitle } : p)));
    setEditingTitleId(null);
    fetch(`/api/plans/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    }).catch(console.error);
  };

  // --- Todo Helpers ---
  const findPlanByTodoId = (todoId: string) => plans.find((p) => p.todos.some((t) => t.id === todoId));

  const updateTodos = (planId: string, newTodos: Todo[]) => {
    setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, todos: newTodos } : p)));
  };

  // --- Todo Handlers ---
  const toggleTodo = (todoId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const plan = findPlanByTodoId(todoId);
    if (!plan) return;
    const todo = plan.todos.find((t) => t.id === todoId);
    if (!todo) return;
    const newCompleted = !todo.completed;
    // Mirror the server's completed_at stamping so "completed today" filters work
    // immediately, without waiting for a refetch.
    const completedAt = newCompleted ? new Date().toISOString() : null;
    updateTodos(plan.id, plan.todos.map((t) => (t.id === todoId ? { ...t, completed: newCompleted, completedAt } : t)));
    fetch(`/api/plans/${plan.id}/todos/${todoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: newCompleted }),
    }).catch(console.error);
  };

  const deleteTodo = (todoId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const plan = findPlanByTodoId(todoId);
    if (!plan) return;
    updateTodos(plan.id, plan.todos.filter((t) => t.id !== todoId));
    if (selectedTodoId === todoId) setSelectedTodoId(null);
    fetch(`/api/plans/${plan.id}/todos/${todoId}`, { method: 'DELETE' }).catch(console.error);
  };

  const addTodoManual = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || !newTaskText.trim() || !activePlan) return;
    const newTodo: Todo = {
      id: generateId(),
      text: newTaskText.trim(),
      completed: false,
      notes: '',
      dueDate: '',
      dueTime: '',
      priority: 'none',
      location: '',
      locationLat: null,
      locationLng: null,
      myDay: false,
      createdAt: new Date().toISOString(),
      steps: [],
    };
    const newTodos = [...activePlan.todos, newTodo];
    updateTodos(activePlan.id, newTodos);
    setNewTaskText('');
    persistTodos(activePlan.id, newTodos);
  };

  // Reorder the active (incomplete) tasks of a plan via drag-and-drop. The new
  // order is the array order, which the PUT route persists as sort_order (and GET
  // reads back ordered by it). Completed tasks keep their place at the end.
  const reorderTodos = (planId: string, orderedActiveIds: string[]) => {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    const byId = new Map(plan.todos.map((t) => [t.id, t]));
    const ordered = orderedActiveIds
      .map((id) => byId.get(id))
      .filter((t): t is Todo => !!t && !t.completed);
    const orderedSet = new Set(ordered.map((t) => t.id));
    // Keep anything the drag list didn't cover (completed tasks, plus any active
    // task missing from the payload) in its existing relative order.
    const rest = plan.todos.filter((t) => !orderedSet.has(t.id));
    const newTodos = [...ordered, ...rest];
    updateTodos(planId, newTodos);
    persistTodos(planId, newTodos);
  };

  // Reorder the My Day view (spans plans). Stamp each id with its new index as
  // myDayOrder in state, then persist the full order to the dedicated endpoint.
  const reorderMyDay = (orderedIds: string[]) => {
    const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
    setPlans((prev) =>
      prev.map((p) => ({
        ...p,
        todos: p.todos.map((t) =>
          orderMap.has(t.id) ? { ...t, myDayOrder: orderMap.get(t.id)! } : t
        ),
      }))
    );
    fetch('/api/todos/myday-order', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds }),
    }).catch(console.error);
  };

  const updateSelectedTodo = (updates: Partial<Todo>) => {
    if (!selectedTodoId) return;
    const plan = findPlanByTodoId(selectedTodoId);
    if (!plan) return;
    updateTodos(plan.id, plan.todos.map((t) => (t.id === selectedTodoId ? { ...t, ...updates } : t)));
    fetch(`/api/plans/${plan.id}/todos/${selectedTodoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).catch(console.error);
  };

  // --- My Day Handlers ---
  // Toggle whether an existing todo (in any plan) appears in the My Day view.
  const toggleMyDay = (todoId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const plan = findPlanByTodoId(todoId);
    if (!plan) return;
    const todo = plan.todos.find((t) => t.id === todoId);
    if (!todo) return;
    const newMyDay = !todo.myDay;
    updateTodos(plan.id, plan.todos.map((t) => (t.id === todoId ? { ...t, myDay: newMyDay } : t)));
    fetch(`/api/plans/${plan.id}/todos/${todoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ myDay: newMyDay }),
    }).catch(console.error);
  };

  // Ask the AI to review all pending (not-yet-in-My-Day) tasks and suggest which
  // belong on today's list. Idempotent while a request is in flight.
  const loadSuggestions = async () => {
    if (suggestionsInFlight.current) return;

    const candidates = allTodos.filter((t) => !t.completed && !t.myDay);
    if (candidates.length === 0) {
      setSuggestionRaw([]);
      setSuggestionsError(null);
      setSuggestionsLoaded(true);
      return;
    }

    suggestionsInFlight.current = true;
    setSuggestionsLoading(true);
    setSuggestionsError(null);

    try {
      const today = new Date().toISOString().split('T')[0];
      const compact = candidates.map((t) => ({
        id: t.id,
        text: t.text,
        plan: t.planTitle,
        dueDate: t.dueDate || null,
        dueTime: t.dueTime || null,
        location: t.location || null,
        priority: t.priority,
      }));

      const system = `You are a focused daily-planning assistant inside a todo app.
Today's date is ${today}.
${personalContextSection(personalContext)}The user message is a JSON array of their PENDING tasks (none are in "My Day" yet). Each task has: id, text, plan, dueDate, dueTime, location, priority.

Choose the tasks the user should focus on TODAY. Include two kinds of task:
A) Time-sensitive tasks, prioritised in this order:
   1. Overdue tasks (dueDate before today)
   2. Tasks due today
   3. High priority tasks
   4. Tasks due within the next 2–3 days
B) "Do it now" tasks — tasks with NO dueDate, NO dueTime, and NO location. These have no scheduling or place constraints, so the user can knock them out immediately. Include a few of these to fill the day.

Pick at most 6 tasks. Lead with the most time-sensitive ones, then add "do it now" tasks. Only skip a task when it is clearly scheduled for a later date AND not high priority.

Return the chosen tasks as { id, reason } entries, where "reason" is max 10 words on why it belongs today. If nothing is worth suggesting, return an empty list.`;

      const raw = await generateSuggestions([{ role: 'user', content: JSON.stringify(compact) }], system);
      const validIds = new Set(candidates.map((c) => c.id));
      setSuggestionRaw(filterSuggestions(raw, validIds));
      setSuggestionsLoaded(true);
    } catch (e) {
      console.error('[usePlans] loadSuggestions failed:', e);
      setSuggestionsError('Could not load suggestions. Please try again.');
    } finally {
      setSuggestionsLoading(false);
      suggestionsInFlight.current = false;
    }
  };

  const dismissSuggestion = (id: string) =>
    setSuggestionRaw((prev) => prev.filter((s) => s.id !== id));

  // --- Chat / Agent Handler ---
  // Append an AI message to a plan's chat, in state and in the DB.
  const appendAiMessage = (planId: string, text: string) => {
    setPlans((prev) =>
      prev.map((p) => (p.id === planId ? { ...p, chat: [...p.chat, { role: 'ai', text }] } : p))
    );
    fetch(`/api/plans/${planId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ role: 'ai', text }]),
    }).catch(console.error);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !activePlan) return;

    const userText = inputMessage.trim();
    const planId = activePlan.id;
    const currentTodos = activePlan.todos;
    setInputMessage('');

    setPlans((prev) =>
      prev.map((p) =>
        p.id === planId ? { ...p, chat: [...p.chat, { role: 'user', text: userText }] } : p
      )
    );
    setTypingPlanIds((prev) => ({ ...prev, [planId]: true }));
    setStreamingTexts((prev) => ({ ...prev, [planId]: '' }));

    const history: ApiMessage[] = [
      ...activePlan.chat.slice(1).map((msg) => ({
        role: (msg.role === 'ai' ? 'assistant' : 'user') as ApiMessage['role'],
        content: msg.text,
      })),
      { role: 'user', content: userText },
    ];

    // --- Call 1: conversational reply (Markdown only, never JSON) ---
    const chatInstruction = buildChatInstruction(activePlan, plans, personalContext);
    const rawReply = await callChatStream(history, chatInstruction, (chunk) => {
      flushSync(() => setStreamingTexts((prev) => ({ ...prev, [planId]: (prev[planId] ?? '') + chunk })));
    });
    setStreamingTexts((prev) => ({ ...prev, [planId]: '' }));

    const { text: chatText, token } = stripControlToken(rawReply);
    // Belt-and-suspenders: strip any stray code block / dangling lead-in the chat
    // model emits despite being told not to, so the user only sees clean Markdown.
    const aiText = trimTrailingLeadIn(chatText.replace(/```[\s\S]*?```/g, '').trim()) || 'Got it.';

    // Persist the user message + conversational reply, and show it immediately.
    setPlans((prev) =>
      prev.map((p) => (p.id === planId ? { ...p, chat: [...p.chat, { role: 'ai', text: aiText }] } : p))
    );
    fetch(`/api/plans/${planId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        { role: 'user', text: userText },
        { role: 'ai', text: aiText },
      ]),
    }).catch(console.error);

    // --- Call 2: generate the plan DELTA as JSON when the conversation hits a commit ---
    // Fire when:
    //  - the model emitted CONFIRMED, OR
    //  - the user approved a pending proposal (model may have dropped the token), OR
    //  - it's a modification to an existing plan (any reply that isn't a clarifying
    //    question or a fresh proposal).
    // The "just talk" chat model under-emits CONFIRMED, so the existing-plan
    // fallback is what makes edits to a populated plan actually land.
    const hasExistingTodos = currentTodos.length > 0;
    const shouldGenerate =
      token === 'confirmed' ||
      (token !== 'asking' &&
        token !== 'proposed' &&
        (!!pendingProposalRef.current[planId] || hasExistingTodos));
    pendingProposalRef.current[planId] = token === 'proposed';

    if (shouldGenerate) {
      // Lock plan editing while the JSON delta is generated — the UI shows
      // "AI is updating your plan." so the user can't race the AI's write.
      setUpdatingPlanIds((prev) => ({ ...prev, [planId]: true }));
      const planInstruction = buildPlanInstruction(activePlan, plans, personalContext);
      const planHistory: ApiMessage[] = [
        ...history,
        { role: 'assistant', content: chatText },
        { role: 'user', content: 'Now produce the plan delta (upsert + remove) following the rules exactly — only the incomplete tasks that are new or changed.' },
      ];

      // The server runs generateObject against planDeltaSchema, so the reply is
      // already validated, typed JSON — no extraction, salvage, or retry loop
      // needed (the AI SDK retries transient failures itself). A thrown/422
      // response means generation genuinely failed.
      let delta: PlanDelta | null = null;
      try {
        delta = await generatePlanDelta(planHistory, planInstruction);
      } catch (e) {
        console.error('[usePlans] plan delta generation failed:', e);
      } finally {
        setUpdatingPlanIds((prev) => ({ ...prev, [planId]: false }));
      }

      if (delta) {
        const aiUpsert = delta.upsert ?? [];
        const aiRemove = delta.remove ?? [];
        const planTitle = delta.planTitle?.trim() || null;
        const knownIds = new Set(currentTodos.map((t) => t.id));

        // flushSync forces the functional updater to run synchronously so
        // `committedTodos` is populated before we persist below. Without it the
        // updater is queued for a later render and `committedTodos` is still null
        // when persistTodos is reached — the AI update shows in the UI but never
        // reaches the DB, so it vanishes on refresh.
        let committedTodos: Todo[] | null = null;
        // Newly-added tasks, captured inside the updater for the entry animation:
        // applyTodoDelta mints fresh ids for new tasks, so the AI's terse ids
        // wouldn't match the rendered ones — derive from the committed todos.
        let addedIds: string[] = [];
        flushSync(() =>
          setPlans((prev) =>
            prev.map((p) => {
              if (p.id !== planId) return p;
              const todos = applyTodoDelta(aiUpsert, aiRemove, p.todos, knownIds);
              committedTodos = todos;
              addedIds = todos.filter((t) => !knownIds.has(t.id)).map((t) => t.id);
              return { ...p, ...(planTitle ? { title: planTitle } : {}), todos };
            })
          )
        );

        if (addedIds.length) setAiAddedTodoIds(addedIds);

        if (committedTodos) persistTodos(planId, committedTodos);
        if (planTitle) {
          fetch(`/api/plans/${planId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: planTitle }),
          }).catch(console.error);
        }
      } else {
        // Generation failed — tell the user honestly instead of silently no-op'ing.
        appendAiMessage(
          planId,
          "I couldn't generate the updated plan just now. Please ask me again, or rephrase the change."
        );
      }
    }

    setTypingPlanIds((prev) => ({ ...prev, [planId]: false }));
  };

  return {
    plans: visiblePlans,
    activePlan,
    activePlanId,
    setActivePlanId,
    activeTodos,
    completedTodos,
    allTodos,
    sortedAllTodos,
    myDayTodos,
    toggleMyDay,
    myDaySuggestions,
    dueSoonTodos,
    recentlyAddedTodos,
    suggestionsLoading,
    suggestionsError,
    suggestionsLoaded,
    loadSuggestions,
    dismissSuggestion,
    selectedTodo,
    selectedTodoId,
    setSelectedTodoId,
    inputMessage,
    setInputMessage,
    isTyping: !!typingPlanIds[activePlan?.id ?? ''],
    isUpdatingPlan: !!updatingPlanIds[activePlan?.id ?? ''],
    streamingText: streamingTexts[activePlan?.id ?? ''] ?? '',
    isLoading,
    newTaskText,
    setNewTaskText,
    editingTitleId,
    setEditingTitleId,
    editedTitle,
    setEditedTitle,
    refreshPlans,
    createPlan,
    deletePlan,
    updatePlanTitle,
    toggleTodo,
    deleteTodo,
    addTodoManual,
    reorderTodos,
    reorderMyDay,
    updateSelectedTodo,
    handleSendMessage,
    aiAddedTodoIds,
    clearAiAddedTodoIds: () => setAiAddedTodoIds([]),
  };
}
