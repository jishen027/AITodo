'use client';

import { Plus, Pencil, Trash2, CheckCheck, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Todo } from '@/types';
import { UpsertTodo } from '@/lib/schemas';
import { getPriorityColor } from '@/lib/utils';

interface Props {
  upsert: UpsertTodo[];
  remove: string[];
  currentTodos: Todo[];
  onApplyUpsert: (id: string) => void;
  onApplyRemove: (id: string) => void;
  onApplyAll: () => void;
  onDismiss: () => void;
}

const PRIORITY_LABEL: Record<string, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: '',
};

function formatDue(date: string, time: string) {
  if (!date) return null;
  const d = new Date(`${date}T${time || '00:00'}`);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (time) { opts.hour = 'numeric'; opts.minute = '2-digit'; }
  return d.toLocaleString(undefined, opts);
}

export default function PlanDeltaPreview({
  upsert,
  remove,
  currentTodos,
  onApplyUpsert,
  onApplyRemove,
  onApplyAll,
  onDismiss,
}: Props) {
  const [expanded, setExpanded] = useState(true);

  const totalChanges = upsert.length + remove.length;
  if (totalChanges === 0) return null;

  const adds = upsert.filter((u) => !currentTodos.some((t) => t.id === u.id && !t.completed));
  const updates = upsert.filter((u) => currentTodos.some((t) => t.id === u.id && !t.completed));
  const removes = remove.map((id) => ({
    id,
    text: currentTodos.find((t) => t.id === id)?.text ?? '(deleted task)',
  }));

  return (
    <div className="mx-4 mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 overflow-hidden shadow-sm">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-indigo-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
            {totalChanges}
          </span>
          <span className="text-sm font-semibold text-indigo-800">
            AI proposed {totalChanges} change{totalChanges !== 1 ? 's' : ''} — review &amp; confirm
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-indigo-500 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-indigo-500 shrink-0" />
        )}
      </button>

      {expanded && (
        <>
          <div className="divide-y divide-indigo-100/60">
            {/* Adds */}
            {adds.map((up) => (
              <div key={up.id} className="px-4 py-3 bg-white/70 flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Plus className="w-3 h-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 leading-snug truncate">{up.text}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    {up.priority && up.priority !== 'none' && (
                      <span className={`text-xs font-medium ${getPriorityColor(up.priority)}`}>
                        {PRIORITY_LABEL[up.priority]}
                      </span>
                    )}
                    {up.dueDate && (
                      <span className="text-xs text-gray-400">{formatDue(up.dueDate, up.dueTime)}</span>
                    )}
                    {up.location && (
                      <span className="text-xs text-gray-400 truncate max-w-[140px]">{up.location}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onApplyUpsert(up.id)}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
            ))}

            {/* Updates */}
            {updates.map((up) => (
              <div key={up.id} className="px-4 py-3 bg-white/70 flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Pencil className="w-3 h-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 leading-snug truncate">{up.text}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    {up.priority && up.priority !== 'none' && (
                      <span className={`text-xs font-medium ${getPriorityColor(up.priority)}`}>
                        {PRIORITY_LABEL[up.priority]}
                      </span>
                    )}
                    {up.dueDate && (
                      <span className="text-xs text-gray-400">{formatDue(up.dueDate, up.dueTime)}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onApplyUpsert(up.id)}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <Pencil className="w-3 h-3" /> Apply
                </button>
              </div>
            ))}

            {/* Removes */}
            {removes.map(({ id, text }) => (
              <div key={id} className="px-4 py-3 bg-white/70 flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-red-100 text-red-500 flex items-center justify-center shrink-0 mt-0.5">
                  <Trash2 className="w-3 h-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-500 line-through leading-snug truncate">{text}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Will be deleted</p>
                </div>
                <button
                  onClick={() => onApplyRemove(id)}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
            ))}
          </div>

          {/* Footer actions */}
          <div className="px-4 py-3 flex items-center justify-between gap-3 border-t border-indigo-100/60 bg-white/40">
            <button
              onClick={onApplyAll}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <CheckCheck className="w-4 h-4" /> Apply all
            </button>
            <button
              onClick={onDismiss}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" /> Dismiss
            </button>
          </div>
        </>
      )}
    </div>
  );
}
