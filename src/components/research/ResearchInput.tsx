"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Search, Loader2 } from "lucide-react";

interface ResearchInputProps {
  onSubmit: (query: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function ResearchInput({
  onSubmit,
  isLoading,
  disabled,
}: ResearchInputProps) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = query.trim();
    if (trimmed.length < 10) {
      setError(
        "Please provide a more detailed research query (at least 10 characters)"
      );
      return;
    }

    onSubmit(trimmed);
  };

  const charCount = query.trim().length;
  const isValid = charCount >= 10;

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="research-query"
            className="text-sm font-medium text-slate-700"
          >
            Research Query
          </label>
          <textarea
            id="research-query"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setError(null);
            }}
            placeholder="Enter your research topic or question. Be specific for better results...

Example: Explain the history and current state of quantum computing, including major milestones and future prospects."
            className="w-full min-h-[140px] px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-900 placeholder:text-slate-400 resize-y"
            disabled={isLoading || disabled}
            data-testid="research-query-input"
          />
          <div className="flex justify-between items-center">
            <Button
              type="submit"
              disabled={isLoading || disabled || !isValid}
              className="px-6 bg-teal-600 hover:bg-teal-700"
              data-testid="research-start-button"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Researching...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Start Research
                </>
              )}
            </Button>
            <span
              className={`text-xs ${isValid ? "text-slate-500" : "text-slate-400"}`}
            >
              {charCount}/10 min characters
            </span>
          </div>
          {error && (
            <p
              className="text-sm text-red-600"
              data-testid="research-input-error"
            >
              {error}
            </p>
          )}
        </div>

        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
          <p className="text-xs text-slate-600">
            <strong>About Deep Research:</strong> This feature uses AI to
            thoroughly research topics across the web, synthesizing information
            from multiple sources into a comprehensive report with citations.
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Research typically takes <strong>10-20 minutes</strong> to complete.
            You can leave this page open while it runs.
          </p>
        </div>
      </div>
    </form>
  );
}
