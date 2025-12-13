/**
 * Whim Converter for Repo Reader
 *
 * Converts repository analysis to TipTap JSON blocks for Whim storage.
 */

import { generateJSON } from "@tiptap/html/server";
import StarterKit from "@tiptap/starter-kit";
import { marked } from "marked";
import { JSONContent } from "@tiptap/core";

interface RepoAnalysisMetadata {
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
}

interface RepoAnalysisContent {
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
}

interface RepoAnalysis {
  metadata: RepoAnalysisMetadata;
  analysis: RepoAnalysisContent;
}

interface RepoWhimData {
  title: string;
  blocks: JSONContent;
  metadata: {
    type: string;
    sourceUrl: string;
    owner: string;
    repo: string;
    language: string;
    stars: number;
    analyzedAt: string;
  };
}

// Configure marked options
marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * Convert repo analysis to Whim-compatible format
 */
export function analysisToWhimData(analysis: RepoAnalysis): RepoWhimData {
  const markdown = analysisToMarkdown(analysis);
  const blocks = markdownToBlocks(markdown);

  return {
    title: `${analysis.metadata.fullName} - Architecture Analysis`,
    blocks,
    metadata: {
      type: "repo-analysis",
      sourceUrl: analysis.metadata.url,
      owner: analysis.metadata.owner,
      repo: analysis.metadata.name,
      language: analysis.metadata.language,
      stars: analysis.metadata.stars,
      analyzedAt: new Date().toISOString(),
    },
  };
}

/**
 * Convert repo analysis to markdown format
 */
export function analysisToMarkdown(analysis: RepoAnalysis): string {
  const { metadata, analysis: a } = analysis;
  const sections: string[] = [];

  // Header with metadata
  sections.push(`# ${metadata.fullName}`);
  sections.push("");

  sections.push(`**Repository:** [${metadata.url}](${metadata.url})`);
  sections.push(`**Language:** ${metadata.language}`);
  sections.push(`**Stars:** ${metadata.stars.toLocaleString()}`);
  sections.push(`**Forks:** ${metadata.forks.toLocaleString()}`);
  if (metadata.license) {
    sections.push(`**License:** ${metadata.license}`);
  }
  sections.push(`**Last Push:** ${new Date(metadata.lastPush).toLocaleDateString()}`);
  sections.push("");

  if (metadata.description) {
    sections.push(`> ${metadata.description}`);
    sections.push("");
  }

  // Overview
  sections.push("## Overview");
  sections.push("");
  sections.push(a.overview);
  sections.push("");

  // Tech Stack
  sections.push("## Tech Stack");
  sections.push("");
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

  // Architecture
  if (a.architecture) {
    sections.push("## Architecture");
    sections.push("");
    sections.push("```");
    sections.push(a.architecture);
    sections.push("```");
    sections.push("");
  }

  // Module Breakdown
  if (a.modules.length > 0) {
    sections.push("## Module Breakdown");
    sections.push("");
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

  // Entry Points
  if (a.entryPoints.length > 0) {
    sections.push("## Entry Points");
    sections.push("");
    for (const ep of a.entryPoints) {
      sections.push(`- **${ep.type}:** [\`${ep.file}\`](${ep.url})${ep.description ? ` - ${ep.description}` : ""}`);
    }
    sections.push("");
  }

  // Data Flow
  if (a.dataFlow) {
    sections.push("## Data Flow");
    sections.push("");
    sections.push(a.dataFlow);
    sections.push("");
  }

  // Setup Instructions
  if (a.setupInstructions) {
    sections.push("## Setup Instructions");
    sections.push("");
    sections.push(a.setupInstructions);
    sections.push("");
  }

  // Code Patterns
  if (a.codePatterns.length > 0) {
    sections.push("## Code Patterns");
    sections.push("");
    for (const pattern of a.codePatterns) {
      sections.push(`- ${pattern}`);
    }
    sections.push("");
  }

  // Learning Points
  if (a.learningPoints.length > 0) {
    sections.push("## Learning Points");
    sections.push("");
    for (const point of a.learningPoints) {
      sections.push(`- ${point}`);
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

  // Parse HTML to TipTap JSON using StarterKit extension
  const json = generateJSON(html, [StarterKit]);

  return json;
}
