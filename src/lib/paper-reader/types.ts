/**
 * Paper Reader Types
 *
 * TypeScript interfaces for the Paper Reader feature.
 */

import { JSONContent } from "@tiptap/core";

/**
 * Supported paper source types
 */
export type PaperSourceType = "arxiv" | "direct-pdf";

/**
 * Resolved paper information from URL
 */
export interface ResolvedPaper {
  type: PaperSourceType;
  pdfUrl: string;
  metadata?: {
    arxivId?: string;
    title?: string;
    authors?: string[];
    abstract?: string;
    publishedDate?: string;
  };
}

/**
 * Result of PDF fetching
 */
export interface FetchResult {
  buffer: ArrayBuffer;
  contentType: string;
  contentLength: number;
}

/**
 * Parsed PDF content
 */
export interface ParsedPaper {
  text: string;
  pageCount: number;
  metadata: {
    title?: string;
    author?: string;
    creationDate?: string;
  };
}

/**
 * Figure extracted from paper with importance scoring
 */
export interface PaperFigure {
  id: string;
  page: number;
  imageBase64: string;
  caption?: string;
  importance: number;
  importanceReason?: string;
  type?: string;
}

/**
 * Structured paper analysis from AI
 */
export interface PaperAnalysis {
  metadata: {
    title?: string;
    authors?: string[];
    publishedDate?: string;
    venue?: string;
    sourceUrl: string;
    arxivId?: string;
    analyzedAt?: string;
  };
  analysis: {
    summary: string;
    problemStatement?: string;
    keyContributions: string[];
    methodology?: string;
    results?: string;
    limitations?: string;
    futureWork?: string;
    keyTakeaways: string[];
  };
  figures?: PaperFigure[];
}

/**
 * Progress stages for paper analysis
 */
export type AnalysisStage =
  | "validating"
  | "fetching"
  | "parsing"
  | "analyzing"
  | "formatting"
  | "complete"
  | "error";

/**
 * Progress event for SSE streaming
 */
export interface AnalysisProgress {
  stage: AnalysisStage;
  progress: number;  // 0-100
  message: string;
  result?: PaperAnalysis;
  error?: string;
}

/**
 * Whim-compatible output
 */
export interface PaperWhimData {
  title: string;
  blocks: JSONContent;
  metadata: {
    type: "paper-analysis";
    sourceUrl: string;
    arxivId?: string;
    authors: string[];
    publishedDate?: string;
    analyzedAt: string;
  };
}

/**
 * API request for paper analysis
 */
export interface AnalyzePaperRequest {
  url: string;
}

/**
 * Rate limit info
 */
export interface RateLimitInfo {
  allowed: boolean;
  remaining: number;
  resetTime?: Date;
  message?: string;
}
