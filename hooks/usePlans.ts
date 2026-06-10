'use client';

import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Plan, Todo, TodoWithPlan } from '@/types';
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
**Action:** Ask 1–3 focused questions per turn (timeline, constraints, outcomes). Text only — no table, no JSON.

## Phase 2 → \`<<<PROPOSED>>>\`
**Trigger:** You have enough context (goal + rough timeline + at least one constraint/priority).
**Action:** Present the proposed plan as a Markdown table (Task | Priority | Deadline | Time | Brief Steps). Ask: "Does this look good?"
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
- **location** — set when the task is tied to a real physical place (gym, store, office, venue) the user mentioned or that is obvious from context. Plain text only — never output coordinates. Keep existing locations unless the user asks to change them; otherwise use an empty string.
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
  const cleaned = text.replace(/<<<\s*(CONFIRMED|PROPOSED|ASKING|READY)\s*>>>/gi, '').trim();
  return { text: cleaned, token };
}

function parsePlanUpdate(responseText: string, currentTodos: Todo[]): PlanUpdate {
  const jsonRegex = /```(?:json)?\s*([\s\S]*?)```/;
  const match = responseText.match(jsonRegex);
  if (!match) return { text: responseText, todos: null, planTitle: null };

  try {
    const sanitized = match[1]
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    const parsed = JSON.parse(sanitized);

    const lockedTodos = new Map(
      currentTodos.filter((t) => t.completed).map((t) => [t.id, t])
    );
    const currentById = new Map(currentTodos.map((t) => [t.id, t]));
    const normalize = (list: Todo[]) => {
      const mapped = list.map((t) => {
        const locked = lockedTodos.get(t.id);
        if (locked) return locked;
        // Never trust AI-emitted coordinates: keep the stored ones while the
        // location text is unchanged, otherwise reset so the map re-geocodes.
        const existing = currentById.get(t.id);
        const location = typeof t.location === 'string' ? t.location : existing?.location ?? '';
        const keepCoords = !!existing && (existing.location ?? '') === location;
        return {
          ...t,
          steps: t.steps ?? [],
          dueTime: t.dueTime ?? '',
          location,
          locationLat: keepCoords ? existing.locationLat ?? null : null,
          locationLng: keepCoords ? existing.locationLng ?? null : null,
        };
      });
      const presentIds = new Set(mapped.map((t) => t.id));
      const dropped = [...lockedTodos.values()].filter((t) => !presentIds.has(t.id));
      return [...mapped, ...dropped];
    };

    let todos: Todo[] | null = null;
    let planTitle: string | null = null;

    if (Array.isArray(parsed)) {
      todos = normalize(parsed);
    } else if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.todos)) todos = normalize(parsed.todos);
      if (typeof parsed.planTitle === 'string' && parsed.planTitle.trim()) {
        planTitle = parsed.planTitle.trim();
      }
    }

    return { text: responseText.replace(jsonRegex, '').trim(), todos, planTitle };
  } catch (e) {
    console.error('[usePlans] Failed to parse AI JSON block:', e, '\nRaw block:', match[1]);
    return { text: responseText, todos: null, planTitle: null };
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
          setActivePlanId(data[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  // --- Computed ---
  const activePlan = plans.find((p) => p.id === activePlanId) ?? plans[0] ?? null;
  const activeTodos = activePlan?.todos.filter((t) => !t.completed) ?? [];
  const completedTodos = activePlan?.todos.filter((t) => t.completed) ?? [];

  const allTodos: TodoWithPlan[] = plans.flatMap((p) =>
    p.todos.map((t) => ({ ...t, planId: p.id, planTitle: p.title }))
  );

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
    let update = parsePlanUpdate(cleanedText, currentTodos);

    const shouldForce =
      !update.todos &&
      (token === 'confirmed' ||
        (!!pendingProposalRef.current[planId] && token !== 'asking' && token !== 'proposed'));

    if (shouldForce) {
      const forcedHistory: ApiMessage[] = [
        ...history,
        { role: 'assistant', content: cleanedText },
        {
          role: 'user',
          content:
            'Output the complete plan now as a single ```json code block following the schema exactly. Output ONLY the JSON block — no prose, no questions, no deferral.',
        },
      ];
      const forced = parsePlanUpdate(await callChat(forcedHistory, systemInstruction), currentTodos);
      if (forced.todos) {
        update = { text: update.text, todos: forced.todos, planTitle: forced.planTitle ?? update.planTitle };
      }
    }

    if (update.todos) {
      const prevIds = new Set(currentTodos.map((t) => t.id));
      const addedIds = update.todos.filter((t) => !prevIds.has(t.id)).map((t) => t.id);
      if (addedIds.length) setAiAddedTodoIds(addedIds);
    }

    const aiText = update.text || 'Tasks updated!';

    setPlans((prev) =>
      prev.map((p) =>
        p.id === planId
          ? {
              ...p,
              ...(update.planTitle ? { title: update.planTitle } : {}),
              ...(update.todos ? { todos: update.todos } : {}),
              chat: [...p.chat, { role: 'ai', text: aiText }],
            }
          : p
      )
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

    // Persist todo updates
    if (update.todos) {
      persistTodos(planId, update.todos);
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
    plans,
    activePlan,
    activePlanId,
    setActivePlanId,
    activeTodos,
    completedTodos,
    allTodos,
    sortedAllTodos,
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
