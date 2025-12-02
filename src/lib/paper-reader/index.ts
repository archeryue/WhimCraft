/**
 * Paper Reader Module
 *
 * Provides functionality to analyze academic papers from URLs.
 *
 * NOTE: This module is split to avoid importing server-only dependencies
 * (like @tiptap/html/server) in client components.
 *
 * For server-side operations (API routes):
 * - Import directly from individual files (e.g., ./whim-converter)
 *
 * For client-side operations:
 * - Use exports from this index file (types and client-safe functions only)
 */

// Types (safe for both client and server)
export type {
  PaperSourceType,
  ResolvedPaper,
  FetchResult,
  ParsedPaper,
  PaperAnalysis,
  AnalysisStage,
  AnalysisProgress,
  PaperWhimData,
  AnalyzePaperRequest,
  RateLimitInfo,
} from "./types";

// URL Resolution (client-safe)
export { resolveUrl, isValidPaperUrl, getPaperSourceDescription } from "./url-resolver";

// NOTE: The following exports are SERVER-ONLY and should not be imported in client components:
// - fetchPdf, parsePdf from pdf operations
// - analyzePaper from analyzer
// - analysisToWhimData, analysisToMarkdown from whim-converter
//
// Import these directly in server components/API routes:
// import { fetchPdf } from "@/lib/paper-reader/pdf-fetcher";
// import { parsePdf } from "@/lib/paper-reader/pdf-parser";
// import { analyzePaper } from "@/lib/paper-reader/analyzer";
// import { analysisToWhimData } from "@/lib/paper-reader/whim-converter";
