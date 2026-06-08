export type Priority = 'high' | 'medium' | 'low' | 'none';

export interface Step {
  id: string;
  text: string;
  completed: boolean;
}

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  notes: string;
  dueDate: string;
  dueTime: string;
  priority: Priority;
  steps: Step[];
}

export interface ChatMessage {
  role: 'ai' | 'user';
  text: string;
}

export interface Plan {
  id: string;
  title: string;
  todos: Todo[];
  chat: ChatMessage[];
}

export interface TodoWithPlan extends Todo {
  planId: string;
  planTitle: string;
}
