'use client';

import { X, Plus, ListTodo, Trash2, LayoutDashboard, CalendarDays, LogOut, Sun } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { Plan } from '@/types';

type View = 'myday' | 'plans' | 'calendar';

interface SidebarProps {
  plans: Plan[];
  activePlanId: string;
  currentView: View;
  myDayCount: number;
  isOpen: boolean;
  onClose: () => void;
  onSelectPlan: (id: string) => void;
  onDeletePlan: (id: string) => void;
  onCreatePlan: () => void;
  onSetView: (view: View) => void;
}

export default function Sidebar({
  plans,
  activePlanId,
  currentView,
  myDayCount,
  isOpen,
  onClose,
  onSelectPlan,
  onDeletePlan,
  onCreatePlan,
  onSetView,
}: SidebarProps) {
  const { data: session } = useSession();
  const userName = session?.user?.name ?? session?.user?.email ?? '';
  const initials = userName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <aside
      className={`
        fixed md:static inset-y-0 left-0 z-30 w-64 bg-gray-50 border-r border-gray-200
        transform transition-transform duration-300 ease-in-out flex flex-col shrink-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}
    >
      <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="AI Todo" className="w-6 h-6 rounded-md" />
          AI Todo
        </h1>
        <button onClick={onClose} className="md:hidden p-1 text-gray-500 hover:bg-gray-200 rounded">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* Views */}
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2 mt-2">
          Views
        </div>
        <div
          onClick={() => onSetView('myday')}
          className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${currentView === 'myday' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-100'}`}
        >
          <div className="flex items-center gap-3">
            <Sun className={`w-4 h-4 ${currentView === 'myday' ? 'text-indigo-600' : 'text-amber-400'}`} />
            <span className="text-sm font-medium">My Day</span>
          </div>
          {myDayCount > 0 && (
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${currentView === 'myday' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-500'}`}>
              {myDayCount}
            </span>
          )}
        </div>
        <div
          onClick={() => onSetView('plans')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${currentView === 'plans' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-100'}`}
        >
          <LayoutDashboard className={`w-4 h-4 ${currentView === 'plans' ? 'text-indigo-600' : 'text-gray-400'}`} />
          <span className="text-sm font-medium">Task Plans</span>
        </div>
        <div
          onClick={() => onSetView('calendar')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors mb-4 ${currentView === 'calendar' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-100'}`}
        >
          <CalendarDays className={`w-4 h-4 ${currentView === 'calendar' ? 'text-indigo-600' : 'text-gray-400'}`} />
          <span className="text-sm font-medium">Calendar</span>
        </div>

        {/* Plans */}
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2 mt-4">
          My Plans
        </div>
        {plans.map((plan) => (
          <div
            key={plan.id}
            onClick={() => onSelectPlan(plan.id)}
            className={`
              group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors
              ${activePlanId === plan.id && currentView === 'plans' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-100'}
            `}
          >
            <div className="flex items-center gap-3 truncate">
              <ListTodo className={`w-4 h-4 flex-shrink-0 ${activePlanId === plan.id ? 'text-indigo-600' : 'text-gray-400'}`} />
              <span className="truncate text-sm font-medium">{plan.title}</span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDeletePlan(plan.id); }}
              className="md:opacity-0 md:group-hover:opacity-100 p-2 text-gray-400 hover:text-red-500 rounded transition flex-shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-gray-200 space-y-3">
        <button
          onClick={onCreatePlan}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> New Plan
        </button>

        {/* User info + sign out */}
        <div className="flex items-center gap-2 px-1">
          <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
            {initials || '?'}
          </div>
          <span className="text-xs text-gray-600 truncate flex-1">{userName}</span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            title="Sign out"
            className="p-1 text-gray-400 hover:text-red-500 rounded transition flex-shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
