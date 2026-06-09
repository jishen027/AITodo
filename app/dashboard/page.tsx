'use client';

import { useState } from 'react';
import { Menu, ListTodo, MessageSquare } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import TodoList from '@/components/TodoList';
import ChatPanel from '@/components/ChatPanel';
import TodoDetails from '@/components/TodoDetails';
import CalendarView from '@/components/CalendarView';
import { usePlans } from '@/hooks/usePlans';

type View = 'plans' | 'calendar';

export default function Home() {
  const {
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
    isTyping,
    streamingText,
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
    clearAiAddedTodoIds,
  } = usePlans();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState<View>('plans');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [mobilePlanTab, setMobilePlanTab] = useState<'tasks' | 'chat'>('tasks');

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 text-gray-400">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Loading plans…</p>
        </div>
      </div>
    );
  }

  if (!activePlanId && plans.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 text-gray-500">
        <div className="text-center">
          <ListTodo className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-lg">No plans yet. Create one to get started.</p>
          <button
            onClick={createPlan}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            New Plan
          </button>
        </div>
      </div>
    );
  }

  const handleSelectPlan = (id: string) => {
    setActivePlanId(id);
    setCurrentView('plans');
    setIsSidebarOpen(false);
    setMobilePlanTab('tasks');
  };

  const handleSetView = (view: View) => {
    setCurrentView(view);
    setIsSidebarOpen(false);
    if (view === 'plans') setMobilePlanTab('tasks');
  };

  return (
    <div className="flex h-screen bg-white font-sans overflow-hidden">
      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <Sidebar
        plans={plans}
        activePlanId={activePlanId ?? ''}
        currentView={currentView}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onSelectPlan={handleSelectPlan}
        onDeletePlan={deletePlan}
        onCreatePlan={() => { createPlan(); setCurrentView('plans'); setMobilePlanTab('tasks'); }}
        onSetView={handleSetView}
      />

      <main className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-white w-full relative">
        {/* Mobile header */}
        <div className="md:hidden p-4 border-b border-gray-200 flex items-center justify-between bg-white z-10 shadow-sm shrink-0">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-gray-600">
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-semibold text-gray-800 truncate px-4">
            {currentView === 'calendar' ? 'Calendar' : activePlan?.title}
          </span>
          <div className="w-10" />
        </div>

        {/* Mobile tab bar — only in plans view with an active plan */}
        {currentView === 'plans' && activePlan && (
          <div className="md:hidden flex border-b border-gray-200 bg-white shrink-0">
            <button
              onClick={() => setMobilePlanTab('tasks')}
              className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors ${mobilePlanTab === 'tasks' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}
            >
              <ListTodo className="w-4 h-4" /> Tasks
            </button>
            <button
              onClick={() => setMobilePlanTab('chat')}
              className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors ${mobilePlanTab === 'chat' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}
            >
              <MessageSquare className="w-4 h-4" /> Chat
            </button>
          </div>
        )}

        {currentView === 'calendar' ? (
          <CalendarView
            allTodos={allTodos}
            sortedAllTodos={sortedAllTodos}
            selectedTodoId={selectedTodoId}
            currentDate={currentDate}
            onSelectTodo={setSelectedTodoId}
            onToggleTodo={toggleTodo}
            onSetCurrentDate={setCurrentDate}
          />
        ) : activePlan ? (
          <>
            {/* Wrapper uses display:contents so TodoList's flex sizing still applies to main;
                hidden md:contents hides on mobile when chat tab is active */}
            <div className={mobilePlanTab === 'chat' ? 'hidden md:contents' : 'contents'}>
              <TodoList
                plan={activePlan}
                activeTodos={activeTodos}
                completedTodos={completedTodos}
                selectedTodoId={selectedTodoId}
                newTaskText={newTaskText}
                editingTitleId={editingTitleId}
                editedTitle={editedTitle}
                aiAddedTodoIds={aiAddedTodoIds}
                isAiUpdating={isTyping}
                onAnimationDone={clearAiAddedTodoIds}
                onSelectTodo={setSelectedTodoId}
                onToggleTodo={toggleTodo}
                onDeleteTodo={deleteTodo}
                onAddTodo={addTodoManual}
                onNewTaskTextChange={setNewTaskText}
                onStartEditTitle={() => { setEditingTitleId(activePlan.id); setEditedTitle(activePlan.title); }}
                onEditedTitleChange={setEditedTitle}
                onUpdatePlanTitle={updatePlanTitle}
              />
            </div>

            {/* Chat panel container — hidden on mobile when tasks tab is active */}
            <section className={`${mobilePlanTab === 'tasks' ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-white md:min-h-0 relative`}>
              <ChatPanel
                chat={activePlan.chat}
                isTyping={isTyping}
                streamingText={streamingText}
                inputMessage={inputMessage}
                visible={!selectedTodoId}
                planTitle={activePlan.title}
                onInputChange={setInputMessage}
                onSend={handleSendMessage}
              />
              {/* Frosted-glass overlay — fades in when TodoDetails is open */}
              <div
                className={`absolute inset-0 z-10 bg-white/40 backdrop-blur-sm pointer-events-none transition-opacity duration-300 ${
                  selectedTodoId ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </section>
          </>
        ) : null}

        {/* Global slide-over details panel */}
        <TodoDetails
          todo={selectedTodo}
          onClose={() => setSelectedTodoId(null)}
          onToggle={toggleTodo}
          onDelete={deleteTodo}
          onUpdate={updateSelectedTodo}
        />
      </main>
    </div>
  );
}
