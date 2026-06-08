'use client';

import { useState } from 'react';
import { Menu, ListTodo } from 'lucide-react';
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
  };

  const handleSetView = (view: View) => {
    setCurrentView(view);
    setIsSidebarOpen(false);
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
        onCreatePlan={() => { createPlan(); setCurrentView('plans'); }}
        onSetView={handleSetView}
      />

      <main className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-white w-full relative">
        {/* Mobile header */}
        <div className="md:hidden p-4 border-b border-gray-200 flex items-center justify-between bg-white z-10 shadow-sm shrink-0">
          <button onClick={() => setIsSidebarOpen(true)} className="p-1 -ml-1 text-gray-600">
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-semibold text-gray-800 truncate px-4">
            {currentView === 'calendar' ? 'Calendar' : activePlan?.title}
          </span>
          <div className="w-6" />
        </div>

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
            <TodoList
              plan={activePlan}
              activeTodos={activeTodos}
              completedTodos={completedTodos}
              selectedTodoId={selectedTodoId}
              newTaskText={newTaskText}
              editingTitleId={editingTitleId}
              editedTitle={editedTitle}
              aiAddedTodoIds={aiAddedTodoIds}
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

            {/* Chat panel container — needs position:relative for the absolute ChatPanel inside */}
            <section className="flex-1 flex flex-col bg-white min-h-[50vh] md:min-h-0 relative">
              <ChatPanel
                chat={activePlan.chat}
                isTyping={isTyping}
                inputMessage={inputMessage}
                visible={!selectedTodoId}
                planTitle={activePlan.title}
                onInputChange={setInputMessage}
                onSend={handleSendMessage}
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
