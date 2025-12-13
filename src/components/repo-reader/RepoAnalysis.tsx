"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import {
  FolderGit2,
  Star,
  GitFork,
  Calendar,
  ExternalLink,
  Code,
  Layers,
  Workflow,
  FileCode,
  Terminal,
  BookOpen,
  Lightbulb,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// Markdown content component with proper styling
function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="text-slate-700 mb-2 last:mb-0">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-inside space-y-1 text-slate-700 mb-2 last:mb-0">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside space-y-1 text-slate-700 mb-2 last:mb-0">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="text-slate-700">{children}</li>,
        strong: ({ children }) => (
          <strong className="font-semibold text-slate-900">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm font-mono my-2">
                <code>{children}</code>
              </pre>
            );
          }
          return (
            <code className="bg-slate-100 px-1 py-0.5 rounded text-sm font-mono text-slate-800">
              {children}
            </code>
          );
        },
        pre: ({ children }) => <>{children}</>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700 underline"
          >
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

interface RepoAnalysisData {
  metadata: {
    name: string;
    owner: string;
    fullName: string;
    description: string;
    url: string;
    stars: number;
    forks: number;
    language: string;
    license?: string;
    defaultBranch: string;
    lastPush: string;
    analyzedAt: string;
  };
  analysis: {
    overview: string;
    techStack: {
      language: string;
      framework?: string;
      buildTool?: string;
      dependencies: string[];
    };
    architecture: string;
    modules: Array<{
      path: string;
      name: string;
      description: string;
      keyFiles: Array<{
        path: string;
        url: string;
        description: string;
      }>;
    }>;
    dataFlow?: string;
    entryPoints: Array<{
      type: string;
      file: string;
      url: string;
      description: string;
    }>;
    setupInstructions: string;
    codePatterns: string[];
    learningPoints: string[];
  };
  sections: Array<{
    title: string;
    content: string;
    type: string;
  }>;
}

interface RepoAnalysisProps {
  analysis: RepoAnalysisData;
  className?: string;
}

export function RepoAnalysisDisplay({ analysis, className }: RepoAnalysisProps) {
  const { metadata, analysis: a } = analysis;

  return (
    <div
      className={cn("w-full max-w-4xl mx-auto", className)}
      data-testid="repo-analysis"
    >
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
          <div className="flex items-start gap-3">
            <FolderGit2 className="w-6 h-6 text-slate-600 mt-1 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <a
                href={metadata.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xl font-semibold text-slate-900 leading-tight hover:text-blue-600 flex items-center gap-2"
              >
                {metadata.fullName}
                <ExternalLink className="w-4 h-4" />
              </a>
              {metadata.description && (
                <p className="text-sm text-slate-600 mt-1">
                  {metadata.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-slate-600">
                <div className="flex items-center gap-1">
                  <Code className="w-4 h-4" />
                  <span>{metadata.language}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4" />
                  <span>{metadata.stars.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1">
                  <GitFork className="w-4 h-4" />
                  <span>{metadata.forks.toLocaleString()}</span>
                </div>
                {metadata.license && (
                  <div className="flex items-center gap-1">
                    <span>{metadata.license}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>
                    Last push:{" "}
                    {new Date(metadata.lastPush).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="divide-y divide-slate-100">
          {/* Overview */}
          <Section icon={BookOpen} title="Overview" iconColor="text-blue-600">
            <MarkdownContent content={a.overview} />
          </Section>

          {/* Tech Stack */}
          <Section icon={Code} title="Tech Stack" iconColor="text-green-600">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <TechBadge label={a.techStack.language} type="language" />
                {a.techStack.framework && (
                  <TechBadge label={a.techStack.framework} type="framework" />
                )}
                {a.techStack.buildTool && (
                  <TechBadge label={a.techStack.buildTool} type="build" />
                )}
              </div>
              {a.techStack.dependencies.length > 0 && (
                <div className="mt-2">
                  <span className="text-sm text-slate-600">
                    Key dependencies:{" "}
                  </span>
                  <span className="text-sm text-slate-700">
                    {a.techStack.dependencies.join(", ")}
                  </span>
                </div>
              )}
            </div>
          </Section>

          {/* Architecture */}
          {a.architecture && (
            <CollapsibleSection
              icon={Workflow}
              title="Architecture"
              iconColor="text-purple-600"
              defaultOpen={true}
            >
              <div className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm font-mono whitespace-pre">
                  {a.architecture}
                </pre>
              </div>
            </CollapsibleSection>
          )}

          {/* Module Breakdown */}
          {a.modules.length > 0 && (
            <CollapsibleSection
              icon={Layers}
              title={`Module Breakdown (${a.modules.length})`}
              iconColor="text-indigo-600"
              defaultOpen={true}
            >
              <div className="space-y-4">
                {a.modules.map((module, index) => (
                  <div
                    key={index}
                    className="border border-slate-200 rounded-lg p-4"
                  >
                    <h4 className="font-medium text-slate-900">{module.name}</h4>
                    <p className="text-sm text-slate-500 font-mono">
                      {module.path}
                    </p>
                    <p className="text-sm text-slate-700 mt-2">
                      {module.description}
                    </p>
                    {module.keyFiles.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {module.keyFiles.map((file, fi) => (
                          <a
                            key={fi}
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                          >
                            <FileCode className="w-3 h-3" />
                            <span className="font-mono">{file.path}</span>
                            {file.description && (
                              <span className="text-slate-500">
                                - {file.description}
                              </span>
                            )}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Entry Points */}
          {a.entryPoints.length > 0 && (
            <CollapsibleSection
              icon={Terminal}
              title="Entry Points"
              iconColor="text-orange-600"
            >
              <div className="space-y-2">
                {a.entryPoints.map((ep, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-xs rounded font-medium uppercase">
                      {ep.type}
                    </span>
                    <div className="flex-1">
                      <a
                        href={ep.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-mono text-blue-600 hover:text-blue-700"
                      >
                        {ep.file}
                      </a>
                      {ep.description && (
                        <p className="text-sm text-slate-600 mt-0.5">
                          {ep.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Data Flow */}
          {a.dataFlow && (
            <CollapsibleSection
              icon={Workflow}
              title="Data Flow"
              iconColor="text-teal-600"
            >
              <MarkdownContent content={a.dataFlow} />
            </CollapsibleSection>
          )}

          {/* Setup Instructions */}
          {a.setupInstructions && (
            <CollapsibleSection
              icon={Terminal}
              title="Setup Instructions"
              iconColor="text-slate-600"
            >
              <MarkdownContent content={a.setupInstructions} />
            </CollapsibleSection>
          )}

          {/* Code Patterns */}
          {a.codePatterns.length > 0 && (
            <CollapsibleSection
              icon={Code}
              title="Code Patterns"
              iconColor="text-pink-600"
            >
              <ul className="list-disc list-inside space-y-1 text-slate-700">
                {a.codePatterns.map((pattern, i) => (
                  <li key={i}>{pattern}</li>
                ))}
              </ul>
            </CollapsibleSection>
          )}

          {/* Learning Points */}
          {a.learningPoints.length > 0 && (
            <Section
              icon={Lightbulb}
              title="Learning Points"
              iconColor="text-yellow-600"
            >
              <ul className="list-disc list-inside space-y-1 text-slate-700">
                {a.learningPoints.map((point, i) => (
                  <li key={i}>{point}</li>
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
  icon: typeof FolderGit2;
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

interface CollapsibleSectionProps extends SectionProps {
  defaultOpen?: boolean;
}

function CollapsibleSection({
  icon: Icon,
  title,
  iconColor,
  children,
  defaultOpen = false,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="px-6 py-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full text-left"
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400" />
        )}
        <Icon className={cn("w-4 h-4", iconColor || "text-slate-500")} />
        <h2 className="font-medium text-slate-900">{title}</h2>
      </button>
      {isOpen && <div className="pl-10 mt-2">{children}</div>}
    </div>
  );
}

function TechBadge({
  label,
  type,
}: {
  label: string;
  type: "language" | "framework" | "build";
}) {
  const colors = {
    language: "bg-blue-100 text-blue-800",
    framework: "bg-green-100 text-green-800",
    build: "bg-purple-100 text-purple-800",
  };

  return (
    <span className={cn("px-2 py-1 rounded text-sm font-medium", colors[type])}>
      {label}
    </span>
  );
}
