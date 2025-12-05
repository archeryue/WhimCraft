/**
 * PDF Fetch Tool
 *
 * Fetches PDF documents from URLs with validation and security checks.
 * Stores the PDF buffer in context for subsequent tools (text_extract, figure_extract).
 */

import { ToolParameter, ToolResult, ToolContext } from '@/types/agent';
import { BaseTool, successResult, errorResult } from './base';

// Maximum file size: 50MB
const MAX_PDF_SIZE = 50 * 1024 * 1024;

// Request timeout: 30 seconds
const FETCH_TIMEOUT = 30000;

// PDF magic bytes: %PDF
const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46];

// Private IP ranges to block (SSRF prevention)
const PRIVATE_IP_PATTERNS = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^127\./,
  /^0\./,
  /^localhost$/i,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

// Extended tool context with PDF buffer storage
export interface PdfToolContext extends ToolContext {
  pdfBuffer?: ArrayBuffer;
  pdfMetadata?: {
    url: string;
    contentLength: number;
    fetchedAt: number;
  };
}

/**
 * Check if hostname is a private/internal address
 */
function isPrivateIP(hostname: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(hostname));
}

/**
 * Validate that buffer starts with PDF magic bytes (%PDF)
 */
function validatePdfMagicBytes(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) {
    return false;
  }
  const bytes = new Uint8Array(buffer.slice(0, 4));
  return PDF_MAGIC_BYTES.every((byte, index) => bytes[index] === byte);
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export class PdfFetchTool extends BaseTool {
  name = 'pdf_fetch';

  description = `Fetch a PDF document from a URL. Downloads the PDF and stores it for
subsequent operations like text extraction or figure extraction. Use this tool first
before using text_extract or figure_extract.`;

  parameters: ToolParameter[] = [
    {
      name: 'url',
      type: 'string',
      description: 'The URL of the PDF document to fetch',
      required: true,
    },
  ];

  protected async run(params: Record<string, unknown>): Promise<ToolResult> {
    const url = params.url as string;

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return errorResult('Invalid URL format');
    }

    // Only allow HTTP(S)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return errorResult('Only HTTP and HTTPS URLs are supported');
    }

    // SSRF prevention - block private IPs
    if (isPrivateIP(parsedUrl.hostname)) {
      return errorResult('Cannot fetch from private or internal addresses');
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'WhimCraft-PaperReader/1.0',
          Accept: 'application/pdf',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return errorResult(`Failed to fetch PDF: HTTP ${response.status}`);
      }

      // Check content type (warning only, we validate magic bytes later)
      const contentType = response.headers.get('content-type') || '';
      if (
        !contentType.includes('application/pdf') &&
        !contentType.includes('application/octet-stream')
      ) {
        console.warn(`[pdf_fetch] Unexpected content-type: ${contentType}`);
      }

      // Check content length if available
      const contentLengthHeader = response.headers.get('content-length');
      if (contentLengthHeader) {
        const declaredSize = parseInt(contentLengthHeader, 10);
        if (declaredSize > MAX_PDF_SIZE) {
          return errorResult(
            `PDF too large: ${formatFileSize(declaredSize)} (max: ${formatFileSize(MAX_PDF_SIZE)})`
          );
        }
      }

      // Read the response
      const buffer = await response.arrayBuffer();

      // Check actual size
      if (buffer.byteLength > MAX_PDF_SIZE) {
        return errorResult(
          `PDF too large: ${formatFileSize(buffer.byteLength)} (max: ${formatFileSize(MAX_PDF_SIZE)})`
        );
      }

      // Validate PDF magic bytes
      if (!validatePdfMagicBytes(buffer)) {
        return errorResult('Invalid PDF file: missing PDF header signature');
      }

      // Store buffer in context for subsequent tools
      const extendedContext = this.context as PdfToolContext;
      extendedContext.pdfBuffer = buffer;
      extendedContext.pdfMetadata = {
        url,
        contentLength: buffer.byteLength,
        fetchedAt: Date.now(),
      };

      return successResult({
        message: `Successfully fetched PDF (${formatFileSize(buffer.byteLength)})`,
        url,
        contentLength: buffer.byteLength,
        contentLengthFormatted: formatFileSize(buffer.byteLength),
      });
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return errorResult('Request timed out while fetching PDF');
        }
        return errorResult(`Failed to fetch PDF: ${error.message}`);
      }

      return errorResult('Unknown error while fetching PDF');
    }
  }
}

// Export singleton instance
export const pdfFetchTool = new PdfFetchTool();
