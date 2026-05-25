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
}

export function PredictionList({ onCreateTodo }: PredictionListProps) {
  const { data, error } = useSWR<{ predictions: Prediction[] }>(
    "/api/predictions?minFrequency=3",
    fetcher
  );

  if (error) return null;
  if (!data?.predictions?.length) return null;

  return (
    <div className="w-48 shrink-0">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
        Suggestions
      </h2>
      <ul className="space-y-1">
        {data.predictions.map((p) => (
          <li key={p.patternId}>
            <button
              onClick={() => onCreateTodo(p.rawTitle)}
              className="w-full text-left text-sm px-2 py-1 rounded hover:bg-blue-50 hover:text-blue-700 text-gray-600 truncate transition-colors"
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
