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
  deletedAt?: Date | null;
}

export interface ApiResponse<T> {
  todo?: T;
  todos?: T[];
  error?: string;
}

export interface AuthUser {
  id: string;
  username: string;
}

export interface RegisterInput {
  username: string;
  password: string;
}

export interface AuthResponse {
  user?: AuthUser;
  error?: string;
}
