/**
 * URL Resolver for Paper Reader
 *
 * Parses academic paper URLs and extracts PDF download URLs.
 * MVP: arXiv support only.
 */

import { ResolvedPaper, PaperSourceType } from "./types";

/**
 * arXiv URL patterns
 * - https://arxiv.org/abs/2401.12345
 * - https://arxiv.org/abs/cs/0123456
 * - https://arxiv.org/pdf/2401.12345.pdf
 */
const ARXIV_ABS_PATTERN = /arxiv\.org\/abs\/([a-z-]*\/?[\d.]+)/i;
const ARXIV_PDF_PATTERN = /arxiv\.org\/pdf\/([a-z-]*\/?[\d.]+)(\.pdf)?/i;

/**
 * Check if URL is a direct PDF link
 */
const DIRECT_PDF_PATTERN = /\.pdf(\?.*)?$/i;

/**
 * Resolve a paper URL to get the PDF download URL
 */
export async function resolveUrl(input: string): Promise<ResolvedPaper> {
  const trimmedInput = input.trim();

  // Validate URL format
  let url: URL;
  try {
    url = new URL(trimmedInput);
  } catch {
    throw new Error("Invalid URL format");
  }

  // Only allow HTTP(S)
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported");
  }

  // Try to detect paper type
  const type = detectPaperType(trimmedInput);

  switch (type) {
    case "arxiv":
      return resolveArxiv(trimmedInput);
    case "direct-pdf":
      return {
        type: "direct-pdf",
        pdfUrl: trimmedInput,
      };
    default:
      throw new Error(
        "Unsupported URL. Currently only arXiv URLs are supported."
      );
  }
}

/**
 * Detect the type of paper source from URL
 */
function detectPaperType(url: string): PaperSourceType | null {
  if (ARXIV_ABS_PATTERN.test(url) || ARXIV_PDF_PATTERN.test(url)) {
    return "arxiv";
  }
  if (DIRECT_PDF_PATTERN.test(url)) {
    return "direct-pdf";
  }
  return null;
}

/**
 * Resolve arXiv URL to PDF URL and metadata
 */
async function resolveArxiv(url: string): Promise<ResolvedPaper> {
  let arxivId: string | undefined;

  // Extract arXiv ID from abs URL
  const absMatch = url.match(ARXIV_ABS_PATTERN);
  if (absMatch) {
    arxivId = absMatch[1];
  }

  // Extract arXiv ID from pdf URL
  const pdfMatch = url.match(ARXIV_PDF_PATTERN);
  if (pdfMatch) {
    arxivId = pdfMatch[1];
  }

  if (!arxivId) {
    throw new Error("Could not extract arXiv ID from URL");
  }

  // Construct PDF URL
  const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;

  // Fetch title from arXiv API
  const title = await fetchArxivTitle(arxivId);

  return {
    type: "arxiv",
    pdfUrl,
    metadata: {
      arxivId,
      title,
    },
  };
}

/**
 * Fetch paper title from arXiv API
 */
async function fetchArxivTitle(arxivId: string): Promise<string | undefined> {
  try {
    const response = await fetch(
      `https://export.arxiv.org/api/query?id_list=${arxivId}`
    );

    if (!response.ok) {
      console.warn(`arXiv API returned ${response.status}`);
      return undefined;
    }

    const xml = await response.text();

    // Parse title from Atom XML
    // Format: <title>Paper Title Here</title>
    // Skip the first <title> which is the feed title
    const titleMatches = xml.match(/<title>([^<]+)<\/title>/g);
    if (titleMatches && titleMatches.length >= 2) {
      // Second title is the paper title (first is feed title)
      const paperTitle = titleMatches[1].replace(/<\/?title>/g, '').trim();
      // Clean up whitespace and newlines
      return paperTitle.replace(/\s+/g, ' ');
    }

    return undefined;
  } catch (error) {
    console.warn('Failed to fetch arXiv title:', error);
    return undefined;
  }
}

/**
 * Validate that a URL is supported
 */
export function isValidPaperUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }
    return detectPaperType(url) !== null;
  } catch {
    return false;
  }
}

/**
 * Get a human-readable description of the paper source
 */
export function getPaperSourceDescription(type: PaperSourceType): string {
  switch (type) {
    case "arxiv":
      return "arXiv";
    case "direct-pdf":
      return "PDF";
    default:
      return "Unknown";
  }
}
