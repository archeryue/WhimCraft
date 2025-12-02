/**
 * PDF Fetcher for Paper Reader
 *
 * Downloads PDF files from URLs with validation and security checks.
 */

import { FetchResult } from "./types";

// Maximum file size: 50MB (generous for academic papers)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Request timeout: 30 seconds
const FETCH_TIMEOUT = 30000;

// PDF magic bytes
const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46]; // %PDF

/**
 * Fetch PDF from URL
 */
export async function fetchPdf(url: string): Promise<FetchResult> {
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "WhimCraft Paper Reader/1.0",
        Accept: "application/pdf",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: HTTP ${response.status}`);
    }

    // Check content type
    const contentType = response.headers.get("content-type") || "";
    if (
      !contentType.includes("application/pdf") &&
      !contentType.includes("application/octet-stream")
    ) {
      // Some servers don't set correct content-type, we'll validate magic bytes later
      console.warn(`Unexpected content-type: ${contentType}, proceeding anyway`);
    }

    // Check content length if available
    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = parseInt(contentLengthHeader, 10);
      if (contentLength > MAX_FILE_SIZE) {
        throw new Error(
          `PDF file too large: ${Math.round(contentLength / 1024 / 1024)}MB (max: ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB)`
        );
      }
    }

    // Read the response
    const buffer = await response.arrayBuffer();

    // Check actual size
    if (buffer.byteLength > MAX_FILE_SIZE) {
      throw new Error(
        `PDF file too large: ${Math.round(buffer.byteLength / 1024 / 1024)}MB (max: ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB)`
      );
    }

    // Validate PDF magic bytes
    if (!validatePdfMagicBytes(buffer)) {
      throw new Error("Invalid PDF file: missing PDF header");
    }

    return {
      buffer,
      contentType: "application/pdf",
      contentLength: buffer.byteLength,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error("Request timed out while fetching PDF");
      }
      throw error;
    }

    throw new Error("Unknown error while fetching PDF");
  }
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
 * Get human-readable file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
