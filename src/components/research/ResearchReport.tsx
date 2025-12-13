"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { FileText, ExternalLink, Clock, Link2 } from "lucide-react";

interface ResearchCitation {
  url: string;
  title?: string;
}

interface ResearchResultData {
  query: string;
  report: string;
  citations: ResearchCitation[];
  metadata: {
    interactionId: string;
    completedAt: string;
    durationMs: number;
  };
}

interface ResearchReportProps {
  result: ResearchResultData;
  className?: string;
}

export function ResearchReport({ result, className }: ResearchReportProps) {
  const durationMinutes = Math.floor(result.metadata.durationMs / 60000);
  const durationSeconds = Math.floor(
    (result.metadata.durationMs % 60000) / 1000
  );

  return (
    <div
      className={cn("w-full max-w-4xl mx-auto", className)}
      data-testid="research-report"
    >
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
          <div className="flex items-start gap-3">
            <FileText className="w-6 h-6 text-teal-600 mt-1 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-slate-900">
                Research Report
              </h2>
              <p className="text-sm text-slate-600 mt-1 italic line-clamp-2">
                &quot;{result.query}&quot;
              </p>
              <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>
                    Completed in {durationMinutes}m {durationSeconds}s
                  </span>
                </div>
                {result.citations.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Link2 className="w-4 h-4" />
                    <span>{result.citations.length} sources</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Report content */}
        <div className="px-6 py-6 prose prose-slate max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-600 hover:text-teal-700 underline inline-flex items-center gap-1"
                >
                  {children}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ),
              h1: ({ children }) => (
                <h1 className="text-2xl font-bold text-slate-900 mt-6 mb-4 first:mt-0">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-xl font-semibold text-slate-800 mt-5 mb-3">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-lg font-medium text-slate-800 mt-4 mb-2">
                  {children}
                </h3>
              ),
              p: ({ children }) => (
                <p className="text-slate-700 mb-4 leading-relaxed">
                  {children}
                </p>
              ),
              ul: ({ children }) => (
                <ul className="list-disc list-outside ml-6 space-y-2 text-slate-700 mb-4">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-outside ml-6 space-y-2 text-slate-700 mb-4">
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li className="text-slate-700">{children}</li>
              ),
              code: ({ className, children }) => {
                const isBlock = className?.includes("language-");
                if (isBlock) {
                  return (
                    <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm font-mono my-4">
                      <code>{children}</code>
                    </pre>
                  );
                }
                return (
                  <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm font-mono text-slate-800">
                    {children}
                  </code>
                );
              },
              blockquote: ({ children }) => (
                <blockquote className="border-l-4 border-teal-500 pl-4 italic text-slate-600 my-4">
                  {children}
                </blockquote>
              ),
              hr: () => <hr className="my-6 border-slate-200" />,
              table: ({ children }) => (
                <div className="overflow-x-auto my-4">
                  <table className="min-w-full border-collapse border border-slate-200">
                    {children}
                  </table>
                </div>
              ),
              th: ({ children }) => (
                <th className="border border-slate-200 px-4 py-2 bg-slate-50 text-left font-medium text-slate-700">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="border border-slate-200 px-4 py-2 text-slate-700">
                  {children}
                </td>
              ),
            }}
          >
            {result.report}
          </ReactMarkdown>
        </div>

        {/* Citations section */}
        {result.citations.length > 0 && (
          <div className="border-t border-slate-200 px-6 py-4 bg-slate-50">
            <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Sources ({result.citations.length})
            </h3>
            <div className="space-y-2">
              {result.citations.map((citation, index) => (
                <a
                  key={index}
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700 hover:underline"
                >
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">
                    {citation.title || citation.url}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
