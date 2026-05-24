export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
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

export interface Pattern {
  id: string;
  userId: string;
  titleHash: string;
  rawTitle: string;
  frequency: number;
  clusterId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TermDf {
  id: string;
  userId: string;
  term: string;
  df: number;
}

export interface Cluster {
  id: string;
  userId: string;
  centroid: Record<string, number>;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemporalRecord {
  id: string;
  patternId: string;
  hourBucket: number;
  dayBucket: number;
  weekBucket: number | null;
  count: number;
}

export interface Transition {
  id: string;
  userId: string;
  fromPatternId: string;
  toPatternId: string;
  count: number;
}

export interface Prediction {
  patternId: string;
  rawTitle: string;
  score: number;
  reason: string;
}

export interface NormalizedTitle {
  hash: string;
  terms: string[];
  stemmedTerms: string[];
}
