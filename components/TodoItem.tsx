"use client";

import { Todo } from "@/lib/types";

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TodoItem({ todo, onToggle, onDelete }: TodoItemProps) {
  return (
    <div className="group flex items-center gap-3 bg-white rounded-xl border border-primary-100 shadow-sm px-4 py-3 hover:border-primary-200 hover:shadow-md transition-all duration-200 cursor-pointer">
      <button
        onClick={() => onToggle(todo.id)}
        className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 cursor-pointer ${
          todo.completed
            ? "bg-primary-500 border-primary-500"
            : "border-primary-300 hover:border-primary-500"
        }`}
      >
        {todo.completed && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <span
        className={`flex-1 text-sm transition-all duration-200 ${
          todo.completed ? "line-through text-primary-300" : "text-primary-800"
        }`}
      >
        {todo.title}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(todo.id);
        }}
        className="opacity-0 group-hover:opacity-100 px-2 py-1 text-xs font-medium text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 cursor-pointer"
      >
        Delete
      </button>
    </div>
  );
}
