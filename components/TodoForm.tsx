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
    <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
      <input
        type="text"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          onInputChange?.(e.target.value);
        }}
        placeholder="Add a new todo..."
        maxLength={200}
        className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
      >
        Add
      </button>
    </form>
  );
}
