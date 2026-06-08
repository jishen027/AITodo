'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Plus, Circle, CheckCircle2, Trash2, Flag, Calendar, AlignLeft, Edit2, ListChecks } from 'lucide-react';
import { Plan, Todo } from '@/types';
import { getPriorityColor } from '@/lib/utils';

interface TodoListProps {
  plan: Plan;
  activeTodos: Todo[];
  completedTodos: Todo[];
  selectedTodoId: string | null;
  newTaskText: string;
  editingTitleId: string | null;
  editedTitle: string;
  aiAddedTodoIds: string[];
  onAnimationDone: () => void;
  onSelectTodo: (id: string) => void;
  onToggleTodo: (id: string, e: React.MouseEvent) => void;
  onDeleteTodo: (id: string, e: React.MouseEvent) => void;
  onAddTodo: (e: React.KeyboardEvent) => void;
  onNewTaskTextChange: (text: string) => void;
  onStartEditTitle: () => void;
  onEditedTitleChange: (title: string) => void;
  onUpdatePlanTitle: (id: string, title: string) => void;
}

export default function TodoList({
  plan,
  activeTodos,
  completedTodos,
  selectedTodoId,
  newTaskText,
  editingTitleId,
  editedTitle,
  aiAddedTodoIds,
  onAnimationDone,
  onSelectTodo,
  onToggleTodo,
  onDeleteTodo,
  onAddTodo,
  onNewTaskTextChange,
  onStartEditTitle,
  onEditedTitleChange,
  onUpdatePlanTitle,
}: TodoListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Animate in the todos the AI just created
  useEffect(() => {
    if (!aiAddedTodoIds.length || !listRef.current) return;

    const els = aiAddedTodoIds
      .map((id) => listRef.current!.querySelector<HTMLElement>(`[data-todo-id="${id}"]`))
      .filter((el): el is HTMLElement => el !== null);

    if (!els.length) {
      onAnimationDone();
      return;
    }

    const ctx = gsap.context(() => {
      gsap.from(els, {
        opacity: 0,
        y: 24,
        scale: 0.96,
        duration: 0.5,
        ease: 'power3.out',
        stagger: 0.08,
        onComplete: onAnimationDone,
      });
    });

    return () => ctx.revert();
  }, [aiAddedTodoIds, onAnimationDone]);

  return (
    <section className="flex-1 md:flex-none md:w-[45%] flex flex-col bg-[#FAFAFA] overflow-y-auto border-r border-gray-200">
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
                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-indigo-600 transition"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Add Task Input */}
        <div className="mb-6 relative shadow-sm rounded-xl">
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
              <button onClick={(e) => onToggleTodo(todo.id, e)} className="text-gray-300 hover:text-indigo-500 flex-shrink-0 transition-colors">
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
                  <span className="flex items-center gap-1 text-[11px] text-gray-400 font-medium whitespace-nowrap">
                    <Calendar className="w-3.5 h-3.5" />
                    {todo.dueDate}{todo.dueTime ? ` ${todo.dueTime}` : ''}
                  </span>
                )}
                {todo.notes && <AlignLeft className="w-3.5 h-3.5 text-gray-400" />}
                {todo.steps.length > 0 && (
                  <span className="flex items-center gap-1 text-[11px] text-gray-400 font-medium">
                    <ListChecks className="w-3.5 h-3.5" />
                    {todo.steps.filter(s => s.completed).length}/{todo.steps.length}
                  </span>
                )}
              </div>
              <button
                onClick={(e) => onDeleteTodo(todo.id, e)}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1 transition ml-1"
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
            <div className="space-y-2">
              {completedTodos.map((todo) => (
                <div
                  key={todo.id}
                  onClick={() => onSelectTodo(todo.id)}
                  className={`
                    group flex items-center gap-3 p-3.5 rounded-xl border transition-all cursor-pointer
                    ${selectedTodoId === todo.id ? 'bg-indigo-50/50 border-indigo-100' : 'bg-white/50 border-transparent'}
                  `}
                >
                  <button onClick={(e) => onToggleTodo(todo.id, e)} className="text-indigo-500 flex-shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </button>
                  <span className="flex-1 text-sm text-gray-400 line-through decoration-gray-300 truncate">
                    {todo.text}
                  </span>
                  <button
                    onClick={(e) => onDeleteTodo(todo.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
