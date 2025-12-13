"use client";

import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Loader2,
  XCircle,
  FolderSearch,
  GitBranch,
  Layers,
  Sparkles,
} from "lucide-react";

interface RepoProgress {
  stage: string;
  progress: number;
  message: string;
  detail?: string;
  filesExplored?: number;
  tokensUsed?: number;
  error?: string;
}

interface RepoProgressProps {
  progress: RepoProgress | null;
  className?: string;
}

// 4-step progress stages matching the skill phases
const STEPS = [
  { label: "Recon", icon: FolderSearch, minProgress: 0 },
  { label: "Entry Points", icon: GitBranch, minProgress: 20 },
  { label: "Explore", icon: Layers, minProgress: 40 },
  { label: "Synthesize", icon: Sparkles, minProgress: 70 },
];

export function RepoProgress({ progress, className }: RepoProgressProps) {
  if (!progress) return null;

  const isError = progress.stage === "error";
  const progressValue = progress.progress;

  // Find current step based on progress percentage
  const getCurrentStepIndex = () => {
    for (let i = STEPS.length - 1; i >= 0; i--) {
      if (progressValue >= STEPS[i].minProgress) {
        return i;
      }
    }
    return 0;
  };

  const currentStepIndex = getCurrentStepIndex();

  return (
    <div
      className={cn("w-full max-w-2xl mx-auto", className)}
      data-testid="repo-progress"
    >
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-slate-600 mb-2">
            <span>{progress.message}</span>
            <span>{progressValue}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-300 rounded-full",
                isError ? "bg-red-500" : "bg-blue-500"
              )}
              style={{ width: `${progressValue}%` }}
            />
          </div>
        </div>

        {/* Stage indicators - 4 steps */}
        <div className="flex justify-between">
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
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Files explored indicator */}
        {progress.filesExplored !== undefined && (
          <div className="mt-4 text-center text-xs text-slate-500">
            {progress.filesExplored} files explored
            {progress.tokensUsed !== undefined &&
              ` | ~${Math.round(progress.tokensUsed / 1000)}K tokens`}
          </div>
        )}

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
