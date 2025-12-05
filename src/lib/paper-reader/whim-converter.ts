/**
 * Whim Converter for Paper Reader
 *
 * Converts paper analysis to TipTap JSON blocks for Whim storage.
 */

import { generateJSON } from "@tiptap/html/server";
import StarterKit from "@tiptap/starter-kit";
import { marked } from "marked";
import { JSONContent } from "@tiptap/core";
import { PaperAnalysis, PaperWhimData } from "./types";

// Configure marked options
marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * Convert paper analysis to Whim-compatible format
 */
export function analysisToWhimData(analysis: PaperAnalysis): PaperWhimData {
  const markdown = analysisToMarkdown(analysis);
  const blocks = markdownToBlocks(markdown);

  return {
    title: analysis.metadata.title || "Untitled Paper",
    blocks,
    metadata: {
      type: "paper-analysis",
      sourceUrl: analysis.metadata.sourceUrl,
      arxivId: analysis.metadata.arxivId,
      authors: analysis.metadata.authors || [],
      publishedDate: analysis.metadata.publishedDate,
      analyzedAt: new Date().toISOString(),
    },
  };
}

/**
 * Convert paper analysis to markdown format
 */
export function analysisToMarkdown(analysis: PaperAnalysis): string {
  const { metadata, analysis: a } = analysis;

  const sections: string[] = [];

  // Header with metadata
  sections.push(`# ${metadata.title || "Untitled Paper"}`);
  sections.push("");

  if (metadata.authors && metadata.authors.length > 0) {
    sections.push(`**Authors:** ${metadata.authors.join(", ")}`);
  }
  if (metadata.publishedDate) {
    sections.push(`**Published:** ${metadata.publishedDate}`);
  }
  if (metadata.arxivId) {
    sections.push(`**arXiv:** [${metadata.arxivId}](https://arxiv.org/abs/${metadata.arxivId})`);
  }
  sections.push("");

  // Summary
  sections.push("## Summary");
  sections.push("");
  sections.push(a.summary);
  sections.push("");

  // Problem Statement
  if (a.problemStatement) {
    sections.push("## Problem Statement");
    sections.push("");
    sections.push(a.problemStatement);
    sections.push("");
  }

  // Key Contributions
  if (a.keyContributions.length > 0) {
    sections.push("## Key Contributions");
    sections.push("");
    for (const contribution of a.keyContributions) {
      sections.push(`- ${contribution}`);
    }
    sections.push("");
  }

  // Methodology
  if (a.methodology) {
    sections.push("## Methodology");
    sections.push("");
    sections.push(a.methodology);
    sections.push("");
  }

  // Results
  if (a.results) {
    sections.push("## Results");
    sections.push("");
    sections.push(a.results);
    sections.push("");
  }

  // Limitations
  if (a.limitations) {
    sections.push("## Limitations");
    sections.push("");
    sections.push(a.limitations);
    sections.push("");
  }

  // Future Work
  if (a.futureWork) {
    sections.push("## Future Work");
    sections.push("");
    sections.push(a.futureWork);
    sections.push("");
  }

  // Key Takeaways
  if (a.keyTakeaways.length > 0) {
    sections.push("## Key Takeaways");
    sections.push("");
    for (const takeaway of a.keyTakeaways) {
      sections.push(`- ${takeaway}`);
    }
    sections.push("");
  }

  // My Notes section (empty for user to fill)
  sections.push("## My Notes");
  sections.push("");
  sections.push("*Add your own notes and thoughts here...*");
  sections.push("");

  return sections.join("\n");
}

/**
 * Convert markdown to TipTap JSON blocks
 */
function markdownToBlocks(markdown: string): JSONContent {
  // Convert markdown to HTML
  const html = marked.parse(markdown) as string;

  // Parse HTML to TipTap JSON using StarterKit extensions
  const json = generateJSON(html, [StarterKit]);

  return json;
}

/**
 * Generate a display-ready markdown version of the analysis
 * (without the "My Notes" section, for copying)
 */
export function analysisToDisplayMarkdown(analysis: PaperAnalysis): string {
  const { metadata, analysis: a } = analysis;

  const sections: string[] = [];

  // Header with metadata
  sections.push(`# ${metadata.title || "Untitled Paper"}`);
  sections.push("");

  if (metadata.authors && metadata.authors.length > 0) {
    sections.push(`**Authors:** ${metadata.authors.join(", ")}`);
  }
  if (metadata.publishedDate) {
    sections.push(`**Published:** ${metadata.publishedDate}`);
  }
  if (metadata.arxivId) {
    sections.push(`**arXiv:** https://arxiv.org/abs/${metadata.arxivId}`);
  }
  sections.push("");

  // Summary
  sections.push("## Summary");
  sections.push("");
  sections.push(a.summary);
  sections.push("");

  // Problem Statement
  if (a.problemStatement) {
    sections.push("## Problem Statement");
    sections.push("");
    sections.push(a.problemStatement);
    sections.push("");
  }

  // Key Contributions
  if (a.keyContributions.length > 0) {
    sections.push("## Key Contributions");
    sections.push("");
    for (const contribution of a.keyContributions) {
      sections.push(`- ${contribution}`);
    }
    sections.push("");
  }

  // Methodology
  if (a.methodology) {
    sections.push("## Methodology");
    sections.push("");
    sections.push(a.methodology);
    sections.push("");
  }

  // Results
  if (a.results) {
    sections.push("## Results");
    sections.push("");
    sections.push(a.results);
    sections.push("");
  }

  // Limitations
  if (a.limitations) {
    sections.push("## Limitations");
    sections.push("");
    sections.push(a.limitations);
    sections.push("");
  }

  // Future Work
  if (a.futureWork) {
    sections.push("## Future Work");
    sections.push("");
    sections.push(a.futureWork);
    sections.push("");
  }

  // Key Takeaways
  if (a.keyTakeaways.length > 0) {
    sections.push("## Key Takeaways");
    sections.push("");
    for (const takeaway of a.keyTakeaways) {
      sections.push(`- ${takeaway}`);
    }
    sections.push("");
  }

  return sections.join("\n").trim();
}
