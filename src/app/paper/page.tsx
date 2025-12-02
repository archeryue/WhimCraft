"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LoadingPage } from "@/components/ui/loading";
import { PaperInput } from "@/components/paper-reader/PaperInput";
import { PaperProgress } from "@/components/paper-reader/PaperProgress";
import { PaperAnalysisDisplay } from "@/components/paper-reader/PaperAnalysis";
import { PaperActions } from "@/components/paper-reader/PaperActions";
import { AnalysisProgress, PaperAnalysis } from "@/lib/paper-reader/types";
import { FileText, ArrowLeft } from "lucide-react";
import Link from "next/link";

type PageState = "input" | "analyzing" | "complete" | "error";

export default function PaperReaderPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [pageState, setPageState] = useState<PageState>("input");
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [analysis, setAnalysis] = useState<PaperAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  const handleSubmit = async (url: string) => {
    setPageState("analyzing");
    setProgress(null);
    setAnalysis(null);
    setError(null);

    try {
      const response = await fetch("/api/paper/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (response.status === 429) {
        const data = await response.json();
        setError(data.message || "Rate limit exceeded");
        setPageState("error");
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to start analysis");
      }

      // Read SSE stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to read response");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete events
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data: AnalysisProgress = JSON.parse(line.slice(6));
              setProgress(data);

              if (data.stage === "complete" && data.result) {
                setAnalysis(data.result);
                setPageState("complete");
              } else if (data.stage === "error") {
                setError(data.error || "Analysis failed");
                setPageState("error");
              }
            } catch (e) {
              console.error("Failed to parse SSE data:", e);
            }
          }
        }
      }
    } catch (err) {
      console.error("Analysis error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setPageState("error");
    }
  };

  const handleAnalyzeAnother = () => {
    setPageState("input");
    setProgress(null);
    setAnalysis(null);
    setError(null);
  };

  // Show loading while checking auth
  if (status === "loading") {
    return <LoadingPage />;
  }

  // Don't render if not authenticated (redirect will happen)
  if (status === "unauthenticated") {
    return null;
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
              <FileText className="w-5 h-5 text-slate-700" />
              <h1 className="text-lg font-semibold text-slate-900">
                Paper Reader
              </h1>
            </div>
          </div>
          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
            Beta
          </span>
        </div>
      </header>

      {/* Main content - scrollable */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 py-8 pb-16">
        {pageState === "input" && (
          <div className="flex flex-col items-center gap-8">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-slate-900 mb-2">
                Analyze Academic Papers
              </h2>
              <p className="text-slate-600 max-w-md">
                Paste an arXiv paper URL to get a structured AI analysis.
                Save the results as a Whim for future reference.
              </p>
            </div>
            <PaperInput
              onSubmit={handleSubmit}
              isLoading={false}
              disabled={false}
            />
          </div>
        )}

        {pageState === "analyzing" && (
          <div className="flex flex-col items-center gap-8">
            <PaperProgress progress={progress} />
          </div>
        )}

        {pageState === "error" && (
          <div className="flex flex-col items-center gap-8" data-testid="paper-error">
            <div className="w-full max-w-2xl mx-auto">
              <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                <h3 className="text-lg font-medium text-red-800 mb-2">
                  Analysis Failed
                </h3>
                <p className="text-red-700 mb-4">{error}</p>
                <button
                  onClick={handleAnalyzeAnother}
                  className="text-red-600 hover:text-red-700 font-medium underline"
                  data-testid="paper-try-again"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        )}

        {pageState === "complete" && analysis && (
          <div className="flex flex-col items-center gap-8">
            <PaperAnalysisDisplay analysis={analysis} />
            <PaperActions
              analysis={analysis}
              onAnalyzeAnother={handleAnalyzeAnother}
            />
          </div>
        )}
        </div>
      </main>
    </div>
  );
}
