"use client";

import { useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LoadingPage } from "@/components/ui/loading";
import { ResearchInput } from "@/components/research/ResearchInput";
import { ResearchProgress } from "@/components/research/ResearchProgress";
import { ResearchReport } from "@/components/research/ResearchReport";
import { ResearchActions } from "@/components/research/ResearchActions";
import { Search, ArrowLeft } from "lucide-react";
import Link from "next/link";

type PageState = "input" | "researching" | "complete" | "error";

interface ResearchProgressData {
  stage: string;
  progress: number;
  message: string;
  thoughtSummary?: string;
  partialReport?: string;
  error?: string;
}

interface ResearchResultData {
  success: boolean;
  query: string;
  report: string;
  citations: Array<{ url: string; title?: string }>;
  metadata: {
    interactionId: string;
    completedAt: string;
    durationMs: number;
  };
}

export default function ResearchPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [pageState, setPageState] = useState<PageState>("input");
  const [progress, setProgress] = useState<ResearchProgressData | null>(null);
  const [result, setResult] = useState<ResearchResultData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startTimeRef = useRef<number>(0);

  // Redirect to login if not authenticated
  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  const handleSubmit = async (query: string) => {
    setPageState("researching");
    setProgress(null);
    setResult(null);
    setError(null);
    startTimeRef.current = Date.now();

    try {
      const response = await fetch("/api/research/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (response.status === 429) {
        const data = await response.json();
        setError(data.message || "Rate limit exceeded");
        setPageState("error");
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to start research");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Failed to read response");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.result) {
                // Final result
                setResult(data.result);
                setPageState("complete");
              } else if (data.stage === "error") {
                setError(data.error || "Research failed");
                setPageState("error");
              } else {
                setProgress(data);
              }
            } catch (e) {
              console.error("Failed to parse SSE data:", e);
            }
          }
        }
      }
    } catch (err) {
      console.error("Research error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setPageState("error");
    }
  };

  const handleResearchAnother = () => {
    setPageState("input");
    setProgress(null);
    setResult(null);
    setError(null);
  };

  if (status === "loading") {
    return <LoadingPage />;
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/chat"
              className="text-slate-500 hover:text-slate-700 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Search className="w-5 h-5 text-teal-600" />
              <h1 className="text-lg font-semibold text-slate-900">
                Deep Research
              </h1>
            </div>
          </div>
          <span className="text-xs text-teal-600 bg-teal-50 px-2 py-1 rounded border border-teal-200">
            Beta
          </span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 py-8 pb-16">
          {pageState === "input" && (
            <div className="flex flex-col items-center gap-8">
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-slate-900 mb-2">
                  AI-Powered Deep Research
                </h2>
                <p className="text-slate-600 max-w-md">
                  Enter a research topic and let AI thoroughly investigate it,
                  synthesizing information from multiple sources into a
                  comprehensive report.
                </p>
              </div>
              <ResearchInput
                onSubmit={handleSubmit}
                isLoading={false}
                disabled={false}
              />
            </div>
          )}

          {pageState === "researching" && (
            <div className="flex flex-col items-center gap-8">
              <ResearchProgress
                progress={progress}
                startTime={startTimeRef.current}
              />
            </div>
          )}

          {pageState === "error" && (
            <div
              className="flex flex-col items-center gap-8"
              data-testid="research-error"
            >
              <div className="w-full max-w-2xl mx-auto">
                <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                  <h3 className="text-lg font-medium text-red-800 mb-2">
                    Research Failed
                  </h3>
                  <p className="text-red-700 mb-4">{error}</p>
                  <button
                    onClick={handleResearchAnother}
                    className="text-red-600 hover:text-red-700 font-medium underline"
                    data-testid="research-try-again"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            </div>
          )}

          {pageState === "complete" && result && (
            <div className="flex flex-col items-center gap-8">
              <ResearchReport result={result} />
              <ResearchActions
                result={result}
                onResearchAnother={handleResearchAnother}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
