"use client";

import { cn } from "@/lib/utils";
import { AnalysisProgress, AnalysisStage } from "@/lib/paper-reader/types";
import {
  CheckCircle2,
  Loader2,
  XCircle,
  FileSearch,
  Download,
  FileText,
  Brain,
  Sparkles,
} from "lucide-react";

interface PaperProgressProps {
  progress: AnalysisProgress | null;
  className?: string;
}

const STAGE_CONFIG: Record<
  AnalysisStage,
  { label: string; icon: typeof Loader2 }
> = {
  validating: { label: "Validating URL", icon: FileSearch },
  fetching: { label: "Downloading PDF", icon: Download },
  parsing: { label: "Extracting Text", icon: FileText },
  analyzing: { label: "AI Analysis", icon: Brain },
  formatting: { label: "Formatting Results", icon: Sparkles },
  complete: { label: "Complete", icon: CheckCircle2 },
  error: { label: "Error", icon: XCircle },
};

const STAGE_ORDER: AnalysisStage[] = [
  "validating",
  "fetching",
  "parsing",
  "analyzing",
  "complete",
];

export function PaperProgress({ progress, className }: PaperProgressProps) {
  if (!progress) return null;

  const currentStageIndex = STAGE_ORDER.indexOf(progress.stage);
  const isError = progress.stage === "error";

  return (
    <div className={cn("w-full max-w-2xl mx-auto", className)} data-testid="paper-progress">
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-slate-600 mb-2">
            <span>{progress.message}</span>
            <span>{progress.progress}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-300 rounded-full",
                isError ? "bg-red-500" : "bg-blue-500"
              )}
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        </div>

        {/* Stage indicators */}
        <div className="flex justify-between">
          {STAGE_ORDER.slice(0, -1).map((stage, index) => {
            const config = STAGE_CONFIG[stage];
            const Icon = config.icon;
            const isCompleted = currentStageIndex > index;
            const isCurrent = currentStageIndex === index;
            const isPending = currentStageIndex < index;

            return (
              <div
                key={stage}
                className={cn(
                  "flex flex-col items-center gap-1",
                  isPending && "opacity-40"
                )}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center",
                    isCompleted && "bg-green-100",
                    isCurrent && !isError && "bg-blue-100",
                    isCurrent && isError && "bg-red-100",
                    isPending && "bg-slate-100"
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  ) : isCurrent ? (
                    isError ? (
                      <XCircle className="w-4 h-4 text-red-600" />
                    ) : (
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                    )
                  ) : (
                    <Icon className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs",
                    isCompleted && "text-green-600",
                    isCurrent && !isError && "text-blue-600 font-medium",
                    isCurrent && isError && "text-red-600 font-medium",
                    isPending && "text-slate-400"
                  )}
                >
                  {config.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Error message */}
        {isError && progress.error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{progress.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
