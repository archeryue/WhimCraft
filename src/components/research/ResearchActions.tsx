"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Save, Copy, Check, Loader2, RefreshCw } from "lucide-react";

interface ResearchCitation {
  url: string;
  title?: string;
}

interface ResearchResultData {
  success: boolean;
  query: string;
  report: string;
  citations: ResearchCitation[];
  metadata: {
    interactionId: string;
    completedAt: string;
    durationMs: number;
  };
}

interface ResearchActionsProps {
  result: ResearchResultData;
  onResearchAnother: () => void;
}

/**
 * Generate markdown for display/copy (client-side version)
 * This duplicates the server-side function to avoid importing server-only modules
 */
function generateMarkdownForCopy(result: ResearchResultData): string {
  const sections: string[] = [];

  // Header
  sections.push("# Research Report", "");

  // Query info
  sections.push(`**Research Query:** ${result.query}`, "");

  // Duration info
  const durationMinutes = Math.floor(result.metadata.durationMs / 60000);
  const durationSeconds = Math.floor(
    (result.metadata.durationMs % 60000) / 1000
  );
  sections.push(
    `*Completed in ${durationMinutes}m ${durationSeconds}s on ${new Date(result.metadata.completedAt).toLocaleDateString()}*`,
    ""
  );

  sections.push("---", "");

  // Main report content
  sections.push(result.report, "");

  // Citations/Sources section
  if (result.citations.length > 0) {
    sections.push("---", "", "## Sources", "");
    for (const citation of result.citations) {
      const displayTitle = citation.title || citation.url;
      sections.push(`- [${displayTitle}](${citation.url})`);
    }
  }

  return sections.join("\n").trim();
}

export function ResearchActions({
  result,
  onResearchAnother,
}: ResearchActionsProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSaveAsWhim = async () => {
    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/research/save-whim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result }),
      });

      if (!response.ok) throw new Error("Failed to save whim");

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
      const markdown = generateMarkdownForCopy(result);
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
          className="min-w-[140px] bg-teal-600 hover:bg-teal-700"
          data-testid="research-save-whim-button"
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
          data-testid="research-copy-button"
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
          onClick={onResearchAnother}
          className="min-w-[160px]"
          data-testid="research-another-button"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          New Research
        </Button>
      </div>

      {saveError && (
        <p className="text-center text-sm text-red-600 mt-2">{saveError}</p>
      )}
    </div>
  );
}
