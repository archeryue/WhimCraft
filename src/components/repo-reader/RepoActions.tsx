"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import {
  Save,
  Copy,
  Check,
  Loader2,
  RefreshCw,
} from "lucide-react";

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

interface RepoActionsProps {
  analysis: RepoAnalysisData;
  onAnalyzeAnother: () => void;
}

/**
 * Generate markdown for display/copy (client-side version)
 */
function generateMarkdownForCopy(analysis: RepoAnalysisData): string {
  const { metadata, analysis: a } = analysis;
  const sections: string[] = [];

  sections.push(`# ${metadata.fullName}`, "");

  sections.push(`**Repository:** ${metadata.url}`);
  sections.push(`**Language:** ${metadata.language}`);
  sections.push(`**Stars:** ${metadata.stars.toLocaleString()}`);
  sections.push(`**Forks:** ${metadata.forks.toLocaleString()}`);
  if (metadata.license) {
    sections.push(`**License:** ${metadata.license}`);
  }
  sections.push(`**Last Push:** ${new Date(metadata.lastPush).toLocaleDateString()}`);
  sections.push("");

  if (metadata.description) {
    sections.push(`> ${metadata.description}`, "");
  }

  sections.push("## Overview", "", a.overview, "");

  sections.push("## Tech Stack", "");
  sections.push(`- **Language:** ${a.techStack.language}`);
  if (a.techStack.framework) {
    sections.push(`- **Framework:** ${a.techStack.framework}`);
  }
  if (a.techStack.buildTool) {
    sections.push(`- **Build Tool:** ${a.techStack.buildTool}`);
  }
  if (a.techStack.dependencies.length > 0) {
    sections.push(`- **Key Dependencies:** ${a.techStack.dependencies.join(", ")}`);
  }
  sections.push("");

  if (a.architecture) {
    sections.push("## Architecture", "");
    sections.push("```");
    sections.push(a.architecture);
    sections.push("```");
    sections.push("");
  }

  if (a.modules.length > 0) {
    sections.push("## Module Breakdown", "");
    for (const mod of a.modules) {
      sections.push(`### ${mod.name}`);
      sections.push(`**Path:** \`${mod.path}\``);
      sections.push("");
      sections.push(mod.description);
      if (mod.keyFiles.length > 0) {
        sections.push("");
        sections.push("**Key Files:**");
        for (const file of mod.keyFiles) {
          sections.push(`- [\`${file.path}\`](${file.url})${file.description ? ` - ${file.description}` : ""}`);
        }
      }
      sections.push("");
    }
  }

  if (a.entryPoints.length > 0) {
    sections.push("## Entry Points", "");
    for (const ep of a.entryPoints) {
      sections.push(`- **${ep.type}:** [\`${ep.file}\`](${ep.url})${ep.description ? ` - ${ep.description}` : ""}`);
    }
    sections.push("");
  }

  if (a.dataFlow) {
    sections.push("## Data Flow", "", a.dataFlow, "");
  }

  if (a.setupInstructions) {
    sections.push("## Setup Instructions", "", a.setupInstructions, "");
  }

  if (a.codePatterns.length > 0) {
    sections.push("## Code Patterns", "");
    for (const pattern of a.codePatterns) sections.push(`- ${pattern}`);
    sections.push("");
  }

  if (a.learningPoints.length > 0) {
    sections.push("## Learning Points", "");
    for (const point of a.learningPoints) sections.push(`- ${point}`);
    sections.push("");
  }

  return sections.join("\n").trim();
}

export function RepoActions({ analysis, onAnalyzeAnother }: RepoActionsProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSaveAsWhim = async () => {
    setIsSaving(true);
    setSaveError(null);

    try {
      // Call a dedicated API to convert and save as whim
      const response = await fetch("/api/repo/save-whim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis }),
      });

      if (!response.ok) {
        throw new Error("Failed to save whim");
      }

      const { whim } = await response.json();
      router.push(`/whim?id=${whim.id}`);
    } catch (error) {
      console.error("Error saving whim:", error);
      setSaveError("Failed to save as Whim. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyMarkdown = async () => {
    try {
      const markdown = generateMarkdownForCopy(analysis);
      await navigator.clipboard.writeText(markdown);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error("Error copying to clipboard:", error);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          onClick={handleSaveAsWhim}
          disabled={isSaving}
          className="min-w-[140px]"
          data-testid="repo-save-whim-button"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save as Whim
            </>
          )}
        </Button>

        <Button
          variant="outline"
          onClick={handleCopyMarkdown}
          className="min-w-[140px]"
          data-testid="repo-copy-button"
        >
          {isCopied ? (
            <>
              <Check className="w-4 h-4 mr-2 text-green-600" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-2" />
              Copy Markdown
            </>
          )}
        </Button>

        <Button
          variant="ghost"
          onClick={onAnalyzeAnother}
          className="min-w-[160px]"
          data-testid="repo-analyze-another-button"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Analyze Another
        </Button>
      </div>

      {saveError && (
        <p className="text-center text-sm text-red-600 mt-2">{saveError}</p>
      )}
    </div>
  );
}
