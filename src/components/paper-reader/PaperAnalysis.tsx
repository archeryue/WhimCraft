"use client";

import { PaperAnalysis as PaperAnalysisType } from "@/lib/paper-reader/types";
import { cn } from "@/lib/utils";
import {
  FileText,
  Users,
  Calendar,
  ExternalLink,
  AlertCircle,
  Lightbulb,
  Target,
  Beaker,
  BarChart,
  AlertTriangle,
  Compass,
} from "lucide-react";

interface PaperAnalysisProps {
  analysis: PaperAnalysisType;
  className?: string;
}

export function PaperAnalysisDisplay({ analysis, className }: PaperAnalysisProps) {
  const { metadata, analysis: a } = analysis;

  return (
    <div className={cn("w-full max-w-3xl mx-auto", className)} data-testid="paper-analysis">
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
          <div className="flex items-start gap-3">
            <FileText className="w-6 h-6 text-slate-600 mt-1 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-semibold text-slate-900 leading-tight">
                {metadata.title}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-slate-600">
                {metadata.authors.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>{metadata.authors.join(", ")}</span>
                  </div>
                )}
                {metadata.publishedDate && (
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    <span>{metadata.publishedDate}</span>
                  </div>
                )}
                {metadata.arxivId && (
                  <a
                    href={`https://arxiv.org/abs/${metadata.arxivId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                  >
                    <span>arXiv:{metadata.arxivId}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="divide-y divide-slate-100">
          {/* Summary */}
          <Section icon={Lightbulb} title="Summary" iconColor="text-yellow-600">
            <p className="text-slate-700">{a.summary}</p>
          </Section>

          {/* Problem Statement */}
          <Section icon={Target} title="Problem Statement" iconColor="text-red-600">
            <p className="text-slate-700">{a.problemStatement}</p>
          </Section>

          {/* Key Contributions */}
          {a.keyContributions.length > 0 && (
            <Section
              icon={AlertCircle}
              title="Key Contributions"
              iconColor="text-green-600"
            >
              <ul className="list-disc list-inside space-y-1 text-slate-700">
                {a.keyContributions.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* Methodology */}
          <Section icon={Beaker} title="Methodology" iconColor="text-purple-600">
            <p className="text-slate-700">{a.methodology}</p>
          </Section>

          {/* Results */}
          <Section icon={BarChart} title="Results" iconColor="text-blue-600">
            <p className="text-slate-700">{a.results}</p>
          </Section>

          {/* Limitations */}
          <Section
            icon={AlertTriangle}
            title="Limitations"
            iconColor="text-orange-600"
          >
            <p className="text-slate-700">{a.limitations}</p>
          </Section>

          {/* Future Work */}
          <Section icon={Compass} title="Future Work" iconColor="text-teal-600">
            <p className="text-slate-700">{a.futureWork}</p>
          </Section>

          {/* Key Takeaways */}
          {a.keyTakeaways.length > 0 && (
            <Section
              icon={Lightbulb}
              title="Key Takeaways"
              iconColor="text-amber-600"
            >
              <ul className="list-disc list-inside space-y-1 text-slate-700">
                {a.keyTakeaways.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

interface SectionProps {
  icon: typeof FileText;
  title: string;
  iconColor?: string;
  children: React.ReactNode;
}

function Section({ icon: Icon, title, iconColor, children }: SectionProps) {
  return (
    <div className="px-6 py-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("w-4 h-4", iconColor || "text-slate-500")} />
        <h2 className="font-medium text-slate-900">{title}</h2>
      </div>
      <div className="pl-6">{children}</div>
    </div>
  );
}
