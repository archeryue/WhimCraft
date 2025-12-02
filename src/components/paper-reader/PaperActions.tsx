"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PaperAnalysis } from "@/lib/paper-reader/types";
import { useRouter } from "next/navigation";
import {
  Save,
  Copy,
  Check,
  Loader2,
  RefreshCw,
} from "lucide-react";

interface PaperActionsProps {
  analysis: PaperAnalysis;
  onAnalyzeAnother: () => void;
}

/**
 * Generate markdown for display/copy (client-side version)
 * This duplicates the server-side function to avoid importing server-only modules
 */
function generateMarkdownForCopy(analysis: PaperAnalysis): string {
  const { metadata, analysis: a } = analysis;
  const sections: string[] = [];

  sections.push(`# ${metadata.title}`, "");

  if (metadata.authors.length > 0) {
    sections.push(`**Authors:** ${metadata.authors.join(", ")}`);
  }
  if (metadata.publishedDate) {
    sections.push(`**Published:** ${metadata.publishedDate}`);
  }
  if (metadata.arxivId) {
    sections.push(`**arXiv:** https://arxiv.org/abs/${metadata.arxivId}`);
  }
  sections.push("");

  sections.push("## Summary", "", a.summary, "");
  sections.push("## Problem Statement", "", a.problemStatement, "");

  if (a.keyContributions.length > 0) {
    sections.push("## Key Contributions", "");
    for (const c of a.keyContributions) sections.push(`- ${c}`);
    sections.push("");
  }

  sections.push("## Methodology", "", a.methodology, "");
  sections.push("## Results", "", a.results, "");
  sections.push("## Limitations", "", a.limitations, "");
  sections.push("## Future Work", "", a.futureWork, "");

  if (a.keyTakeaways.length > 0) {
    sections.push("## Key Takeaways", "");
    for (const t of a.keyTakeaways) sections.push(`- ${t}`);
    sections.push("");
  }

  return sections.join("\n").trim();
}

export function PaperActions({ analysis, onAnalyzeAnother }: PaperActionsProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSaveAsWhim = async () => {
    setIsSaving(true);
    setSaveError(null);

    try {
      // Call a dedicated API to convert and save as whim
      const response = await fetch("/api/paper/save-whim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis }),
      });

      if (!response.ok) {
        throw new Error("Failed to save whim");
      }

      const { whim } = await response.json();
      router.push(`/whims/${whim.id}`);
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
    <div className="w-full max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          onClick={handleSaveAsWhim}
          disabled={isSaving}
          className="min-w-[140px]"
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
