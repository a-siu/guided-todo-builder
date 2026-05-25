"use client";

import { useState } from "react";

interface TodoFormProps {
  onSubmit: (title: string) => void;
  onInputChange?: (value: string) => void;
}

export function TodoForm({ onSubmit, onInputChange }: TodoFormProps) {
  const [title, setTitle] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onSubmit(title.trim());
      setTitle("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <div className="relative flex-1">
        <input
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            onInputChange?.(e.target.value);
          }}
          placeholder="Add a new task..."
          maxLength={200}
          className="w-full px-4 py-2.5 bg-primary-50/50 border border-primary-200 rounded-xl text-primary-900 placeholder-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-all duration-200 text-sm"
        />
      </div>
      <button
        type="submit"
        className="px-5 py-2.5 bg-cta-500 text-white rounded-xl font-medium text-sm hover:bg-cta-600 active:bg-cta-700 transition-all duration-150 shadow-sm hover:shadow-md cursor-pointer"
      >
        Add
      </button>
    </form>
  );
}
