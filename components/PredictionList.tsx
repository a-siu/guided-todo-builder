"use client";

import useSWR from "swr";
import { Prediction } from "@/lib/types";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
};

interface PredictionListProps {
  onCreateTodo: (title: string) => Promise<void>;
  query?: string;
}

export function PredictionList({ onCreateTodo, query }: PredictionListProps) {
  const swrKey = query ? `/api/predictions?query=${encodeURIComponent(query)}` : "/api/predictions";
  const { data, error } = useSWR<{ predictions: Prediction[] }>(swrKey, fetcher);

  if (error) return null;
  if (!data) return null;

  if (!data.predictions?.length) {
    if (query) {
      return (
        <div className="text-sm text-gray-400 italic mb-4">
          No matching suggestions
        </div>
      );
    }
    return (
      <div className="text-sm text-gray-400 italic mb-4">
        Create a few todos to see suggestions
      </div>
    );
  }

  return (
    <div className="mb-4">
      <ul className="flex flex-wrap gap-2">
        {data.predictions.map((p) => (
          <li key={p.patternId}>
            <button
              onClick={() => onCreateTodo(p.rawTitle)}
              className="text-sm px-3 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
              title={`${p.rawTitle} (${p.reason})`}
            >
              {p.rawTitle}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
