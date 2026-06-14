'use client';

import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Plan, Todo, TodoWithPlan, MyDaySuggestion } from '@/types';
import { generateId } from '@/lib/utils';
import { callChat, callChatStream, type ApiMessage } from '@/lib/api';

// ---------------------------------------------------------------------------
// Agent System Instruction
// ---------------------------------------------------------------------------
function buildSystemInstruction(activePlan: Plan, allPlans: Plan[]): string {
  const today = new Date().toISOString().split('T')[0];
  const completedCount = allPlans.flatMap((p) => p.todos.filter((t) => t.completed)).length;
  const pendingCount = allPlans.flatMap((p) => p.todos.filter((t) => !t.completed)).length;
  const overdueTasks = allPlans.flatMap((p) =>
    p.todos.filter((t) => !t.completed && t.dueDate && t.dueDate < today)
  );

  const incompleteTodos = activePlan.todos.filter((t) => !t.completed);
  const completedTodos = activePlan.todos.filter((t) => t.completed);
  const hasExistingTodos = incompleteTodos.length > 0 || completedTodos.length > 0;

  return `
# Role
You are a persistent, empathetic Planning Assistant embedded in an AI Todo app.
Each plan has its own dedicated chat. The conversation history you receive IS the full history of this plan's chat — use it as context.
Always match the user's language in replies, but use English for control tokens and JSON schemas.

# Current Date: ${today}
# Global Stats: ${completedCount} tasks completed · ${pendingCount} pending · ${overdueTasks.length} overdue

---

# ACTIVE PLAN: "${activePlan.title}"

## EDITABLE Todos — you MAY add, modify, reschedule, or remove any of these:
${incompleteTodos.length > 0 ? JSON.stringify(incompleteTodos, null, 2) : '(no incomplete tasks yet — plan is empty)'}

## LOCKED Todos — completed by the user, copy verbatim, NEVER change:
${completedTodos.length > 0 ? JSON.stringify(completedTodos, null, 2) : '(none)'}

---

# Workflow
Output EXACTLY ONE control token on its own final line at the end of EVERY response.

## Phase 1 → \`<<<ASKING>>>\`
**Trigger:** User states a vague new goal without enough detail.
**Action:** Ask 1–3 focused questions per turn (timeline, constraints, outcomes, and — when tasks happen at physical places — where, e.g. which gym, store, or venue). Text only — no table, no JSON.

## Phase 2 → \`<<<PROPOSED>>>\`
**Trigger:** You have enough context (goal + rough timeline + at least one constraint/priority).
**Action:** Present the proposed plan as a Markdown table (Task | Priority | Deadline | Time | Location | Brief Steps). Use "—" in the Location column for tasks without one. Ask: "Does this look good?"
**No JSON yet.** Adjust and re-propose if the user requests tweaks (stay in Phase 2).

## Phase 3 → \`<<<CONFIRMED>>>\`
**Trigger A:** User approves the Phase 2 proposal (e.g. "looks good", "go ahead", "yes", "create it").
**Trigger B:** ${hasExistingTodos
    ? 'The plan already has tasks AND the user asks for a direct modification — add a task, remove a task, change due date/time/priority, reschedule, rename, reorder. SKIP Phases 1 & 2 entirely and go directly here.'
    : 'User asks for a direct edit to an already-existing plan.'}
**Action:** One short confirmation sentence immediately followed by the complete JSON block. Never defer or say "please wait".

---

# JSON Schema (Phase 3 only)
Output a single \`\`\`json block — complete, no truncation:
{
  "planTitle": "optional — include only to rename the plan",
  "todos": [
    {
      "id": "keep existing ID for existing tasks, or a short random ID for new ones",
      "text": "Action-oriented title, max 60 chars",
      "completed": false,
      "notes": "Rich detail: purpose · steps · acceptance criteria · resources · blockers · estimated duration. Never empty.",
      "dueDate": "YYYY-MM-DD or empty string",
      "dueTime": "HH:MM 24-hour or empty string — assign a realistic time of day",
      "priority": "high | medium | low | none",
      "location": "Place name or address where the task happens (e.g. 'PureGym Birmingham City Centre'), or empty string",
      "steps": [
        { "id": "step-id", "text": "Specific actionable step", "completed": false }
      ]
    }
  ]
}

# Rules
- **Output the COMPLETE todos array** — all tasks (incomplete + completed) every time you emit JSON.
- **Locked tasks are sacred** — copy every completed todo exactly from the LOCKED section above.
- **Never drop tasks** — if a completed task is missing from the AI output, re-attach it automatically.
- **No placeholders** — never truncate with \`//...\` or \`/* existing tasks */\`.
- **steps** — 3–7 specific steps per task. Preserve existing step IDs and completed state.
- **notes** — always rich; never a single sentence or empty string.
- **location** — proactively propose one for every task tied to a real physical place (gym, store, office, venue). Use the place the user mentioned, or infer it from context (e.g. their city or an earlier task's location). Never invent a specific venue or street address the user hasn't hinted at — if the place matters but is unknown, ask in Phase 1 or use a generic searchable name (e.g. "Gym near Birmingham city centre"). Plain text only — never output coordinates. Keep existing locations unless the user asks to change them; tasks with no physical place get an empty string.
- Claiming the plan is "updated" or "created" without the JSON block in that same message is a failure.
`.trim();
}

// ---------------------------------------------------------------------------
// Response parsing helpers
// ---------------------------------------------------------------------------
interface PlanUpdate {
  text: string;
  todos: Todo[] | null;
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

// Extract the raw todos array / planTitle from a model reply. No reconciliation
// happens here — that is deliberately deferred to reconcileTodos at commit time
// so it can run against the LATEST plan state, not a stale send-time snapshot.
function parsePlanUpdate(responseText: string): PlanUpdate {
  const block = extractJsonBlock(responseText);
  if (!block) return { text: responseText, todos: null, planTitle: null };

  try {
    const sanitized = block.jsonText
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    const parsed = JSON.parse(sanitized);

    let todos: Todo[] | null = null;
    let planTitle: string | null = null;

    if (Array.isArray(parsed)) {
      todos = parsed;
    } else if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.todos)) todos = parsed.todos;
      if (typeof parsed.planTitle === 'string' && parsed.planTitle.trim()) {
        planTitle = parsed.planTitle.trim();
      }
    }

    return { text: block.textWithout, todos, planTitle };
  } catch (e) {
    console.error('[usePlans] Failed to parse AI JSON block:', e, '\nRaw block:', block.jsonText);
    return { text: responseText, todos: null, planTitle: null };
  }
}

// Merge the AI's full todo array against the LATEST plan state (`base`), not the
// snapshot taken when the message was sent. The AI can run for many seconds (more
// with retries) during which the user may toggle, edit, add, or delete tasks; if
// we wrote the AI's array verbatim it would clobber those concurrent changes —
// the "it always saves the old plan as the newest" bug.
//   base     = the current live todos (read inside the setPlans updater)
//   knownIds = ids the AI actually saw (the send-time snapshot)
function reconcileTodos(aiTodos: Todo[], base: Todo[], knownIds: Set<string>): Todo[] {
  const baseById = new Map(base.map((t) => [t.id, t]));
  const lockedById = new Map(base.filter((t) => t.completed).map((t) => [t.id, t]));

  const mapped = aiTodos
    // Drop tasks the user deleted while the AI was responding — the AI only
    // re-emitted them because they were in its snapshot.
    .filter((t) => !(knownIds.has(t.id) && !baseById.has(t.id)))
    .map((t) => {
      // Completed tasks are sacred — always use the live copy, never the AI's.
      const locked = lockedById.get(t.id);
      if (locked) return locked;
      // Never trust AI-emitted coordinates: keep the stored ones while the
      // location text is unchanged, otherwise reset so the map re-geocodes.
      const existing = baseById.get(t.id);
      const location = typeof t.location === 'string' ? t.location : existing?.location ?? '';
      const keepCoords = !!existing && (existing.location ?? '') === location;
      return {
        ...t,
        steps: t.steps ?? [],
        dueTime: t.dueTime ?? '',
        location,
        locationLat: keepCoords ? existing.locationLat ?? null : null,
        locationLng: keepCoords ? existing.locationLng ?? null : null,
        // "My Day" is a user-managed flag the AI never sees — always preserve it.
        myDay: existing?.myDay ?? false,
        // Preserve original creation time; stamp newly-introduced tasks now.
        createdAt: existing?.createdAt ?? t.createdAt ?? new Date().toISOString(),
      };
    });

  const presentIds = new Set(mapped.map((t) => t.id));
  // Re-attach completed tasks the AI dropped (never lose finished work)...
  const droppedLocked = [...lockedById.values()].filter((t) => !presentIds.has(t.id));
  // ...and tasks created AFTER the AI's snapshot: it never saw them, so its
  // omission is not a deletion — preserve concurrent user additions.
  const concurrentlyAdded = base.filter(
    (t) => !presentIds.has(t.id) && !knownIds.has(t.id) && !t.completed
  );
  return [...mapped, ...droppedLocked, ...concurrentlyAdded];
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

  // Load all plans from the database on mount
  useEffect(() => {
    fetch('/api/plans')
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/plans failed: ${r.status}`);
        return r.json();
      })
      .then((data: Plan[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setPlans(data);
          // Never default the active plan to the hidden "My Day" backing plan.
          const firstVisible = data.find((p) => !p.isMyDay);
          if (firstVisible) setActivePlanId(firstVisible.id);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

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

    const systemInstruction = buildSystemInstruction(activePlan, plans);
    const rawResponse = await callChatStream(history, systemInstruction, (chunk) => {
      flushSync(() => setStreamingTexts((prev) => ({ ...prev, [planId]: (prev[planId] ?? '') + chunk })));
    });
    setStreamingTexts((prev) => ({ ...prev, [planId]: '' }));

    const { text: cleanedText, token } = stripControlToken(rawResponse);
    let update = parsePlanUpdate(cleanedText);
    // The server appends this sentinel when the model hit the output token cap and
    // stopped mid-JSON — the #1 cause of "AI says JSON but the plan didn't change".
    let wasTruncated = /<<<\s*TRUNCATED\s*>>>/i.test(rawResponse);

    // The model is only allowed to skip JSON when it's genuinely asking a
    // clarifying question (Phase 1) or proposing a brand-new plan it hasn't been
    // told to commit yet (Phase 2 on an empty plan). In every other case a reply
    // with no JSON means the model claimed/intended an update but failed to emit
    // it — force a JSON-only retry so the change actually lands. The common bug:
    // for a modification to an existing plan the model replies with a prose
    // summary ending in <<<PROPOSED>>> instead of going straight to JSON.
    const hasExistingTodos = currentTodos.length > 0;
    const shouldForce =
      !update.todos &&
      token !== 'asking' &&
      (token === 'confirmed' ||
        !!pendingProposalRef.current[planId] ||
        hasExistingTodos);

    if (shouldForce) {
      // Re-assert ground truth: the model frequently insists the plan is "already
      // updated" and refuses to emit JSON, when in fact NOTHING has been written
      // yet — the only way changes persist is via this JSON block. Restate the
      // actual current todos so the model can't lean on its own prose claims, and
      // retry a few times since a stubborn model may refuse the first attempt.
      const forceInstruction =
        'IMPORTANT: The plan has NOT been modified. Your previous messages were prose only ' +
        'and were NOT applied — the plan changes ONLY when you output a JSON block. ' +
        'Do NOT claim the plan is "already updated" or say JSON is unnecessary.\n\n' +
        `The plan's CURRENT todos (the real, unchanged state) are:\n${JSON.stringify(currentTodos, null, 2)}\n\n` +
        'Now output the COMPLETE updated plan — reflecting every change discussed above — ' +
        'as a single ```json code block following the schema exactly. ' +
        'Output ONLY the JSON block: no prose, no questions, no deferral.';

      let lastAssistant = cleanedText;
      for (let attempt = 0; attempt < 3 && !update.todos; attempt++) {
        const forcedHistory: ApiMessage[] = [
          ...history,
          { role: 'assistant', content: lastAssistant },
          { role: 'user', content: forceInstruction },
        ];
        const forcedRaw = await callChat(forcedHistory, systemInstruction);
        if (/<<<\s*TRUNCATED\s*>>>/i.test(forcedRaw)) wasTruncated = true;
        const forced = parsePlanUpdate(stripControlToken(forcedRaw).text);
        if (forced.todos) {
          update = { text: update.text, todos: forced.todos, planTitle: forced.planTitle ?? update.planTitle };
        } else {
          lastAssistant = forcedRaw;
        }
      }
    }

    if (update.todos) {
      const prevIds = new Set(currentTodos.map((t) => t.id));
      const addedIds = update.todos.filter((t) => !prevIds.has(t.id)).map((t) => t.id);
      if (addedIds.length) setAiAddedTodoIds(addedIds);
    }

    // Only claim success when todos were actually written. If nothing was applied,
    // surface the real reason — a truncated (too-long) response or a generic
    // failure — instead of a misleading "Tasks updated!" or the model's own prose.
    const aiText =
      !update.todos && wasTruncated
        ? "That update was too long to generate in one response, so it didn't go through. Try splitting this into smaller plans or trimming the number of tasks, then ask me again."
        : update.text ||
          (update.todos
            ? 'Tasks updated!'
            : "I wasn't able to apply that change — please rephrase it and I'll update the plan.");

    // Reconcile the AI's array against the freshest todos (`p.todos`) inside the
    // updater, so concurrent edits made while the AI was responding survive.
    // `knownIds` are the tasks the AI actually saw at send time.
    const knownIds = new Set(currentTodos.map((t) => t.id));
    let committedTodos: Todo[] | null = null;
    setPlans((prev) =>
      prev.map((p) => {
        if (p.id !== planId) return p;
        const todos = update.todos ? reconcileTodos(update.todos, p.todos, knownIds) : p.todos;
        if (update.todos) committedTodos = todos;
        return {
          ...p,
          ...(update.planTitle ? { title: update.planTitle } : {}),
          ...(update.todos ? { todos } : {}),
          chat: [...p.chat, { role: 'ai', text: aiText }],
        };
      })
    );

    // Persist chat messages
    fetch(`/api/plans/${planId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        { role: 'user', text: userText },
        { role: 'ai', text: aiText },
      ]),
    }).catch(console.error);

    // Persist the reconciled todos (matches what we just committed to state).
    if (committedTodos) {
      persistTodos(planId, committedTodos);
    }

    // Persist plan title rename
    if (update.planTitle) {
      fetch(`/api/plans/${planId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: update.planTitle }),
      }).catch(console.error);
    }

    pendingProposalRef.current[planId] = update.todos ? false : token === 'proposed';
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
