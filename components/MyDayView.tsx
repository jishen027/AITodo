'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Circle, CheckCircle2, Flag, Calendar, AlignLeft, ListChecks, Sun, X, Sparkles, RefreshCw, Loader2, Clock, Lightbulb } from 'lucide-react';
import { TodoWithPlan, MyDaySuggestion } from '@/types';
import { getPriorityColor } from '@/lib/utils';

interface MyDayViewProps {
  myDayTodos: TodoWithPlan[];
  selectedTodoId: string | null;
  onSelectTodo: (id: string) => void;
  onToggleTodo: (id: string, e?: React.MouseEvent) => void;
  onRemoveFromMyDay: (id: string, e?: React.MouseEvent) => void;
  onAddTodo: (text: string) => void;
  suggestions: MyDaySuggestion[];
  dueSoonTodos: TodoWithPlan[];
  recentlyAddedTodos: TodoWithPlan[];
  suggestionsLoading: boolean;
  suggestionsError: string | null;
  suggestionsLoaded: boolean;
  onLoadSuggestions: () => void;
  onAddToMyDay: (id: string, e?: React.MouseEvent) => void;
  onDismissSuggestion: (id: string) => void;
}

// A single suggestion row, shared by all three panel sections.
function SuggestionRow({
  todo,
  reason,
  onAdd,
  onSelect,
  onDismiss,
}: {
  todo: TodoWithPlan;
  reason?: string;
  onAdd: (e: React.MouseEvent) => void;
  onSelect: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className="group flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-100 shadow-sm hover:border-indigo-200 transition-all cursor-pointer"
    >
      <div className="flex-1 min-w-0">
        <span className="block text-sm text-gray-700 truncate">{todo.text}</span>
        <span className="block text-[11px] text-gray-400 truncate">
          {todo.planTitle}
          {reason ? <span className="text-indigo-400"> · {reason}</span> : null}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {todo.priority && todo.priority !== 'none' && (
          <Flag className={`w-3.5 h-3.5 ${getPriorityColor(todo.priority)} opacity-70`} />
        )}
        {todo.dueDate && (
          <span className="hidden sm:flex items-center gap-1 text-[11px] text-gray-400 font-medium whitespace-nowrap">
            <Calendar className="w-3.5 h-3.5" />
            {todo.dueDate}
          </span>
        )}
        <button
          onClick={onAdd}
          title="Add to My Day"
          className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-white hover:bg-indigo-600 border border-indigo-200 hover:border-indigo-600 rounded-lg px-2 py-1 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
        {onDismiss && (
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            title="Dismiss"
            className="md:opacity-0 md:group-hover:opacity-100 p-1.5 text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function SectionHeading({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-2 px-1">
      {icon}
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h4>
      {count != null && count > 0 && (
        <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{count}</span>
      )}
    </div>
  );
}

export default function MyDayView({
  myDayTodos,
  selectedTodoId,
  onSelectTodo,
  onToggleTodo,
  onRemoveFromMyDay,
  onAddTodo,
  suggestions,
  dueSoonTodos,
  recentlyAddedTodos,
  suggestionsLoading,
  suggestionsError,
  suggestionsLoaded,
  onLoadSuggestions,
  onAddToMyDay,
  onDismissSuggestion,
}: MyDayViewProps) {
  const [newTaskText, setNewTaskText] = useState('');
  const [showPanel, setShowPanel] = useState(false);

  const activeTodos = myDayTodos.filter((t) => !t.completed);
  const completedTodos = myDayTodos.filter((t) => t.completed);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const handleAdd = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || !newTaskText.trim()) return;
    onAddTodo(newTaskText);
    setNewTaskText('');
  };

  // Open the panel, kicking off the AI review on first open.
  const openPanel = () => {
    setShowPanel(true);
    if (!suggestionsLoaded && !suggestionsLoading) onLoadSuggestions();
  };

  // On entering My Day with an empty list, auto-open the suggestions panel so the
  // user has somewhere to start. Runs once per visit (the view remounts on nav).
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    if (myDayTodos.length === 0) {
      setShowPanel(true);
      if (!suggestionsLoaded && !suggestionsLoading) onLoadSuggestions();
    }
  }, [myDayTodos.length, suggestionsLoaded, suggestionsLoading, onLoadSuggestions]);

  return (
    <section className="flex-1 flex bg-[#FAFAFA] overflow-hidden">
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-6 md:p-8 max-w-3xl w-full mx-auto">
          {/* Header */}
          <div className="mb-1 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Sun className="w-7 h-7 text-amber-400" />
              <h2 className="text-2xl font-bold text-gray-800">My Day</h2>
            </div>
            <button
              onClick={() => (showPanel ? setShowPanel(false) : openPanel())}
              className={`flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-lg shadow-sm transition-colors ${showPanel ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
            >
              <Sparkles className="w-4 h-4" />
              Suggestions
            </button>
          </div>
          <p className="text-sm text-gray-400 mb-8 pl-9">{today}</p>

          {/* Add Task Input */}
          <div className="mb-6 relative shadow-sm rounded-xl">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Plus className="h-5 w-5 text-indigo-500" />
            </div>
            <input
              type="text"
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              onKeyPress={handleAdd}
              className="block w-full pl-11 pr-3 py-3.5 bg-white border border-gray-100 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow shadow-sm text-gray-700"
              placeholder="Add a task to My Day, press Enter to save..."
            />
          </div>

          {/* Active Todos */}
          <div className="space-y-2 mb-8">
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
                  onClick={(e) => onToggleTodo(todo.id, e)}
                  className="text-gray-300 hover:text-indigo-500 flex-shrink-0 transition-colors"
                >
                  <Circle className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <span className={`block text-sm truncate ${selectedTodoId === todo.id ? 'text-indigo-900 font-medium' : 'text-gray-700'}`}>
                    {todo.text}
                  </span>
                  <span className="block text-[11px] text-gray-400 truncate">{todo.planTitle}</span>
                </div>
                <div className="flex items-center gap-2 opacity-60">
                  {todo.priority && todo.priority !== 'none' && (
                    <Flag className={`w-3.5 h-3.5 ${getPriorityColor(todo.priority)}`} />
                  )}
                  {todo.dueDate && (
                    <span className="hidden md:flex items-center gap-1 text-[11px] text-gray-400 font-medium whitespace-nowrap">
                      <Calendar className="w-3.5 h-3.5" />
                      {todo.dueDate}{todo.dueTime ? ` ${todo.dueTime}` : ''}
                    </span>
                  )}
                  {todo.notes && <AlignLeft className="w-3.5 h-3.5 text-gray-400" />}
                  {todo.steps.length > 0 && (
                    <span className="hidden md:flex items-center gap-1 text-[11px] text-gray-400 font-medium">
                      <ListChecks className="w-3.5 h-3.5" />
                      {todo.steps.filter((s) => s.completed).length}/{todo.steps.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={(e) => onRemoveFromMyDay(todo.id, e)}
                  title="Remove from My Day"
                  className="md:opacity-0 md:group-hover:opacity-100 text-amber-400 hover:text-amber-600 p-2 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {activeTodos.length === 0 && completedTodos.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <Sun className="w-12 h-12 mx-auto mb-3 text-amber-200" />
                <p className="text-sm">Your day is clear.</p>
                <p className="text-xs mt-1">Add a task above, or tap “Suggestions” for ideas.</p>
              </div>
            )}
          </div>

          {/* Completed Todos */}
          {completedTodos.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">Completed</h3>
              <div className="space-y-2">
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
                      onClick={(e) => onToggleTodo(todo.id, e)}
                      className="text-indigo-500 flex-shrink-0"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                    </button>
                    <span className="flex-1 text-sm text-gray-400 line-through decoration-gray-300 truncate">
                      {todo.text}
                    </span>
                    <button
                      onClick={(e) => onRemoveFromMyDay(todo.id, e)}
                      title="Remove from My Day"
                      className="md:opacity-0 md:group-hover:opacity-100 text-gray-400 hover:text-amber-600 p-2 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---- Suggestions panel — splits the My Day view (no overlay) ---- */}
      <aside
        className={`relative shrink-0 overflow-hidden bg-white transition-[width] duration-300 ease-in-out ${showPanel ? 'w-full sm:w-[400px] border-l border-gray-100 shadow-[-8px_0_24px_rgba(0,0,0,0.04)]' : 'w-0'}`}
        aria-hidden={!showPanel}
      >
        {/* Fixed-width inner pinned to the right so the width animation reads as a
            slide-in from the right edge, without reflowing the panel content. */}
        <div className="absolute inset-y-0 right-0 w-screen sm:w-[400px] flex flex-col bg-white">
        {/* Panel header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            <h3 className="text-base font-bold text-gray-800">Suggestions</h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onLoadSuggestions}
              disabled={suggestionsLoading}
              title="Refresh AI suggestions"
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:text-gray-400 disabled:cursor-not-allowed transition px-2 py-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${suggestionsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => setShowPanel(false)}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-7">
          {/* AI suggestions */}
          <div>
            <SectionHeading
              icon={<Lightbulb className="w-4 h-4 text-indigo-500" />}
              title="AI suggested"
              count={suggestions.length}
            />
            {suggestionsLoading && suggestions.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                AI is reviewing your tasks…
              </div>
            ) : suggestionsError ? (
              <div className="py-5 text-center">
                <p className="text-sm text-gray-500 mb-2">{suggestionsError}</p>
                <button
                  onClick={onLoadSuggestions}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition"
                >
                  Try again
                </button>
              </div>
            ) : suggestions.length === 0 ? (
              <p className="px-1 py-3 text-sm text-gray-400">
                {suggestionsLoaded ? "Nothing to suggest — you're all caught up." : 'Tap refresh to get AI suggestions.'}
              </p>
            ) : (
              <div className="space-y-2">
                {suggestions.map((s) => (
                  <SuggestionRow
                    key={s.id}
                    todo={s}
                    reason={s.reason}
                    onAdd={(e) => onAddToMyDay(s.id, e)}
                    onSelect={() => onSelectTodo(s.id)}
                    onDismiss={() => onDismissSuggestion(s.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Due soon */}
          <div>
            <SectionHeading
              icon={<Clock className="w-4 h-4 text-rose-500" />}
              title="Close to due date"
              count={dueSoonTodos.length}
            />
            {dueSoonTodos.length === 0 ? (
              <p className="px-1 py-3 text-sm text-gray-400">Nothing due in the next few days.</p>
            ) : (
              <div className="space-y-2">
                {dueSoonTodos.map((t) => (
                  <SuggestionRow
                    key={t.id}
                    todo={t}
                    onAdd={(e) => onAddToMyDay(t.id, e)}
                    onSelect={() => onSelectTodo(t.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Recently added */}
          <div>
            <SectionHeading
              icon={<Clock className="w-4 h-4 text-emerald-500" />}
              title="Recently added"
              count={recentlyAddedTodos.length}
            />
            {recentlyAddedTodos.length === 0 ? (
              <p className="px-1 py-3 text-sm text-gray-400">No tasks to show yet.</p>
            ) : (
              <div className="space-y-2">
                {recentlyAddedTodos.map((t) => (
                  <SuggestionRow
                    key={t.id}
                    todo={t}
                    onAdd={(e) => onAddToMyDay(t.id, e)}
                    onSelect={() => onSelectTodo(t.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        </div>
      </aside>
    </section>
  );
}
