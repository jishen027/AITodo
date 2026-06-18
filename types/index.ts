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
  location?: string;
  locationLat?: number | null;
  locationLng?: number | null;
  myDay?: boolean;
  myDayOrder?: number;
  createdAt?: string;
  completedAt?: string | null;
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
  isMyDay?: boolean;
}

export interface TodoWithPlan extends Todo {
  planId: string;
  planTitle: string;
}

export interface MyDaySuggestion extends TodoWithPlan {
  reason: string;
}

export interface ChatOptions {
  type: 'single' | 'multi';
  options: string[];
}
