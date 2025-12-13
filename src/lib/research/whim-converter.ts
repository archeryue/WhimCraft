/**
 * Whim Converter for Deep Research
 *
 * Converts research results to TipTap JSON blocks for Whim storage.
 */

import { generateJSON } from "@tiptap/html/server";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { marked } from "marked";
import { JSONContent } from "@tiptap/core";
import { ResearchResult, ResearchWhimData, ResearchCitation } from "./types";

// Configure marked options
marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * Convert research result to Whim-compatible format
 * @param result - The research result data
 */
export function researchToWhimData(result: ResearchResult): ResearchWhimData {
  const markdown = researchToMarkdown(result);
  const blocks = markdownToBlocks(markdown);

  // Generate title from query (truncate if needed)
  const queryPreview =
    result.query.length > 60
      ? result.query.substring(0, 60) + "..."
      : result.query;
  const title = `Research: ${queryPreview}`;

  return {
    title,
    blocks,
    metadata: {
      type: "research",
      query: result.query,
      citationCount: result.citations.length,
      completedAt: result.metadata.completedAt,
    },
  };
}

/**
 * Convert research result to markdown format
 * @param result - The research result data
 */
export function researchToMarkdown(result: ResearchResult): string {
  const sections: string[] = [];

  // Header
  sections.push("# Research Report");
  sections.push("");

  // Query info
  sections.push(`**Research Query:** ${result.query}`);
  sections.push("");

  // Duration info
  const durationMinutes = Math.floor(result.metadata.durationMs / 60000);
  const durationSeconds = Math.floor(
    (result.metadata.durationMs % 60000) / 1000
  );
  sections.push(
    `*Completed in ${durationMinutes}m ${durationSeconds}s on ${new Date(result.metadata.completedAt).toLocaleDateString()}*`
  );
  sections.push("");

  sections.push("---");
  sections.push("");

  // Main report content
  sections.push(result.report);
  sections.push("");

  // Citations/Sources section
  if (result.citations.length > 0) {
    sections.push("---");
    sections.push("");
    sections.push("## Sources");
    sections.push("");
    for (const citation of result.citations) {
      const displayTitle = citation.title || citation.url;
      sections.push(`- [${displayTitle}](${citation.url})`);
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

  // Parse HTML to TipTap JSON using StarterKit + Link extensions
  const json = generateJSON(html, [
    StarterKit,
    Link.configure({
      openOnClick: false,
    }),
  ]);

  return json;
}

/**
 * Generate a display-ready markdown version of the research
 * (without the "My Notes" section, for copying)
 */
export function researchToDisplayMarkdown(result: ResearchResult): string {
  const sections: string[] = [];

  // Header
  sections.push("# Research Report");
  sections.push("");

  // Query info
  sections.push(`**Research Query:** ${result.query}`);
  sections.push("");

  // Duration info
  const durationMinutes = Math.floor(result.metadata.durationMs / 60000);
  const durationSeconds = Math.floor(
    (result.metadata.durationMs % 60000) / 1000
  );
  sections.push(
    `*Completed in ${durationMinutes}m ${durationSeconds}s on ${new Date(result.metadata.completedAt).toLocaleDateString()}*`
  );
  sections.push("");

  sections.push("---");
  sections.push("");

  // Main report content
  sections.push(result.report);
  sections.push("");

  // Citations/Sources section
  if (result.citations.length > 0) {
    sections.push("---");
    sections.push("");
    sections.push("## Sources");
    sections.push("");
    for (const citation of result.citations) {
      const displayTitle = citation.title || citation.url;
      sections.push(`- [${displayTitle}](${citation.url})`);
    }
  }

  return sections.join("\n").trim();
}

/**
 * Extract citations from report text (fallback if API doesn't return citations)
 * Looks for markdown links in the format [title](url)
 */
export function extractCitationsFromReport(report: string): ResearchCitation[] {
  const citations: ResearchCitation[] = [];
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let match;

  const seenUrls = new Set<string>();

  while ((match = linkRegex.exec(report)) !== null) {
    const title = match[1];
    const url = match[2];

    // Deduplicate by URL
    if (!seenUrls.has(url)) {
      seenUrls.add(url);
      citations.push({ url, title });
    }
  }

  return citations;
}
