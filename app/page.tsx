"use client";

import { useState, useEffect } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { useSession, signOut } from "next-auth/react";
import { Todo } from "@/lib/types";
import { TodoForm } from "@/components/TodoForm";
import { TodoList } from "@/components/TodoList";
import { PredictionList } from "@/components/PredictionList";
import { AuthGuard } from "@/components/AuthGuard";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
};

function HomeContent() {
  const { data: session } = useSession();
  const { data, error, mutate } = useSWR<{ todos: Todo[] }>("/api/todos", fetcher);
  const [inputValue, setInputValue] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(inputValue), 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const handleCreate = async (title: string) => {
    await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    mutate();
    globalMutate("/api/predictions");
    setInputValue("");
    setDebouncedQuery("");
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

  if (error) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-white rounded-2xl px-8 py-6 shadow-sm border border-red-100">
        <p className="text-cta-600 text-center">Failed to load todos.</p>
      </div>
    </div>
  );

  if (!data) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-pulse text-primary-400 text-lg">Loading...</div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-primary-900">Tasks</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-primary-600 font-medium">{session?.user?.name}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-primary-500 hover:text-primary-700 transition-colors duration-150 font-medium"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-primary-100 p-5">
          <TodoForm onSubmit={handleCreate} onInputChange={setInputValue} />
          <PredictionList onCreateTodo={handleCreate} query={debouncedQuery} />
        </div>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-primary-700 uppercase tracking-wide">
              {data.todos?.length || 0} {data.todos?.length === 1 ? "task" : "tasks"}
            </h2>
          </div>
          <TodoList todos={data.todos} onToggle={handleToggle} onDelete={handleDelete} />
        </section>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <AuthGuard>
      <HomeContent />
    </AuthGuard>
  );
}
