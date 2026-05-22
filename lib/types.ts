export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTodoInput {
  title: string;
}

export interface UpdateTodoInput {
  title?: string;
  completed?: boolean;
}

export interface ApiResponse<T> {
  todo?: T;
  todos?: T[];
  error?: string;
}
