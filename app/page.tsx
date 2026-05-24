"use client";

import useSWR from "swr";
import { Todo } from "@/lib/types";
import { TodoForm } from "@/components/TodoForm";
import { TodoList } from "@/components/TodoList";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
};

export default function Home() {
  const { data, error, mutate } = useSWR<{ todos: Todo[] }>("/api/todos", fetcher);

  const handleCreate = async (title: string) => {
    await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    mutate();
  };

  const handleToggle = async (id: string) => {
    const todo = data?.todos?.find((t) => t.id === id);
    if (!todo) return;

    await fetch(`/api/todos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !todo.completed }),
    });
    mutate();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/todos/${id}`, { method: "DELETE" });
    mutate();
  };

  if (error) return <div className="text-center text-red-500 py-8">Failed to load todos.</div>;
  if (!data) return <div className="text-center py-8">Loading...</div>;

  return (
    <main className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-6">TODO App</h1>
      <TodoForm onSubmit={handleCreate} />
      <TodoList todos={data.todos} onToggle={handleToggle} onDelete={handleDelete} />
    </main>
  );
}
