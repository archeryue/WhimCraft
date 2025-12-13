"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FolderGit2, Loader2 } from "lucide-react";

interface RepoInputProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function RepoInput({ onSubmit, isLoading, disabled }: RepoInputProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError("Please enter a GitHub repository URL");
      return;
    }

    // Check if it looks like a GitHub URL or shorthand
    const isShorthand = /^[\w.-]+\/[\w.-]+$/.test(trimmedUrl);
    const isGitHubUrl =
      trimmedUrl.includes("github.com") ||
      trimmedUrl.startsWith("github.com");

    if (!isShorthand && !isGitHubUrl) {
      setError("Please enter a valid GitHub URL (e.g., https://github.com/owner/repo) or shorthand (owner/repo)");
      return;
    }

    onSubmit(trimmedUrl);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="repo-url"
            className="text-sm font-medium text-slate-700"
          >
            GitHub Repository URL
          </label>
          <div className="flex gap-2">
            <input
              id="repo-url"
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              placeholder="https://github.com/owner/repo or owner/repo"
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 placeholder:text-slate-400"
              disabled={isLoading || disabled}
              data-testid="repo-url-input"
            />
            <Button
              type="submit"
              disabled={isLoading || disabled || !url.trim()}
              className="px-6"
              data-testid="repo-analyze-button"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <FolderGit2 className="w-4 h-4 mr-2" />
                  Analyze
                </>
              )}
            </Button>
          </div>
          {error && (
            <p className="text-sm text-red-600" data-testid="repo-input-error">
              {error}
            </p>
          )}
        </div>

        <p className="text-xs text-slate-500">
          Paste a GitHub repository URL to analyze its architecture. Example:{" "}
          <code className="px-1 py-0.5 bg-slate-100 rounded text-slate-600">
            https://github.com/vercel/next.js
          </code>{" "}
          or{" "}
          <code className="px-1 py-0.5 bg-slate-100 rounded text-slate-600">
            vercel/next.js
          </code>
        </p>
      </div>
    </form>
  );
}
