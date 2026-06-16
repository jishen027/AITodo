'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { gsap } from 'gsap';
import { Plus, Circle, CheckCircle2, Trash2, Flag, Calendar, AlignLeft, Edit2, ListChecks, Bot, Sparkles, Sun } from 'lucide-react';
import { Plan, Todo } from '@/types';
import { getPriorityColor } from '@/lib/utils';
import ConfirmModal from '@/components/ConfirmModal';
import PullToRefresh from '@/components/PullToRefresh';

interface TodoListProps {
  onRefresh: () => void | Promise<void>;
  plan: Plan;
  activeTodos: Todo[];
  completedTodos: Todo[];
  selectedTodoId: string | null;
  newTaskText: string;
  editingTitleId: string | null;
  editedTitle: string;
  aiAddedTodoIds: string[];
  isAiUpdating: boolean;
  onAnimationDone: () => void;
  onSelectTodo: (id: string) => void;
  onToggleTodo: (id: string, e?: React.MouseEvent) => void;
  onToggleMyDay: (id: string, e?: React.MouseEvent) => void;
  onDeleteTodo: (id: string, e?: React.MouseEvent) => void;
  onAddTodo: (e: React.KeyboardEvent) => void;
  onNewTaskTextChange: (text: string) => void;
  onStartEditTitle: () => void;
  onEditedTitleChange: (title: string) => void;
  onUpdatePlanTitle: (id: string, title: string) => void;
}

export default function TodoList({
  onRefresh,
  plan,
  activeTodos,
  completedTodos,
  selectedTodoId,
  newTaskText,
  editingTitleId,
  editedTitle,
  aiAddedTodoIds,
  isAiUpdating,
  onAnimationDone,
  onSelectTodo,
  onToggleTodo,
  onToggleMyDay,
  onDeleteTodo,
  onAddTodo,
  onNewTaskTextChange,
  onStartEditTitle,
  onEditedTitleChange,
  onUpdatePlanTitle,
}: TodoListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const completedListRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const scanBarRef = useRef<HTMLDivElement>(null);
  // IDs of items that just moved between lists — used to trigger the enter animation
  const [justMovedIds, setJustMovedIds] = useState<string[]>([]);
  // ID of the todo awaiting delete confirmation
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Animate in todos added by the AI
  useEffect(() => {
    if (!aiAddedTodoIds.length || !listRef.current) return;

    const els = aiAddedTodoIds
      .map((id) => listRef.current!.querySelector<HTMLElement>(`[data-todo-id="${id}"]`))
      .filter((el): el is HTMLElement => el !== null);

    if (!els.length) { onAnimationDone(); return; }

    const ctx = gsap.context(() => {
      gsap.from(els, {
        opacity: 0, y: 24, scale: 0.96,
        duration: 0.5, ease: 'power3.out', stagger: 0.08,
        onComplete: onAnimationDone,
      });
    });
    return () => ctx.revert();
  }, [aiAddedTodoIds, onAnimationDone]);

  // Animate in items that just moved to the other list (after React re-render)
  useEffect(() => {
    if (!justMovedIds.length) return;

    const roots = [listRef.current, completedListRef.current].filter(Boolean) as HTMLElement[];
    const els = justMovedIds.flatMap((id) =>
      roots
        .map((r) => r.querySelector<HTMLElement>(`[data-todo-id="${id}"]`))
        .filter((el): el is HTMLElement => !!el)
    );

    if (els.length) {
      gsap.fromTo(
        els,
        { opacity: 0, y: -10, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: 'back.out(1.4)', onComplete: () => setJustMovedIds([]) }
      );
    } else {
      setJustMovedIds([]);
    }
  }, [justMovedIds]);

  // Overlay entrance + scan bar when AI is updating
  useEffect(() => {
    const overlay = overlayRef.current;
    const scanBar = scanBarRef.current;
    if (!isAiUpdating || !overlay || !scanBar) return;

    gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power2.out' });

    gsap.set(scanBar, { xPercent: -100 });
    const tl = gsap.timeline({ repeat: -1 });
    tl.to(scanBar, { xPercent: 200, duration: 1.6, ease: 'power1.inOut' })
      .set(scanBar, { xPercent: -100 });

    return () => { tl.kill(); };
  }, [isAiUpdating]);

  // Animate out → call toggle → animate in (in new list)
  const handleToggle = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const el = document.querySelector<HTMLElement>(`[data-todo-id="${id}"]`);
    if (!el) { onToggleTodo(id); return; }

    gsap.to(el, {
      opacity: 0,
      x: 14,
      scale: 0.97,
      duration: 0.22,
      ease: 'power2.in',
      onComplete: () => {
        setJustMovedIds([id]);
        onToggleTodo(id);
      },
    });
  }, [onToggleTodo]);

  // Show the confirm modal; actual deletion happens in confirmDelete
  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteId(id);
  }, []);

  // Called when the user confirms deletion — animate then remove
  const confirmDelete = useCallback(() => {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (!id) return;

    const el = document.querySelector<HTMLElement>(`[data-todo-id="${id}"]`);
    if (!el) { onDeleteTodo(id); return; }

    gsap.timeline({ onComplete: () => onDeleteTodo(id) })
      .to(el, { opacity: 0, x: 20, duration: 0.2, ease: 'power2.in' })
      .to(el, { height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0, duration: 0.18, ease: 'power2.in' }, '-=0.04');
  }, [pendingDeleteId, onDeleteTodo]);

  return (
    <section className="flex-1 flex flex-col bg-[#FAFAFA] border-r border-gray-200 relative overflow-hidden">

      {/* AI updating overlay */}
      {isAiUpdating && (
        <div ref={overlayRef} className="absolute inset-0 z-20 flex flex-col pointer-events-auto">
          {/* Scan bar */}
          <div className="h-0.5 bg-indigo-50 overflow-hidden shrink-0">
            <div ref={scanBarRef} className="h-full w-1/2 bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />
          </div>
          {/* Frosted backdrop */}
          <div className="flex-1 bg-white/60 backdrop-blur-[2px] flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 py-6 px-10 rounded-2xl bg-white/95 shadow-xl shadow-indigo-100/60 border border-indigo-100">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-indigo-500" />
                </div>
                <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-indigo-400 animate-pulse" />
              </div>
              <p className="text-sm font-semibold text-gray-700">AI is updating your plan</p>
              <div className="flex gap-1.5">
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      <PullToRefresh onRefresh={onRefresh} className="flex-1">
      <div className="p-6 md:p-8 w-full mx-auto">

        {/* Editable Title */}
        <div className="mb-8 group flex items-center gap-2">
          {editingTitleId === plan.id ? (
            <input
              type="text"
              autoFocus
              value={editedTitle}
              onChange={(e) => onEditedTitleChange(e.target.value)}
              onBlur={() => onUpdatePlanTitle(plan.id, editedTitle || plan.title)}
              onKeyPress={(e) => e.key === 'Enter' && onUpdatePlanTitle(plan.id, editedTitle || plan.title)}
              className="text-2xl font-bold bg-transparent border-b-2 border-indigo-500 focus:outline-none text-gray-800 w-full"
            />
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-800">{plan.title}</h2>
              <button
                onClick={onStartEditTitle}
                className="md:opacity-0 md:group-hover:opacity-100 p-2 text-gray-400 hover:text-indigo-600 transition"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Active Todos */}
        <div ref={listRef} className="space-y-2 mb-8">
          {activeTodos.map((todo) => (
            <div
              key={todo.id}
              data-todo-id={todo.id}
              onClick={() => onSelectTodo(todo.id)}
              className={`
                group flex items-center gap-3 p-3.5 rounded-xl shadow-sm border transition-all cursor-pointer
                ${selectedTodoId === todo.id ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-transparent hover:border-gray-200'}
              `}
            >
              <button
                onClick={(e) => handleToggle(todo.id, e)}
                className="text-gray-300 hover:text-indigo-500 flex-shrink-0 transition-colors"
              >
                <Circle className="w-5 h-5" />
              </button>
              <span className={`flex-1 text-sm truncate ${selectedTodoId === todo.id ? 'text-indigo-900 font-medium' : 'text-gray-700'}`}>
                {todo.text}
              </span>
              <div className="flex items-center gap-2 opacity-60">
                {todo.priority && todo.priority !== 'none' && (
                  <Flag className={`w-3.5 h-3.5 ${getPriorityColor(todo.priority)}`} />
                )}
                {todo.dueDate && (
                  <>
                    {/* desktop: date + time text */}
                    <span className="hidden md:flex items-center gap-1 text-[11px] text-gray-400 font-medium whitespace-nowrap">
                      <Calendar className="w-3.5 h-3.5" />
                      {todo.dueDate}{todo.dueTime ? ` ${todo.dueTime}` : ''}
                    </span>
                    {/* mobile: icon only */}
                    <Calendar className="md:hidden w-3.5 h-3.5 text-gray-400" />
                  </>
                )}
                {todo.notes && <AlignLeft className="w-3.5 h-3.5 text-gray-400" />}
                {todo.steps.length > 0 && (
                  <>
                    {/* desktop: icon + count */}
                    <span className="hidden md:flex items-center gap-1 text-[11px] text-gray-400 font-medium">
                      <ListChecks className="w-3.5 h-3.5" />
                      {todo.steps.filter(s => s.completed).length}/{todo.steps.length}
                    </span>
                    {/* mobile: icon only */}
                    <ListChecks className="md:hidden w-3.5 h-3.5 text-gray-400" />
                  </>
                )}
              </div>
              <button
                onClick={(e) => onToggleMyDay(todo.id, e)}
                title={todo.myDay ? 'Remove from My Day' : 'Add to My Day'}
                className={`p-2 transition ${
                  todo.myDay
                    ? 'text-amber-400 hover:text-amber-600'
                    : 'text-gray-400 hover:text-amber-500 md:opacity-0 md:group-hover:opacity-100'
                }`}
              >
                <Sun className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => handleDelete(todo.id, e)}
                className="md:opacity-0 md:group-hover:opacity-100 text-gray-400 hover:text-red-500 p-2 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {activeTodos.length === 0 && completedTodos.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm">
              No tasks yet — ask AI to help you get started.
            </div>
          )}
        </div>

        {/* Completed Todos */}
        {completedTodos.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">Completed</h3>
            <div ref={completedListRef} className="space-y-2">
              {completedTodos.map((todo) => (
                <div
                  key={todo.id}
                  data-todo-id={todo.id}
                  onClick={() => onSelectTodo(todo.id)}
                  className={`
                    group flex items-center gap-3 p-3.5 rounded-xl border transition-all cursor-pointer
                    ${selectedTodoId === todo.id ? 'bg-indigo-50/50 border-indigo-100' : 'bg-white/50 border-transparent'}
                  `}
                >
                  <button
                    onClick={(e) => handleToggle(todo.id, e)}
                    className="text-indigo-500 flex-shrink-0"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                  </button>
                  <span className="flex-1 text-sm text-gray-400 line-through decoration-gray-300 truncate">
                    {todo.text}
                  </span>
                  <button
                    onClick={(e) => handleDelete(todo.id, e)}
                    className="md:opacity-0 md:group-hover:opacity-100 text-gray-400 hover:text-red-500 p-2 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </PullToRefresh>{/* end scrollable */}

      {/* Add Task Input — pinned to the bottom of the panel */}
      <div className="shrink-0 border-t border-gray-100 bg-white/90 backdrop-blur-sm p-4 md:px-8">
        <div className="relative shadow-sm rounded-xl">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Plus className="h-5 w-5 text-indigo-500" />
          </div>
          <input
            type="text"
            value={newTaskText}
            onChange={(e) => onNewTaskTextChange(e.target.value)}
            onKeyPress={onAddTodo}
            className="block w-full pl-11 pr-3 py-3.5 bg-white border border-gray-100 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow shadow-sm text-gray-700"
            placeholder="Add a task, press Enter to save..."
          />
        </div>
      </div>

      {/* Delete confirmation modal */}
      {pendingDeleteId && (() => {
        const todo = [...activeTodos, ...completedTodos].find(t => t.id === pendingDeleteId);
        return (
          <ConfirmModal
            title="Delete task?"
            message={todo ? `"${todo.text}" will be permanently removed.` : 'This task will be permanently removed.'}
            onConfirm={confirmDelete}
            onCancel={() => setPendingDeleteId(null)}
          />
        );
      })()}
    </section>
  );
}
