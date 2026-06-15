'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { Plan, Todo, TodoWithPlan, MyDaySuggestion } from '@/types';
import { generateId } from '@/lib/utils';
import { callChat, callChatStream, type ApiMessage } from '@/lib/api';

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

// Call 1 — conversation. Markdown only, never JSON.
function buildChatInstruction(activePlan: Plan, allPlans: Plan[]): string {
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

// Call 2 — plan generation. JSON only, no prose. Invoked only on CONFIRMED.
function buildPlanInstruction(activePlan: Plan, allPlans: Plan[]): string {
  const { today, incompleteTodos, completedTodos } = planContext(activePlan, allPlans);

  return `
# Role
You convert the conversation above into the plan's editable task list as JSON. Output JSON ONLY — no prose, no Markdown, no code fences, no explanation.

# Current Date: ${today}

# ACTIVE PLAN: "${activePlan.title}"

## EDITABLE Todos — you MAY add, modify, reschedule, or remove any of these:
${incompleteTodos.length > 0 ? JSON.stringify(incompleteTodos, null, 2) : '(no incomplete tasks yet — plan is empty)'}

# Note: ${completedTodos.length} completed task(s) are intentionally hidden. They are locked and preserved automatically — do NOT output them.

# Output — emit ONLY a DELTA (what changed), not the whole plan. A SINGLE JSON object, nothing else:
{
  "planTitle": "optional — include only to rename the plan",
  "upsert": [
    {
      "id": "keep the existing ID to MODIFY a task, or a short random ID for a NEW one",
      "text": "Action-oriented title, max 60 chars",
      "notes": "Rich detail: purpose · steps · acceptance criteria · resources · blockers · estimated duration. Never empty.",
      "dueDate": "YYYY-MM-DD or empty string",
      "dueTime": "HH:MM 24-hour or empty string — assign a realistic time of day",
      "priority": "high | medium | low | none",
      "location": "Place name or address where the task happens (e.g. 'PureGym Birmingham City Centre'), or empty string",
      "steps": [
        { "id": "step-id", "text": "Specific actionable step", "completed": false }
      ]
    }
  ],
  "remove": ["id of an existing incomplete task to delete"]
}

# Rules — INCREMENTAL UPDATES ONLY
- "upsert" = ONLY the incomplete tasks that are NEW or that CHANGED in this turn. Include each such task in full.
- "remove" = ids of existing incomplete tasks the user asked to delete. Omit or use [] if none.
- DO NOT re-send unchanged tasks — leave them out entirely; they are kept automatically. (Building a brand-new plan? Then every task is new, so upsert them all.)
- NEVER output completed tasks in either array — they are locked.
- When modifying an existing task, reuse its exact id and include the complete updated object (all fields), not just the changed field.
- No placeholders, no truncation (no \`//...\`), no comments.
- steps: 3–7 specific steps per task; preserve existing step IDs and completed state.
- notes: always rich; never a single sentence or empty string.
- location: plain text only, never coordinates. Propose one for tasks tied to a real physical place; infer from context but never invent a specific venue the user hasn't hinted at. Keep existing locations unless the user asked to change them; empty string when there is no physical place.
`.trim();
}

// ---------------------------------------------------------------------------
// Response parsing helpers
// ---------------------------------------------------------------------------
interface PlanUpdate {
  text: string;
  // Incomplete tasks to add or modify. null ONLY when nothing parseable was
  // recovered (treated as a generation failure by the caller).
  upsert: Todo[] | null;
  // Ids of incomplete tasks to delete.
  remove: string[];
  planTitle: string | null;
}

type ControlToken = 'asking' | 'proposed' | 'confirmed' | null;

function stripControlToken(text: string): { text: string; token: ControlToken } {
  let token: ControlToken = null;
  if (/<<<\s*CONFIRMED\s*>>>/i.test(text)) token = 'confirmed';
  else if (/<<<\s*PROPOSED\s*>>>/i.test(text)) token = 'proposed';
  else if (/<<<\s*ASKING\s*>>>/i.test(text)) token = 'asking';
  const cleaned = text.replace(/<<<\s*(CONFIRMED|PROPOSED|ASKING|READY|TRUNCATED)\s*>>>/gi, '').trim();
  return { text: cleaned, token };
}

// Pull a JSON payload out of a model reply. Prefer a fenced ```json block, but
// fall back to the outermost { } / [ ] span so a reply that emits raw, unfenced
// JSON still parses. (A truncated reply with no closing fence/brace yields no
// parseable block — that's handled as a failure by the caller.)
function extractJsonBlock(responseText: string): { jsonText: string; textWithout: string } | null {
  const fenced = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    return { jsonText: fenced[1], textWithout: responseText.replace(fenced[0], '').trim() };
  }
  const objStart = responseText.indexOf('{');
  const arrStart = responseText.indexOf('[');
  let start = -1;
  let endChar = '';
  if (objStart !== -1 && (arrStart === -1 || objStart < arrStart)) {
    start = objStart;
    endChar = '}';
  } else if (arrStart !== -1) {
    start = arrStart;
    endChar = ']';
  }
  if (start === -1) return null;
  const end = responseText.lastIndexOf(endChar);
  if (end <= start) return null;
  return {
    jsonText: responseText.slice(start, end + 1),
    textWithout: (responseText.slice(0, start) + responseText.slice(end + 1)).trim(),
  };
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

// Best-effort recovery when the model's JSON is truncated mid-array (the
// `finish_reason === 'length'` case that produced the "Expected ',' or ']'"
// SyntaxError). Pulls every COMPLETE `{...}` object out of the named array,
// ignoring a dangling partial final element, so a cut-off response still applies
// the tasks that did come through instead of failing wholesale.
function salvageObjectArray(text: string, key: string): Record<string, unknown>[] {
  const keyMatch = text.search(new RegExp('"' + key + '"\\s*:\\s*\\['));
  if (keyMatch === -1) return [];
  let i = text.indexOf('[', keyMatch) + 1;
  const objects: Record<string, unknown>[] = [];
  while (i < text.length) {
    while (i < text.length && /[\s,]/.test(text[i])) i++; // skip whitespace / commas
    if (i >= text.length || text[i] === ']') break;
    if (text[i] !== '{') break;
    let depth = 0;
    let inStr = false;
    let esc = false;
    const start = i;
    for (; i < text.length; i++) {
      const c = text[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) { i++; break; }
    }
    if (depth !== 0) break; // final object was truncated — stop here
    try {
      objects.push(JSON.parse(text.slice(start, i)));
    } catch {
      break;
    }
  }
  return objects;
}

// Extract the delta (upsert / remove / planTitle) from a model reply. No
// reconciliation happens here — that is deliberately deferred to applyTodoDelta
// at commit time so it can run against the LATEST plan state, not a stale
// send-time snapshot.
function parsePlanUpdate(responseText: string): PlanUpdate {
  const block = extractJsonBlock(responseText);
  if (!block) return { text: responseText, upsert: null, remove: [], planTitle: null };

  const sanitized = block.jsonText
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  let upsert: Todo[] | null = null;
  let remove: string[] = [];
  let planTitle: string | null = null;

  try {
    const parsed = JSON.parse(sanitized);
    if (Array.isArray(parsed)) {
      upsert = parsed as Todo[];
    } else if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.upsert)) upsert = parsed.upsert as Todo[];
      else if (Array.isArray(parsed.todos)) upsert = parsed.todos as Todo[]; // tolerate legacy full-array replies
      if (Array.isArray(parsed.remove)) remove = parsed.remove.map(String);
      if (typeof parsed.planTitle === 'string' && parsed.planTitle.trim()) {
        planTitle = parsed.planTitle.trim();
      }
    }
  } catch {
    // Truncated / malformed JSON — salvage every complete task that arrived
    // before the cut-off rather than discarding the whole update.
    const salvaged = salvageObjectArray(sanitized, 'upsert');
    if (salvaged.length) upsert = salvaged as unknown as Todo[];
    const titleMatch = sanitized.match(/"planTitle"\s*:\s*"([^"]+)"/);
    if (titleMatch) planTitle = titleMatch[1].trim();
    if (upsert) {
      console.warn(`[usePlans] Recovered ${upsert.length} task(s) from truncated JSON.`);
    } else {
      console.error('[usePlans] Failed to parse AI JSON block:\nRaw block:', block.jsonText);
    }
  }

  // A JSON block was present — clean any dangling "here is the plan:" lead-in.
  const hasJson = upsert !== null || planTitle !== null;
  return {
    text: hasJson ? trimTrailingLeadIn(block.textWithout) : block.textWithout,
    upsert,
    remove,
    planTitle,
  };
}

// Normalise one upserted task, restoring the client/server-owned fields the AI
// never sees (coordinates, My Day, createdAt) from the existing copy when there
// is one. New tasks get fresh defaults.
function mergeUpsertTodo(up: Todo, existing: Todo | undefined): Todo {
  const location = typeof up.location === 'string' ? up.location : existing?.location ?? '';
  // Never trust AI-emitted coordinates: keep the stored ones while the location
  // text is unchanged, otherwise reset so the map re-geocodes.
  const keepCoords = !!existing && (existing.location ?? '') === location;
  return {
    ...up,
    completed: false, // upserts only ever touch incomplete tasks
    steps: up.steps ?? [],
    dueTime: up.dueTime ?? '',
    location,
    locationLat: keepCoords ? existing!.locationLat ?? null : null,
    locationLng: keepCoords ? existing!.locationLng ?? null : null,
    myDay: existing?.myDay ?? false,
    createdAt: existing?.createdAt ?? up.createdAt ?? new Date().toISOString(),
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
  upsert: Todo[],
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
  return result;
}

// ---------------------------------------------------------------------------
// My Day suggestion parsing
// ---------------------------------------------------------------------------
interface RawSuggestion {
  id: string;
  reason: string;
}

// The model is asked for a bare JSON array, but tolerate code fences / surrounding prose.
function parseSuggestions(responseText: string, validIds: Set<string>): RawSuggestion[] {
  let jsonText = responseText.trim();
  const block = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (block) {
    jsonText = block[1].trim();
  } else {
    const start = jsonText.indexOf('[');
    const end = jsonText.lastIndexOf(']');
    if (start !== -1 && end > start) jsonText = jsonText.slice(start, end + 1);
  }

  try {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: RawSuggestion[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const id = String((item as { id?: unknown }).id ?? '');
      if (!id || !validIds.has(id) || seen.has(id)) continue;
      seen.add(id);
      const reason = (item as { reason?: unknown }).reason;
      out.push({ id, reason: typeof reason === 'string' ? reason.trim() : '' });
    }
    return out;
  } catch (e) {
    console.error('[usePlans] Failed to parse suggestions JSON:', e, '\nRaw:', responseText);
    return [];
  }
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
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [typingPlanIds, setTypingPlanIds] = useState<Record<string, boolean>>({});
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

  // "My Day" — every todo (across all plans) the user has flagged for today.
  const myDayTodos: TodoWithPlan[] = allTodos.filter((t) => t.myDay);

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
    updateTodos(plan.id, plan.todos.map((t) => (t.id === todoId ? { ...t, completed: newCompleted } : t)));
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
The user message is a JSON array of their PENDING tasks (none are in "My Day" yet). Each task has: id, text, plan, dueDate, dueTime, location, priority.

Choose the tasks the user should focus on TODAY. Include two kinds of task:
A) Time-sensitive tasks, prioritised in this order:
   1. Overdue tasks (dueDate before today)
   2. Tasks due today
   3. High priority tasks
   4. Tasks due within the next 2–3 days
B) "Do it now" tasks — tasks with NO dueDate, NO dueTime, and NO location. These have no scheduling or place constraints, so the user can knock them out immediately. Include a few of these to fill the day.

Pick at most 6 tasks. Lead with the most time-sensitive ones, then add "do it now" tasks. Only skip a task when it is clearly scheduled for a later date AND not high priority.

Respond with ONLY a JSON array, no prose and no code fences:
[{ "id": "<task id>", "reason": "<max 10 words on why it belongs today>" }]
If nothing is worth suggesting, respond with exactly: []`;

      const raw = await callChat([{ role: 'user', content: JSON.stringify(compact) }], system);
      const validIds = new Set(candidates.map((c) => c.id));
      setSuggestionRaw(parseSuggestions(raw, validIds));
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
    const chatInstruction = buildChatInstruction(activePlan, plans);
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
      const planInstruction = buildPlanInstruction(activePlan, plans);
      const planHistory: ApiMessage[] = [
        ...history,
        { role: 'assistant', content: chatText },
        { role: 'user', content: 'Now output ONLY the delta (upsert + remove) as JSON, following the schema and rules exactly. Only the incomplete tasks that are new or changed. No prose, no code fences.' },
      ];

      let parsed: PlanUpdate = { text: '', upsert: null, remove: [], planTitle: null };
      let wasTruncated = false;
      for (let attempt = 0; attempt < 3 && !parsed.upsert; attempt++) {
        const rawJson = await callChat(planHistory, planInstruction);
        if (/<<<\s*TRUNCATED\s*>>>/i.test(rawJson)) wasTruncated = true;
        parsed = parsePlanUpdate(stripControlToken(rawJson).text);
      }

      if (parsed.upsert) {
        const aiUpsert = parsed.upsert;
        const aiRemove = parsed.remove;
        const planTitle = parsed.planTitle;
        const knownIds = new Set(currentTodos.map((t) => t.id));

        // flushSync forces the functional updater to run synchronously so
        // `committedTodos` is populated before we persist below. Without it the
        // updater is queued for a later render and `committedTodos` is still null
        // when persistTodos is reached — the AI update shows in the UI but never
        // reaches the DB, so it vanishes on refresh.
        let committedTodos: Todo[] | null = null;
        flushSync(() =>
          setPlans((prev) =>
            prev.map((p) => {
              if (p.id !== planId) return p;
              const todos = applyTodoDelta(aiUpsert, aiRemove, p.todos, knownIds);
              committedTodos = todos;
              return { ...p, ...(planTitle ? { title: planTitle } : {}), todos };
            })
          )
        );

        // Highlight newly-added tasks for the entry animation.
        const addedIds = aiUpsert.filter((t) => !knownIds.has(t.id)).map((t) => t.id);
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
          wasTruncated
            ? "I couldn't generate the updated plan — it was too long to fit in one response. Try splitting it into smaller plans or trimming the number of tasks."
            : "I couldn't generate the updated plan just now. Please ask me again, or rephrase the change."
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
    updateSelectedTodo,
    handleSendMessage,
    aiAddedTodoIds,
    clearAiAddedTodoIds: () => setAiAddedTodoIds([]),
  };
}
