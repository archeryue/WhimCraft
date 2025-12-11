/**
 * Paper Analyzer for Paper Reader
 *
 * Sends paper text to Gemini READER tier for structured analysis.
 * Uses intelligent text extraction to focus on information-dense sections
 * for faster analysis while maintaining quality.
 */

import { ProviderFactory } from "@/lib/providers/provider-factory";
import { GEMINI_MODELS, ModelTier } from "@/config/models";
import { PaperAnalysis, ResolvedPaper, ParsedPaper } from "./types";

// Maximum characters to send to AI (about 15K tokens)
const MAX_TEXT_LENGTH = 60000;

// Target length for optimized extraction (about 7K tokens)
const TARGET_TEXT_LENGTH = 28000;

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
  // Create provider with READER model
  const provider = ProviderFactory.createDefaultProvider(
    GEMINI_MODELS[ModelTier.READER]
  );

  // Extract optimized text (focus on information-dense sections)
  const optimizedText = extractOptimizedText(parsedPaper.text);

  // Build the prompt with optimized paper content
  const prompt = ANALYSIS_PROMPT.replace("{paper_text}", optimizedText);

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
  // Try resolved metadata first (arXiv API title)
  if (resolvedPaper.metadata?.title) {
    return resolvedPaper.metadata.title;
  }

  // Try PDF metadata
  if (parsedPaper.metadata.title) {
    return parsedPaper.metadata.title;
  }

  // Try to extract from first line of text (often the title in PDFs)
  const firstLine = parsedPaper.text.split("\n")[0]?.trim();
  if (firstLine && firstLine.length > 10 && firstLine.length < 200) {
    // Check if it looks like a title (not just numbers or metadata)
    const looksLikeTitle = /^[A-Z]/.test(firstLine) && !/^\d+$/.test(firstLine);
    if (looksLikeTitle) {
      return firstLine;
    }
  }

  // Fallback: Use arxiv ID as title (better than "Untitled Paper")
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

/**
 * Extract optimized text for analysis
 *
 * Academic papers have predictable structure:
 * - Abstract: Core contribution (~300-500 words)
 * - Introduction: Problem and context (~1000-2000 words)
 * - Methods/Approach: Technical details
 * - Results: Findings and comparisons
 * - Conclusion: Summary and future work (~500-1000 words)
 *
 * We focus on the most information-dense sections to reduce
 * latency while maintaining analysis quality.
 */
function extractOptimizedText(fullText: string): string {
  // If text is already short enough, use it all
  if (fullText.length <= MAX_TEXT_LENGTH) {
    return fullText;
  }

  const lines = fullText.split("\n");
  const totalLines = lines.length;

  // If text has very few lines (common with some PDF extractors), use simple truncation
  // This handles cases where PDF text is extracted without proper line breaks
  if (totalLines < 10) {
    return fullText.slice(0, MAX_TEXT_LENGTH) + (fullText.length > MAX_TEXT_LENGTH ? "\n\n[Text truncated for analysis]" : "");
  }

  // Section detection patterns (case-insensitive)
  const abstractPatterns = /^(abstract|摘要|summary)\s*$/i;
  const introPatterns = /^(1\.?\s*)?(introduction|引言|背景)\s*$/i;
  const methodPatterns = /^(\d+\.?\s*)?(method|approach|methodology|方法|技术路线)\s*$/i;
  const resultPatterns = /^(\d+\.?\s*)?(result|experiment|evaluation|实验|结果)\s*$/i;
  const conclusionPatterns = /^(\d+\.?\s*)?(conclusion|discussion|summary|future|结论|总结|讨论)\s*$/i;
  const referencePatterns = /^(reference|bibliography|参考文献)\s*$/i;

  // Find section boundaries
  let abstractStart = -1;
  let introStart = -1;
  let methodStart = -1;
  let resultStart = -1;
  let conclusionStart = -1;
  let referenceStart = -1;

  for (let i = 0; i < totalLines; i++) {
    const line = lines[i].trim();
    if (line.length === 0 || line.length > 100) continue;

    if (abstractPatterns.test(line)) abstractStart = i;
    else if (introPatterns.test(line)) introStart = i;
    else if (methodPatterns.test(line)) methodStart = i;
    else if (resultPatterns.test(line)) resultStart = i;
    else if (conclusionPatterns.test(line)) conclusionStart = i;
    else if (referencePatterns.test(line)) referenceStart = i;
  }

  // If we couldn't find structure, use heuristic extraction
  if (abstractStart === -1 && introStart === -1 && conclusionStart === -1) {
    return heuristicExtraction(fullText);
  }

  // Build optimized text from sections
  const sections: string[] = [];
  let currentLength = 0;

  // 1. Always include the beginning (title, abstract, etc.)
  const startEnd = Math.max(
    abstractStart !== -1 ? findSectionEnd(lines, abstractStart) : 0,
    introStart !== -1 ? introStart - 1 : Math.min(30, totalLines)
  );
  const startSection = lines.slice(0, Math.min(startEnd + 1, 50)).join("\n");
  sections.push(startSection);
  currentLength += startSection.length;

  // 2. Include introduction if found
  if (introStart !== -1 && currentLength < TARGET_TEXT_LENGTH) {
    const introEnd = findNextSectionStart(lines, introStart, [methodStart, resultStart, conclusionStart, referenceStart]);
    const introSection = lines.slice(introStart, Math.min(introEnd, introStart + 100)).join("\n");
    if (currentLength + introSection.length < TARGET_TEXT_LENGTH) {
      sections.push("\n\n" + introSection);
      currentLength += introSection.length;
    }
  }

  // 3. Include method/approach section if space allows
  if (methodStart !== -1 && currentLength < TARGET_TEXT_LENGTH * 0.7) {
    const methodEnd = findNextSectionStart(lines, methodStart, [resultStart, conclusionStart, referenceStart]);
    // Take first portion of methods (usually the overview)
    const methodLines = Math.min(methodEnd - methodStart, 60);
    const methodSection = lines.slice(methodStart, methodStart + methodLines).join("\n");
    sections.push("\n\n" + methodSection);
    currentLength += methodSection.length;
  }

  // 4. Include results section if space allows
  if (resultStart !== -1 && currentLength < TARGET_TEXT_LENGTH * 0.85) {
    const resultEnd = findNextSectionStart(lines, resultStart, [conclusionStart, referenceStart]);
    // Take first portion of results (usually key findings)
    const resultLines = Math.min(resultEnd - resultStart, 50);
    const resultSection = lines.slice(resultStart, resultStart + resultLines).join("\n");
    sections.push("\n\n" + resultSection);
    currentLength += resultSection.length;
  }

  // 5. Always try to include conclusion
  if (conclusionStart !== -1) {
    const conclusionEnd = referenceStart !== -1 ? referenceStart : totalLines;
    const conclusionSection = lines.slice(conclusionStart, Math.min(conclusionEnd, conclusionStart + 50)).join("\n");
    sections.push("\n\n" + conclusionSection);
  }

  const result = sections.join("");

  // Final safety truncation
  if (result.length > MAX_TEXT_LENGTH) {
    return result.slice(0, MAX_TEXT_LENGTH) + "\n\n[Text truncated for analysis]";
  }

  return result;
}

/**
 * Find where a section ends (next section header or substantial gap)
 */
function findSectionEnd(lines: string[], startIndex: number): number {
  const sectionPattern = /^(\d+\.?\s*)?[A-Z][a-zA-Z\s]+$/;

  for (let i = startIndex + 1; i < Math.min(startIndex + 100, lines.length); i++) {
    const line = lines[i].trim();
    if (line.length > 0 && line.length < 80 && sectionPattern.test(line)) {
      return i - 1;
    }
  }
  return startIndex + 30; // Default section length
}

/**
 * Find the start of the next section
 */
function findNextSectionStart(
  lines: string[],
  currentStart: number,
  possibleStarts: number[]
): number {
  const validStarts = possibleStarts.filter((s) => s > currentStart && s !== -1);
  if (validStarts.length === 0) {
    return Math.min(currentStart + 100, lines.length);
  }
  return Math.min(...validStarts);
}

/**
 * Heuristic extraction when section structure isn't detected
 * Uses beginning, middle, and end of paper
 */
function heuristicExtraction(text: string): string {
  const lines = text.split("\n");
  const totalLines = lines.length;

  // Take first 25% (title, abstract, intro)
  const firstPortion = Math.floor(totalLines * 0.25);
  // Take last 15% (conclusion, summary)
  const lastPortion = Math.floor(totalLines * 0.15);

  const beginning = lines.slice(0, firstPortion).join("\n");
  const ending = lines.slice(totalLines - lastPortion).join("\n");

  let result = beginning + "\n\n[...]\n\n" + ending;

  // If still too long, truncate proportionally
  if (result.length > MAX_TEXT_LENGTH) {
    const ratio = MAX_TEXT_LENGTH / result.length;
    const newFirstPortion = Math.floor(firstPortion * ratio);
    const newLastPortion = Math.floor(lastPortion * ratio);

    result =
      lines.slice(0, newFirstPortion).join("\n") +
      "\n\n[...]\n\n" +
      lines.slice(totalLines - newLastPortion).join("\n");
  }

  return result;
}
