/**
 * Text Extract Tool
 *
 * Extracts text content from PDF documents.
 * Supports full extraction, page range extraction, and section-based extraction.
 * Requires pdf_fetch to be called first to load the PDF into context.
 */

import { ToolParameter, ToolResult } from '@/types/agent';
import { BaseTool, successResult, errorResult, estimateTokens } from './base';
import { extractText, getDocumentProxy, getMeta } from 'unpdf';
import { PdfToolContext } from './pdf-fetch';

// Common section patterns in academic papers
const SECTION_PATTERNS: Record<string, RegExp[]> = {
  abstract: [
    /\bAbstract\b[\s\n]*([^]*?)(?=\n\s*(?:1\.?\s*)?(?:Introduction|Keywords|Categories)\b)/i,
    /\bAbstract\b[\s\n]*([^]*?)(?=\n{2,})/i,
  ],
  introduction: [
    /\b(?:1\.?\s*)?Introduction\b[\s\n]*([^]*?)(?=\n\s*(?:2\.?\s*)?(?:Related Work|Background|Preliminaries|Method)\b)/i,
  ],
  'related work': [
    /\b(?:2\.?\s*)?Related Work\b[\s\n]*([^]*?)(?=\n\s*(?:3\.?\s*)?(?:Method|Approach|Methodology|Framework)\b)/i,
  ],
  methods: [
    /\b(?:\d\.?\s*)?(?:Method(?:s|ology)?|Approach|Framework)\b[\s\n]*([^]*?)(?=\n\s*(?:\d\.?\s*)?(?:Experiment|Result|Evaluation)\b)/i,
  ],
  experiments: [
    /\b(?:\d\.?\s*)?(?:Experiment(?:s)?|Evaluation|Results?)\b[\s\n]*([^]*?)(?=\n\s*(?:\d\.?\s*)?(?:Discussion|Conclusion|Limitation|Future)\b)/i,
  ],
  conclusion: [
    /\b(?:\d\.?\s*)?Conclusion(?:s)?\b[\s\n]*([^]*?)(?=\n\s*(?:Acknowledg|Reference|Appendix|\[1\])\b)/i,
    /\b(?:\d\.?\s*)?Conclusion(?:s)?\b[\s\n]*([^]*?)$/i,
  ],
  discussion: [
    /\b(?:\d\.?\s*)?Discussion\b[\s\n]*([^]*?)(?=\n\s*(?:\d\.?\s*)?(?:Conclusion|Limitation|Future)\b)/i,
  ],
};

/**
 * Clean extracted text
 */
function cleanText(text: string): string {
  return (
    text
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove excessive blank lines (more than 2)
      .replace(/\n{3,}/g, '\n\n')
      // Remove trailing whitespace from lines
      .replace(/[ \t]+$/gm, '')
      // Fix hyphenated words at line breaks
      .replace(/(\w)-\n(\w)/g, '$1$2')
      // Trim start and end
      .trim()
  );
}

/**
 * Extract a specific section from text
 */
function extractSection(fullText: string, sectionName: string): string | null {
  const normalizedName = sectionName.toLowerCase().trim();
  const patterns = SECTION_PATTERNS[normalizedName];

  if (!patterns) {
    // Try a generic pattern for unknown sections
    const genericPattern = new RegExp(
      `\\b(?:\\d\\.?\\s*)?${sectionName}\\b[\\s\\n]*([^]*?)(?=\\n\\s*(?:\\d\\.?\\s*)?[A-Z][a-z]+\\b|$)`,
      'i'
    );
    const match = fullText.match(genericPattern);
    return match ? cleanText(match[1] || match[0]) : null;
  }

  for (const pattern of patterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      return cleanText(match[1]);
    }
  }

  return null;
}

export class TextExtractTool extends BaseTool {
  name = 'text_extract';

  description = `Extract text content from a PDF document. Can extract the full text,
a specific page range, or a named section (like "abstract", "methods", "conclusion").
Requires pdf_fetch to be called first.`;

  parameters: ToolParameter[] = [
    {
      name: 'target',
      type: 'string',
      description: 'What to extract: "full" for entire document, "pages" for page range, "section" for named section',
      required: false,
      enum: ['full', 'pages', 'section'],
      default: 'full',
    },
    {
      name: 'startPage',
      type: 'number',
      description: 'Starting page number (1-indexed). Required if target is "pages"',
      required: false,
    },
    {
      name: 'endPage',
      type: 'number',
      description: 'Ending page number (inclusive). Required if target is "pages"',
      required: false,
    },
    {
      name: 'section',
      type: 'string',
      description: 'Section name to extract (e.g., "abstract", "introduction", "methods", "experiments", "conclusion"). Required if target is "section"',
      required: false,
    },
  ];

  protected async run(params: Record<string, unknown>): Promise<ToolResult> {
    const target = (params.target as string) || 'full';
    const startPage = params.startPage as number | undefined;
    const endPage = params.endPage as number | undefined;
    const section = params.section as string | undefined;

    // Get PDF buffer from context
    const extendedContext = this.context as PdfToolContext;
    const pdfBuffer = extendedContext.pdfBuffer;

    if (!pdfBuffer) {
      return errorResult('No PDF loaded. Use pdf_fetch first to load a PDF document.');
    }

    try {
      // Get document proxy
      const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
      const totalPages = pdf.numPages;

      // Get metadata
      const meta = await getMeta(pdf);
      const metadata = {
        title: meta.info?.Title || undefined,
        author: meta.info?.Author || undefined,
        creationDate: meta.info?.CreationDate || undefined,
      };

      let extractedText: string;
      let extractionInfo: Record<string, unknown>;

      if (target === 'pages' && startPage !== undefined) {
        // Extract specific page range
        const start = Math.max(1, startPage);
        const end = Math.min(totalPages, endPage || startPage);

        if (start > totalPages) {
          return errorResult(`Start page ${start} exceeds document length (${totalPages} pages)`);
        }

        // Extract text from specified pages
        const { text } = await extractText(pdf, { mergePages: true });
        const fullText = Array.isArray(text) ? text.join('\n\n') : text;

        // For now, return full text with page info (page-level extraction requires more work)
        extractedText = cleanText(fullText);
        extractionInfo = {
          target: 'pages',
          requestedPages: { start, end },
          totalPages,
          note: 'Full text returned; page-level extraction available in future version',
        };
      } else if (target === 'section' && section) {
        // Extract specific section
        const { text } = await extractText(pdf, { mergePages: true });
        const fullText = Array.isArray(text) ? text.join('\n\n') : text;

        const sectionText = extractSection(fullText, section);

        if (!sectionText) {
          return errorResult(
            `Could not find section "${section}" in the document. ` +
            `Available sections: abstract, introduction, related work, methods, experiments, discussion, conclusion`
          );
        }

        extractedText = sectionText;
        extractionInfo = {
          target: 'section',
          section,
          totalPages,
        };
      } else {
        // Full text extraction
        const { text } = await extractText(pdf, { mergePages: true });
        extractedText = cleanText(Array.isArray(text) ? text.join('\n\n') : text);
        extractionInfo = {
          target: 'full',
          totalPages,
        };
      }

      const tokenCount = estimateTokens(extractedText);

      return successResult({
        text: extractedText,
        textLength: extractedText.length,
        estimatedTokens: tokenCount,
        pageCount: totalPages,
        metadata,
        extraction: extractionInfo,
      });
    } catch (error) {
      if (error instanceof Error) {
        return errorResult(`Text extraction failed: ${error.message}`);
      }
      return errorResult('Unknown error during text extraction');
    }
  }
}

// Export singleton instance
export const textExtractTool = new TextExtractTool();
