/**
 * Paper Analyzer for Paper Reader
 *
 * Sends paper text to Gemini READER tier for structured analysis.
 */

import { ProviderFactory } from "@/lib/providers/provider-factory";
import { GEMINI_MODELS, ModelTier } from "@/config/models";
import { PaperAnalysis, ResolvedPaper, ParsedPaper } from "./types";

/**
 * Analysis prompt for paper analysis
 */
const ANALYSIS_PROMPT = `You are an expert academic paper analyst. Analyze the following academic paper and provide a comprehensive, structured analysis.

## Paper Content
{paper_text}

## Instructions

Provide your analysis in the following JSON format. Be thorough but concise. Use the same language as the paper (English or Chinese).

{
  "summary": "2-3 sentences summarizing the paper's main contribution and findings",
  "problemStatement": "What problem does this paper address? Why is it important?",
  "keyContributions": ["Main contribution 1", "Main contribution 2", "Main contribution 3"],
  "methodology": "Describe the technical approach, methods, algorithms, or experimental setup used",
  "results": "Key findings, metrics, experimental results, and performance comparisons",
  "limitations": "Acknowledged or apparent limitations of the work",
  "futureWork": "Directions for future research suggested or implied by the paper",
  "keyTakeaways": ["Key takeaway 1", "Key takeaway 2", "Key takeaway 3", "Key takeaway 4"]
}

Important:
- Output ONLY valid JSON, no markdown code blocks or additional text
- All fields are required
- keyContributions and keyTakeaways should each have 3-5 items
- Be specific and informative, avoid generic statements`;

/**
 * Analyze a paper using the READER model
 */
export async function analyzePaper(
  parsedPaper: ParsedPaper,
  resolvedPaper: ResolvedPaper
): Promise<PaperAnalysis> {
  // Create provider with READER model (Gemini 1.5 Pro, 2M context)
  const provider = ProviderFactory.createDefaultProvider(
    GEMINI_MODELS[ModelTier.READER]
  );

  // Build the prompt with paper content
  const prompt = ANALYSIS_PROMPT.replace("{paper_text}", parsedPaper.text);

  // Generate analysis
  const result = await provider.generateResponse(
    [{ role: "user", content: "Please analyze this paper." }],
    prompt,
    0.3 // Low temperature for consistent, factual analysis
  );

  // Parse the JSON response
  const analysisData = parseAnalysisResponse(result.content);

  // Extract title from metadata or generate from content
  const title = extractTitle(parsedPaper, resolvedPaper, analysisData.summary);

  // Extract authors if available
  const authors = extractAuthors(parsedPaper);

  return {
    metadata: {
      title,
      authors,
      publishedDate: parsedPaper.metadata.creationDate
        ? formatDate(parsedPaper.metadata.creationDate)
        : undefined,
      sourceUrl: resolvedPaper.pdfUrl,
      arxivId: resolvedPaper.metadata?.arxivId,
    },
    analysis: analysisData,
  };
}

/**
 * Parse the AI response into structured analysis data
 */
function parseAnalysisResponse(content: string): PaperAnalysis["analysis"] {
  // Clean up the response - remove markdown code blocks if present
  let cleanContent = content.trim();
  if (cleanContent.startsWith("```json")) {
    cleanContent = cleanContent.slice(7);
  } else if (cleanContent.startsWith("```")) {
    cleanContent = cleanContent.slice(3);
  }
  if (cleanContent.endsWith("```")) {
    cleanContent = cleanContent.slice(0, -3);
  }
  cleanContent = cleanContent.trim();

  try {
    const parsed = JSON.parse(cleanContent);

    // Validate required fields
    return {
      summary: parsed.summary || "No summary available",
      problemStatement: parsed.problemStatement || "Not specified",
      keyContributions: Array.isArray(parsed.keyContributions)
        ? parsed.keyContributions
        : [],
      methodology: parsed.methodology || "Not specified",
      results: parsed.results || "Not specified",
      limitations: parsed.limitations || "Not specified",
      futureWork: parsed.futureWork || "Not specified",
      keyTakeaways: Array.isArray(parsed.keyTakeaways)
        ? parsed.keyTakeaways
        : [],
    };
  } catch (error) {
    console.error("Failed to parse analysis response:", error);
    console.error("Raw content:", content);

    // Return a fallback with the raw content as summary
    return {
      summary: content.slice(0, 500),
      problemStatement: "Analysis parsing failed",
      keyContributions: [],
      methodology: "Analysis parsing failed",
      results: "Analysis parsing failed",
      limitations: "Analysis parsing failed",
      futureWork: "Analysis parsing failed",
      keyTakeaways: [],
    };
  }
}

/**
 * Extract or generate paper title
 */
function extractTitle(
  parsedPaper: ParsedPaper,
  resolvedPaper: ResolvedPaper,
  summary: string
): string {
  // Try PDF metadata first
  if (parsedPaper.metadata.title) {
    return parsedPaper.metadata.title;
  }

  // Try resolved metadata
  if (resolvedPaper.metadata?.title) {
    return resolvedPaper.metadata.title;
  }

  // Fallback: Generate from summary or first line
  const firstLine = parsedPaper.text.split("\n")[0]?.trim();
  if (firstLine && firstLine.length < 200) {
    return firstLine;
  }

  // Last resort: Use arxiv ID or generic title
  if (resolvedPaper.metadata?.arxivId) {
    return `arXiv:${resolvedPaper.metadata.arxivId}`;
  }

  return "Untitled Paper";
}

/**
 * Extract authors from PDF metadata
 */
function extractAuthors(parsedPaper: ParsedPaper): string[] {
  if (!parsedPaper.metadata.author) {
    return [];
  }

  // Author field might be comma-separated or semicolon-separated
  const authorString = parsedPaper.metadata.author;
  const separators = [";", ",", " and "];

  for (const sep of separators) {
    if (authorString.includes(sep)) {
      return authorString
        .split(sep)
        .map((a) => a.trim())
        .filter((a) => a.length > 0);
    }
  }

  // Single author
  return [authorString.trim()];
}

/**
 * Format PDF date string to readable format
 */
function formatDate(dateString: string): string {
  // PDF dates are often in format: D:YYYYMMDDHHmmSS
  const pdfDateMatch = dateString.match(/D:(\d{4})(\d{2})(\d{2})/);
  if (pdfDateMatch) {
    const [, year, month, day] = pdfDateMatch;
    return `${year}-${month}-${day}`;
  }

  // Try standard date parsing
  try {
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  } catch {
    // Ignore parsing errors
  }

  return dateString;
}
