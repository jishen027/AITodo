'use client';

import { useState, useEffect } from 'react';
import { ArrowRight, Trash2, CheckCircle2, Circle, Flag, Calendar, Clock, AlignLeft, ListChecks, Plus, X } from 'lucide-react';
import { Step, Todo, TodoWithPlan } from '@/types';
import { generateId } from '@/lib/utils';
import ConfirmModal from '@/components/ConfirmModal';

interface TodoDetailsProps {
  todo: TodoWithPlan | undefined;
  onClose: () => void;
  onToggle: (id: string, e: React.MouseEvent) => void;
  onDelete: (id: string, e?: React.MouseEvent) => void;
  onUpdate: (updates: Partial<Todo>) => void;
}

const PRIORITIES = ['none', 'low', 'medium', 'high'] as const;

const priorityButtonClass = (selected: boolean, p: string) => {
  if (!selected) return 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50';
  if (p === 'high') return 'bg-red-50 border-red-200 text-red-700 font-medium';
  if (p === 'medium') return 'bg-yellow-50 border-yellow-200 text-yellow-700 font-medium';
  if (p === 'low') return 'bg-blue-50 border-blue-200 text-blue-700 font-medium';
  return 'bg-gray-100 border-gray-300 text-gray-700 font-medium';
};

const priorityLabel = (p: string) =>
  p === 'none' ? 'None' : p.charAt(0).toUpperCase() + p.slice(1);

function StepItem({
  step,
  onToggle,
  onDelete,
  onEdit,
}: {
  step: Step;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(step.text);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== step.text) onEdit(trimmed);
    else setDraft(step.text);
    setEditing(false);
  };

  return (
    <div className="group flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors">
      <button
        onClick={onToggle}
        className={`flex-shrink-0 transition-colors ${step.completed ? 'text-indigo-500' : 'text-gray-300 hover:text-indigo-500'}`}
      >
        {step.completed ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
      </button>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(step.text); setEditing(false); } }}
          className="flex-1 text-sm bg-white border border-indigo-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      ) : (
        <span
          onClick={() => { setDraft(step.text); setEditing(true); }}
          className={`flex-1 text-sm cursor-text ${step.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}
        >
          {step.text}
        </span>
      )}

      <button
        onClick={onDelete}
        className="md:opacity-0 md:group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 transition flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function TodoDetails({ todo, onClose, onToggle, onDelete, onUpdate }: TodoDetailsProps) {
  const [newStepText, setNewStepText] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // isOpen drives the CSS transition; renderTodo holds the last known todo so content
  // stays visible during the close animation and is cleared once the section unmounts.
  const [isOpen, setIsOpen] = useState(false);
  const [renderTodo, setRenderTodo] = useState<TodoWithPlan | undefined>(undefined);

  useEffect(() => {
    if (todo) {
      setRenderTodo(todo);
      // Two RAFs are required: the first lets React commit the closed-position
      // render to the DOM; the second fires after the browser has painted that
      // frame, giving the CSS transition a visual starting point to animate from.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setIsOpen(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    } else {
      setIsOpen(false);
      // renderTodo is cleared by onTransitionEnd once the exit animation finishes,
      // so content stays visible while the panel slides away.
    }
  }, [todo]);

  const handleTransitionEnd = (e: React.TransitionEvent) => {
    // Only act on the transform transition (fires once vs. once per property)
    if (e.propertyName === 'transform' && !todo) {
      setRenderTodo(undefined);
    }
  };

  // Nothing in the DOM when fully closed — no compositing layer, no shadow bleed.
  if (!renderTodo) return null;

  const steps = renderTodo.steps ?? [];
  const doneCount = steps.filter((s) => s.completed).length;

  const addStep = () => {
    const text = newStepText.trim();
    if (!text) return;
    onUpdate({ steps: [...steps, { id: generateId(), text, completed: false }] });
    setNewStepText('');
  };

  const toggleStep = (id: string) =>
    onUpdate({ steps: steps.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s)) });

  const deleteStep = (id: string) =>
    onUpdate({ steps: steps.filter((s) => s.id !== id) });

  const editStep = (id: string, text: string) =>
    onUpdate({ steps: steps.map((s) => (s.id === id ? { ...s, text } : s)) });

  return (
    <section
      onTransitionEnd={handleTransitionEnd}
      className={`
        absolute inset-y-0 right-0 w-full md:w-[45%] lg:w-[40%] bg-white
        shadow-2xl md:shadow-[-8px_0_24px_rgba(0,0,0,0.08)]
        border-l border-gray-100 transition-[transform,opacity] duration-300 ease-in-out z-50 flex flex-col
        ${isOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'}
      `}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-indigo-600 transition"
        >
          <ArrowRight className="w-4 h-4 rotate-180" />
          Close
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded truncate max-w-[150px]">
            Plan: {renderTodo.planTitle}
          </span>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Title */}
        <div className="flex items-start gap-4">
          <button
            onClick={(e) => onToggle(renderTodo.id, e)}
            className={`mt-1 flex-shrink-0 transition-colors ${renderTodo.completed ? 'text-indigo-500' : 'text-gray-300 hover:text-indigo-500'}`}
          >
            {renderTodo.completed ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
          </button>
          <textarea
            value={renderTodo.text}
            onChange={(e) => onUpdate({ text: e.target.value })}
            className={`w-full text-xl font-bold bg-transparent border-none focus:ring-0 resize-none overflow-hidden transition-colors ${renderTodo.completed ? 'text-gray-400 line-through' : 'text-gray-800'}`}
            rows={2}
            placeholder="Task title"
          />
        </div>

        <hr className="border-gray-100" />

        {/* Priority */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-2">
            <Flag className="w-4 h-4" /> Priority
          </label>
          <div className="flex flex-wrap gap-2">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                onClick={() => onUpdate({ priority: p })}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${priorityButtonClass(renderTodo.priority === p, p)}`}
              >
                {priorityLabel(p)}
              </button>
            ))}
          </div>
        </div>

        {/* Due Date & Time */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Due Date & Time
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="date"
              value={renderTodo.dueDate || ''}
              onChange={(e) => onUpdate({ dueDate: e.target.value })}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                type="time"
                value={renderTodo.dueTime || ''}
                onChange={(e) => onUpdate({ dueTime: e.target.value })}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
              {renderTodo.dueTime && (
                <button
                  onClick={() => onUpdate({ dueTime: '' })}
                  className="p-1 text-gray-400 hover:text-red-400 transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <hr className="border-gray-100" />

        {/* Steps */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-500 uppercase flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ListChecks className="w-4 h-4" /> Steps
            </span>
            {steps.length > 0 && (
              <span className="text-xs font-normal text-gray-400 normal-case">
                {doneCount} / {steps.length} done
              </span>
            )}
          </label>

          {steps.length > 0 && (
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${(doneCount / steps.length) * 100}%` }}
              />
            </div>
          )}

          <div className="space-y-0.5">
            {steps.map((step) => (
              <StepItem
                key={step.id}
                step={step}
                onToggle={() => toggleStep(step.id)}
                onDelete={() => deleteStep(step.id)}
                onEdit={(text) => editStep(step.id, text)}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Plus className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={newStepText}
              onChange={(e) => setNewStepText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addStep(); }}
              placeholder="Add a step..."
              className="flex-1 text-sm text-gray-700 placeholder-gray-400 bg-transparent border-b border-dashed border-gray-200 focus:outline-none focus:border-indigo-400 py-1 transition-colors"
            />
            {newStepText.trim() && (
              <button onClick={addStep} className="text-indigo-500 hover:text-indigo-700 transition">
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <hr className="border-gray-100" />

        {/* Notes */}
        <div className="space-y-2 flex-1 flex flex-col">
          <label className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-2">
            <AlignLeft className="w-4 h-4" /> Notes & Details
          </label>
          <textarea
            value={renderTodo.notes || ''}
            onChange={(e) => onUpdate({ notes: e.target.value })}
            placeholder="Add a detailed description, sub-steps, or notes..."
            className="w-full flex-1 min-h-[150px] p-3 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white transition-all resize-y"
          />
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <ConfirmModal
          title="Delete task?"
          message={`"${renderTodo.text}" will be permanently removed.`}
          onConfirm={() => {
            setShowDeleteConfirm(false);
            onDelete(renderTodo.id);
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </section>
  );
}
