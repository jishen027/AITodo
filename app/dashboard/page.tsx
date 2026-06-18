'use client';

import { useState } from 'react';
import { Menu, ListTodo, MessageSquare } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import TodoList from '@/components/TodoList';
import ChatPanel from '@/components/ChatPanel';
import TodoDetails from '@/components/TodoDetails';
import CalendarView from '@/components/CalendarView';
import MyDayView from '@/components/MyDayView';
import { usePlans } from '@/hooks/usePlans';
import { useSwipe } from '@/hooks/useSwipe';

type View = 'myday' | 'plans' | 'calendar';

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
    myDayTodos,
    toggleMyDay,
    myDaySuggestions,
    dueSoonTodos,
    recentlyAddedTodos,
    suggestionsLoading,
    suggestionsError,
    suggestionsLoaded,
    loadSuggestions,
    dismissSuggestion,
    selectedTodo,
    selectedTodoId,
    setSelectedTodoId,
    inputMessage,
    setInputMessage,
    isTyping,
    isPlanProposed,
    streamingText,
    isLoading,
    newTaskText,
    setNewTaskText,
    editingTitleId,
    setEditingTitleId,
    editedTitle,
    setEditedTitle,
    refreshPlans,
    createPlan,
    deletePlan,
    updatePlanTitle,
    toggleTodo,
    deleteTodo,
    addTodoManual,
    reorderTodos,
    reorderMyDay,
    updateSelectedTodo,
    handleSendMessage,
    activeChatOptions,
    activePendingDelta,
    applyUpsertItem,
    applyRemoveItem,
    applyAllDelta,
    dismissDelta,
    aiAddedTodoIds,
    clearAiAddedTodoIds,
  } = usePlans();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState<View>('myday');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [mobilePlanTab, setMobilePlanTab] = useState<'tasks' | 'chat'>('tasks');
  // Desktop only: whether the AI chat side panel is open. It slides in/out; on
  // mobile the chat is reached via the tab bar instead, so this is ignored there.
  const [isChatOpen, setIsChatOpen] = useState(true);

  // Mobile: swipe right from the left edge opens the nav menu.
  const edgeSwipe = useSwipe({
    onSwipeRight: () => setIsSidebarOpen(true),
    edgeSwipeRight: true,
  });

  if (isLoading) {
    return (
      <div className="flex h-screen supports-[height:100dvh]:h-dvh items-center justify-center bg-gray-50 text-gray-400">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Loading plans…</p>
        </div>
      </div>
    );
  }

  if (!activePlanId && plans.length === 0) {
    return (
      <div className="flex h-screen supports-[height:100dvh]:h-dvh items-center justify-center bg-gray-50 text-gray-500">
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
    <div className="flex h-screen supports-[height:100dvh]:h-dvh bg-white font-sans overflow-hidden">
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
        myDayCount={myDayTodos.filter((t) => !t.completed).length}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onSelectPlan={handleSelectPlan}
        onDeletePlan={deletePlan}
        onCreatePlan={() => { createPlan(); setCurrentView('plans'); setMobilePlanTab('tasks'); }}
        onSetView={handleSetView}
      />

      <main
        className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-white w-full relative"
        onTouchStart={edgeSwipe.onTouchStart}
        onTouchEnd={edgeSwipe.onTouchEnd}
      >
        {/* Mobile header */}
        <div className="md:hidden p-4 border-b border-gray-200 flex items-center justify-between bg-white z-10 shadow-sm shrink-0">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-gray-600">
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-semibold text-gray-800 truncate px-4">
            {currentView === 'calendar' ? 'Calendar' : currentView === 'myday' ? 'My Day' : activePlan?.title}
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
        ) : currentView === 'myday' ? (
          <MyDayView
            onRefresh={refreshPlans}
            myDayTodos={myDayTodos}
            selectedTodoId={selectedTodoId}
            onSelectTodo={setSelectedTodoId}
            onToggleTodo={toggleTodo}
            onRemoveFromMyDay={toggleMyDay}
            onReorderMyDay={reorderMyDay}
            suggestions={myDaySuggestions}
            dueSoonTodos={dueSoonTodos}
            recentlyAddedTodos={recentlyAddedTodos}
            suggestionsLoading={suggestionsLoading}
            suggestionsError={suggestionsError}
            suggestionsLoaded={suggestionsLoaded}
            onLoadSuggestions={loadSuggestions}
            onAddToMyDay={toggleMyDay}
            onDismissSuggestion={dismissSuggestion}
          />
        ) : activePlan ? (
          <>
            {/* Wrapper uses display:contents so TodoList's flex sizing still applies to main;
                hidden md:contents hides on mobile when chat tab is active */}
            <div className={mobilePlanTab === 'chat' ? 'hidden md:contents' : 'contents'}>
              <TodoList
                onRefresh={refreshPlans}
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
                onToggleMyDay={toggleMyDay}
                onDeleteTodo={deleteTodo}
                onReorderTodos={(ids) => reorderTodos(activePlan.id, ids)}
                onAddTodo={addTodoManual}
                onNewTaskTextChange={setNewTaskText}
                onStartEditTitle={() => { setEditingTitleId(activePlan.id); setEditedTitle(activePlan.title); }}
                onEditedTitleChange={setEditedTitle}
                onUpdatePlanTitle={updatePlanTitle}
              />
            </div>

            {/* Chat panel container — hidden on mobile when tasks tab is active.
                On desktop it slides in/out by animating its width; the inner is a
                fixed-width box pinned to the right so the chat content doesn't
                reflow during the animation. */}
            <section
              className={`
                ${mobilePlanTab === 'tasks' ? 'hidden md:flex' : 'flex flex-1'}
                md:flex-none flex-col bg-white md:min-h-0 relative overflow-hidden shrink-0
                md:transition-[width] md:duration-300 md:ease-in-out
                ${isChatOpen ? 'md:w-[24rem] lg:w-[30rem] xl:w-[34rem]' : 'md:w-0'}
              `}
            >
              <div className="absolute inset-0 md:left-auto md:right-0 md:w-[24rem] lg:w-[30rem] xl:w-[34rem] md:border-l md:border-gray-100">
                <ChatPanel
                  chat={activePlan.chat}
                  isTyping={isTyping}
                  streamingText={streamingText}
                  inputMessage={inputMessage}
                  visible={!selectedTodoId}
                  planTitle={activePlan.title}
                  chatOptions={activeChatOptions}
                  isPlanProposed={isPlanProposed}
                  pendingDelta={activePendingDelta}
                  currentTodos={activeTodos}
                  onInputChange={setInputMessage}
                  onSend={handleSendMessage}
                  onApplyUpsert={(id) => applyUpsertItem(activePlan.id, id)}
                  onApplyRemove={(id) => applyRemoveItem(activePlan.id, id)}
                  onApplyAll={() => applyAllDelta(activePlan.id)}
                  onDismissDelta={() => dismissDelta(activePlan.id)}
                  onClose={() => setIsChatOpen(false)}
                />
              </div>
            </section>

            {/* Desktop reopen tab — appears at the right edge once the chat is collapsed */}
            {!isChatOpen && (
              <button
                onClick={() => setIsChatOpen(true)}
                title="Open AI Assistant"
                aria-label="Open AI Assistant"
                className="hidden md:flex items-center justify-center absolute right-0 top-1/2 -translate-y-1/2 z-20 w-10 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-l-xl shadow-lg transition-colors"
              >
                <MessageSquare className="w-5 h-5" />
              </button>
            )}
          </>
        ) : null}

        {/* Global details drawer (vaul) — right-side on desktop, bottom sheet on mobile */}
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
