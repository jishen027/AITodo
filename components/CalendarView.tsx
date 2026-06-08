'use client';

import { CheckCircle2, Circle, Flag, Calendar, ListTodo, ChevronLeft } from 'lucide-react';
import { TodoWithPlan } from '@/types';
import { formatYMD } from '@/lib/utils';

interface CalendarViewProps {
  allTodos: TodoWithPlan[];
  sortedAllTodos: TodoWithPlan[];
  selectedTodoId: string | null;
  currentDate: Date;
  onSelectTodo: (id: string) => void;
  onToggleTodo: (id: string, e: React.MouseEvent) => void;
  onSetCurrentDate: (date: Date) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function generateCalendarDays(currentDate: Date): (Date | null)[] {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const days: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
  return days;
}

export default function CalendarView({
  allTodos,
  sortedAllTodos,
  selectedTodoId,
  currentDate,
  onSelectTodo,
  onToggleTodo,
  onSetCurrentDate,
}: CalendarViewProps) {
  const today = formatYMD(new Date());
  const monthLabel = currentDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="flex-1 flex flex-col md:flex-row w-full h-full overflow-hidden relative">
      {/* All Tasks List */}
      <section className="w-full md:w-[35%] lg:w-[30%] border-r border-gray-200 bg-[#FAFAFA] flex flex-col h-[40vh] md:h-full shrink-0 z-0">
        <div className="p-4 md:p-6 pb-2 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <ListTodo className="w-5 h-5 text-indigo-600" />
            All Tasks
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {sortedAllTodos.map((todo) => (
            <div
              key={todo.id}
              onClick={() => onSelectTodo(todo.id)}
              className={`
                group flex items-start gap-3 p-3 rounded-xl shadow-sm border transition-all cursor-pointer
                ${selectedTodoId === todo.id ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-transparent hover:border-gray-200'}
                ${todo.completed ? 'opacity-60' : ''}
              `}
            >
              <button
                onClick={(e) => onToggleTodo(todo.id, e)}
                className={`mt-0.5 flex-shrink-0 ${todo.completed ? 'text-indigo-500' : 'text-gray-300 hover:text-indigo-500'}`}
              >
                {todo.completed ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${todo.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                  {todo.text}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded truncate max-w-[120px]">
                    {todo.planTitle}
                  </span>
                  {todo.dueDate && (
                    <span className="flex items-center gap-1 text-indigo-600 font-medium whitespace-nowrap">
                      <Calendar className="w-3 h-3" /> {todo.dueDate}{todo.dueTime ? ` ${todo.dueTime}` : ''}
                    </span>
                  )}
                  {todo.priority && todo.priority !== 'none' && (
                    <Flag className={`w-3 h-3 ${
                      todo.priority === 'high' ? 'text-red-500'
                      : todo.priority === 'medium' ? 'text-yellow-500'
                      : 'text-blue-500'
                    }`} />
                  )}
                </div>
              </div>
            </div>
          ))}
          {sortedAllTodos.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm">No tasks</div>
          )}
        </div>
      </section>

      {/* Calendar Grid */}
      <section className="flex-1 bg-white flex flex-col h-full overflow-hidden z-0">
        <div className="p-4 md:p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold text-gray-800">{monthLabel}</h2>
          <div className="flex gap-2">
            <button
              onClick={() => onSetCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => onSetCurrentDate(new Date())}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              Today
            </button>
            <button
              onClick={() => onSetCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              <ChevronLeft className="w-5 h-5 rotate-180" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50/50">
          <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            {WEEKDAYS.map((day) => (
              <div key={day} className="bg-gray-50/80 py-2 text-center text-xs font-semibold text-gray-500">
                {day}
              </div>
            ))}
            {generateCalendarDays(currentDate).map((date, i) => {
              if (!date) return <div key={`empty-${i}`} className="bg-white min-h-[56px] md:min-h-[100px]" />;
              const dateStr = formatYMD(date);
              const dayTodos = allTodos
                .filter((t) => t.dueDate === dateStr)
                .sort((a, b) => (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99'));
              const isToday = dateStr === today;

              return (
                <div key={dateStr} className="bg-white min-h-[56px] md:min-h-[100px] p-1.5 md:p-2 flex flex-col hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-center mb-1">
                    <span className={`text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white' : 'text-gray-700'}`}>
                      {date.getDate()}
                    </span>
                    {dayTodos.length > 0 && (
                      <span className="text-[10px] text-gray-400 font-medium hidden md:inline-block">
                        {dayTodos.length} {dayTodos.length === 1 ? 'task' : 'tasks'}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col gap-1 overflow-y-auto max-h-[80px]">
                    {dayTodos.map((todo) => (
                      <div
                        key={todo.id}
                        onClick={() => onSelectTodo(todo.id)}
                        className={`text-xs p-1 rounded truncate cursor-pointer transition-colors ${
                          todo.completed
                            ? 'bg-gray-100 text-gray-400 line-through'
                            : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                        }`}
                        title={todo.dueTime ? `${todo.dueTime} — ${todo.text}` : todo.text}
                      >
                        {todo.dueTime && (
                          <span className="font-semibold mr-1 opacity-70">{todo.dueTime}</span>
                        )}
                        {todo.text}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
