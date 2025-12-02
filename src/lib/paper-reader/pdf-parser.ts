/**
 * PDF Parser for Paper Reader
 *
 * Extracts text content from PDF files using unpdf.
 * unpdf is designed for serverless environments and works across all JS runtimes.
 */

import { extractText, getDocumentProxy, getMeta } from "unpdf";
import { ParsedPaper } from "./types";

/**
 * Parse PDF buffer and extract text content
 */
export async function parsePdf(buffer: ArrayBuffer): Promise<ParsedPaper> {
  try {
    // Get document proxy
    const pdf = await getDocumentProxy(new Uint8Array(buffer));

    // Extract text from all pages
    const { text, totalPages } = await extractText(pdf, { mergePages: true });

    // Clean the extracted text
    const cleanedText = cleanText(Array.isArray(text) ? text.join("\n\n") : text);

    // Get metadata
    const meta = await getMeta(pdf);

    return {
      text: cleanedText,
      pageCount: totalPages,
      metadata: {
        title: meta.info?.Title || undefined,
        author: meta.info?.Author || undefined,
        creationDate: meta.info?.CreationDate || undefined,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse PDF: ${error.message}`);
    }
    throw new Error("Failed to parse PDF: Unknown error");
  }
}

/**
 * Clean extracted text
 * - Remove excessive whitespace
 * - Fix common OCR/extraction issues
 * - Normalize line endings
 */
function cleanText(text: string): string {
  return (
    text
      // Normalize line endings
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      // Remove excessive blank lines (more than 2)
      .replace(/\n{3,}/g, "\n\n")
      // Remove trailing whitespace from lines
      .replace(/[ \t]+$/gm, "")
      // Remove leading whitespace from lines (preserve indentation up to 4 spaces)
      .replace(/^[ \t]{5,}/gm, "    ")
      // Fix hyphenated words at line breaks (common in PDFs)
      .replace(/(\w)-\n(\w)/g, "$1$2")
      // Trim start and end
      .trim()
  );
}

/**
 * Estimate token count for text (rough approximation)
 * ~4 characters per token for English text
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
