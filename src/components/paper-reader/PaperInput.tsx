"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";

interface PaperInputProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function PaperInput({ onSubmit, isLoading, disabled }: PaperInputProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError("Please enter a paper URL");
      return;
    }

    // Basic URL validation
    try {
      new URL(trimmedUrl);
    } catch {
      setError("Please enter a valid URL");
      return;
    }

    // Check if it's an arXiv URL (MVP only)
    if (!trimmedUrl.includes("arxiv.org")) {
      setError("Currently only arXiv URLs are supported");
      return;
    }

    onSubmit(trimmedUrl);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="paper-url"
            className="text-sm font-medium text-slate-700"
          >
            Paper URL
          </label>
          <div className="flex gap-2">
            <input
              id="paper-url"
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              placeholder="https://arxiv.org/abs/2401.12345"
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 placeholder:text-slate-400"
              disabled={isLoading || disabled}
              data-testid="paper-url-input"
            />
            <Button
              type="submit"
              disabled={isLoading || disabled || !url.trim()}
              className="px-6"
              data-testid="paper-analyze-button"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 mr-2" />
                  Analyze
                </>
              )}
            </Button>
          </div>
          {error && <p className="text-sm text-red-600" data-testid="paper-input-error">{error}</p>}
        </div>

        <p className="text-xs text-slate-500">
          Paste an arXiv paper URL to analyze. Example:{" "}
          <code className="px-1 py-0.5 bg-slate-100 rounded text-slate-600">
            https://arxiv.org/abs/1706.03762
          </code>
        </p>
      </div>
    </form>
  );
}
