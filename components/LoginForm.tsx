"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid username or password");
    } else {
      router.push("/");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-primary-700">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your username"
          maxLength={50}
          className="w-full px-4 py-2.5 bg-primary-50/50 border border-primary-200 rounded-xl text-primary-900 placeholder-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-all duration-200 text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-primary-700">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          className="w-full px-4 py-2.5 bg-primary-50/50 border border-primary-200 rounded-xl text-primary-900 placeholder-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 transition-all duration-200 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-2.5 bg-cta-500 text-white rounded-xl font-medium text-sm hover:bg-cta-600 active:bg-cta-700 transition-all duration-150 shadow-sm hover:shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
}
