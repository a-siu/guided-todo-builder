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
        <div className="text-xs text-primary-400 italic mt-3">No matching suggestions</div>
      );
    }
    return null;
  }

  return (
    <div className="mt-3 pt-3 border-t border-primary-100">
      <ul className="flex flex-wrap gap-1.5">
        {data.predictions.map((p) => (
          <li key={p.patternId}>
            <button
              onClick={() => onCreateTodo(p.rawTitle)}
              className="text-xs px-3 py-1 rounded-full bg-primary-100 text-primary-700 hover:bg-primary-200 active:bg-primary-300 transition-all duration-150 cursor-pointer"
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
