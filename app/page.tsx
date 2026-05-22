"use client";

import useSWR from "swr";
import { useSession, signOut } from "next-auth/react";
import { Todo } from "@/lib/types";
import { TodoForm } from "@/components/TodoForm";
import { TodoList } from "@/components/TodoList";
import { AuthGuard } from "@/components/AuthGuard";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function HomeContent() {
  const { data: session } = useSession();
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">TODO App</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{session?.user?.name}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-red-500 hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
      <TodoForm onSubmit={handleCreate} />
      <TodoList todos={data.todos} onToggle={handleToggle} onDelete={handleDelete} />
    </main>
  );
}

export default function Home() {
  return (
    <AuthGuard>
      <HomeContent />
    </AuthGuard>
  );
}
