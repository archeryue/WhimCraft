"use client";

import { cn } from "@/lib/utils";
import { AnalysisProgress } from "@/lib/paper-reader/types";
import {
  CheckCircle2,
  Loader2,
  XCircle,
  Download,
  FileText,
  ImageIcon,
  Brain,
  Sparkles,
} from "lucide-react";

interface PaperProgressProps {
  progress: AnalysisProgress | null;
  className?: string;
}

// 5-step progress stages matching the skill
const STEPS = [
  { label: "Fetch PDF", icon: Download, minProgress: 0 },
  { label: "Extract", icon: FileText, minProgress: 20 },
  { label: "Figures", icon: ImageIcon, minProgress: 40 },
  { label: "Analyze", icon: Brain, minProgress: 60 },
  { label: "Generate", icon: Sparkles, minProgress: 80 },
];

export function PaperProgress({ progress, className }: PaperProgressProps) {
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
    <div className={cn("w-full max-w-2xl mx-auto", className)} data-testid="paper-progress">
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

        {/* Stage indicators - 5 steps */}
        <div className="flex justify-between">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isCompleted = progressValue > step.minProgress + 19;
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
