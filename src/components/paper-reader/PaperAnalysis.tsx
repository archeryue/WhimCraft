"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  Image as ImageIcon,
} from "lucide-react";

// Markdown content component with proper styling
function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Style paragraphs
        p: ({ children }) => (
          <p className="text-slate-700 mb-2 last:mb-0">{children}</p>
        ),
        // Style bullet lists
        ul: ({ children }) => (
          <ul className="list-disc list-inside space-y-1 text-slate-700 mb-2 last:mb-0">{children}</ul>
        ),
        // Style numbered lists
        ol: ({ children }) => (
          <ol className="list-decimal list-inside space-y-1 text-slate-700 mb-2 last:mb-0">{children}</ol>
        ),
        // Style list items
        li: ({ children }) => (
          <li className="text-slate-700">{children}</li>
        ),
        // Style bold text
        strong: ({ children }) => (
          <strong className="font-semibold text-slate-900">{children}</strong>
        ),
        // Style italic text
        em: ({ children }) => (
          <em className="italic">{children}</em>
        ),
        // Style inline code
        code: ({ children }) => (
          <code className="bg-slate-100 px-1 py-0.5 rounded text-sm font-mono text-slate-800">{children}</code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

interface PaperAnalysisProps {
  analysis: PaperAnalysisType;
  className?: string;
}

export function PaperAnalysisDisplay({ analysis, className }: PaperAnalysisProps) {
  const { metadata, analysis: a, figures } = analysis;

  return (
    <div className={cn("w-full max-w-3xl mx-auto", className)} data-testid="paper-analysis">
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
          <div className="flex items-start gap-3">
            <FileText className="w-6 h-6 text-slate-600 mt-1 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-semibold text-slate-900 leading-tight">
                {metadata.title || "Untitled Paper"}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-slate-600">
                {metadata.authors && metadata.authors.length > 0 && (
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
            <MarkdownContent content={a.summary} />
          </Section>

          {/* Key Figures */}
          {figures && figures.length > 0 && (
            <Section icon={ImageIcon} title="Key Figures" iconColor="text-indigo-600">
              <div className="space-y-6">
                {figures.map((fig, index) => (
                  <div key={fig.id} className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="relative w-full bg-slate-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`data:image/png;base64,${fig.imageBase64}`}
                        alt={fig.caption || `Figure ${index + 1}`}
                        className="w-full h-auto object-contain max-h-96"
                      />
                    </div>
                    <div className="p-3 bg-white">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-700">
                          Figure {index + 1} (Page {fig.page})
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded">
                          Importance: {fig.importance}/100
                        </span>
                      </div>
                      {fig.importanceReason && (
                        <p className="text-sm text-slate-600 mt-1">{fig.importanceReason}</p>
                      )}
                      {fig.caption && (
                        <p className="text-xs text-slate-500 mt-2 italic">{fig.caption}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Problem Statement */}
          {a.problemStatement && (
            <Section icon={Target} title="Problem Statement" iconColor="text-red-600">
              <MarkdownContent content={a.problemStatement} />
            </Section>
          )}

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
          {a.methodology && (
            <Section icon={Beaker} title="Methodology" iconColor="text-purple-600">
              <MarkdownContent content={a.methodology} />
            </Section>
          )}

          {/* Results */}
          {a.results && (
            <Section icon={BarChart} title="Results" iconColor="text-blue-600">
              <MarkdownContent content={a.results} />
            </Section>
          )}

          {/* Limitations */}
          {a.limitations && (
            <Section
              icon={AlertTriangle}
              title="Limitations"
              iconColor="text-orange-600"
            >
              <MarkdownContent content={a.limitations} />
            </Section>
          )}

          {/* Future Work */}
          {a.futureWork && (
            <Section icon={Compass} title="Future Work" iconColor="text-teal-600">
              <MarkdownContent content={a.futureWork} />
            </Section>
          )}

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
