"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Search,
  Brain,
  FileText,
  CheckCircle2,
  Loader2,
  XCircle,
  Clock,
} from "lucide-react";

interface ResearchProgressData {
  stage: string;
  progress: number;
  message: string;
  thoughtSummary?: string;
  partialReport?: string;
  error?: string;
}

interface ResearchProgressProps {
  progress: ResearchProgressData | null;
  startTime?: number;
  className?: string;
}

const STEPS = [
  { label: "Starting", icon: Search, minProgress: 0 },
  { label: "Researching", icon: Brain, minProgress: 10 },
  { label: "Writing", icon: FileText, minProgress: 70 },
  { label: "Complete", icon: CheckCircle2, minProgress: 100 },
];

export function ResearchProgress({
  progress,
  startTime,
  className,
}: ResearchProgressProps) {
  const [elapsed, setElapsed] = useState(0);

  // Update elapsed time every second
  useEffect(() => {
    if (!startTime) return;

    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  if (!progress) return null;

  const isError = progress.stage === "error";
  const progressValue = progress.progress;

  const elapsedMinutes = Math.floor(elapsed / 60);
  const elapsedSeconds = elapsed % 60;

  const getCurrentStepIndex = () => {
    for (let i = STEPS.length - 1; i >= 0; i--) {
      if (progressValue >= STEPS[i].minProgress) return i;
    }
    return 0;
  };

  const currentStepIndex = getCurrentStepIndex();

  return (
    <div
      className={cn("w-full max-w-2xl mx-auto", className)}
      data-testid="research-progress"
    >
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-slate-600 mb-2">
            <span>{progress.message}</span>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>
                {elapsedMinutes}:{elapsedSeconds.toString().padStart(2, "0")}
              </span>
              <span className="text-slate-400">|</span>
              <span>{progressValue}%</span>
            </div>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-500 rounded-full",
                isError ? "bg-red-500" : "bg-teal-500"
              )}
              style={{ width: `${progressValue}%` }}
            />
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex justify-between mb-6">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isCompleted =
              index < STEPS.length - 1
                ? progressValue >= STEPS[index + 1].minProgress
                : progressValue >= 100;
            const isCurrent = currentStepIndex === index && !isCompleted;
            const isPending = progressValue < step.minProgress;

            return (
              <div
                key={step.label}
                className={cn(
                  "flex flex-col items-center gap-1",
                  isPending && "opacity-40"
                )}
              >
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center",
                    isCompleted && "bg-green-100",
                    isCurrent && !isError && "bg-teal-100",
                    isCurrent && isError && "bg-red-100",
                    isPending && "bg-slate-100"
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : isCurrent ? (
                    isError ? (
                      <XCircle className="w-5 h-5 text-red-600" />
                    ) : (
                      <Loader2 className="w-5 h-5 text-teal-600 animate-spin" />
                    )
                  ) : (
                    <Icon className="w-5 h-5 text-slate-400" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs",
                    isCompleted && "text-green-600",
                    isCurrent && !isError && "text-teal-600 font-medium",
                    isCurrent && isError && "text-red-600 font-medium",
                    isPending && "text-slate-400"
                  )}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Thinking summary (live thoughts from AI) */}
        {progress.thoughtSummary && (
          <div className="mb-4 p-3 bg-teal-50 border border-teal-100 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Brain className="w-4 h-4 text-teal-600" />
              <span className="text-xs font-medium text-teal-700">
                AI Thinking
              </span>
            </div>
            <p className="text-sm text-teal-900">{progress.thoughtSummary}</p>
          </div>
        )}

        {/* Partial report preview */}
        {progress.partialReport && progress.partialReport.length > 100 && (
          <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
            <p className="text-xs text-slate-500 mb-1">Report preview:</p>
            <p className="text-sm text-slate-700 line-clamp-6 whitespace-pre-wrap">
              {progress.partialReport.substring(0, 500)}...
            </p>
          </div>
        )}

        {/* Error message */}
        {isError && progress.error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{progress.error}</p>
          </div>
        )}

        {/* Long-running notice */}
        {elapsed > 60 && progressValue < 100 && !isError && (
          <p className="mt-4 text-xs text-slate-500 text-center">
            Deep Research typically takes 10-20 minutes. You can leave this page
            open.
          </p>
        )}
      </div>
    </div>
  );
}
