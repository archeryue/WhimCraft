/**
 * Tests for PDF Fetch Tool
 */

import { pdfFetchTool, PdfToolContext } from '@/lib/agent/tools/pdf-fetch';
import { ToolContext } from '@/types/agent';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Valid PDF header (first 1024 bytes)
const VALID_PDF_HEADER = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4

// Create a valid PDF buffer for testing
function createValidPdfBuffer(size: number = 1024): ArrayBuffer {
  const buffer = new ArrayBuffer(size);
  const view = new Uint8Array(buffer);
  // Set PDF magic bytes
  view.set(VALID_PDF_HEADER, 0);
  return buffer;
}

// Create base context
function createContext(): PdfToolContext {
  return {
    userId: 'test-user',
    conversationId: 'test-conv',
    requestId: 'test-req',
  };
}

describe('PdfFetchTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parameter validation', () => {
    it('should have correct name and description', () => {
      expect(pdfFetchTool.name).toBe('pdf_fetch');
      expect(pdfFetchTool.description).toContain('PDF');
    });

    it('should require url parameter', () => {
      const urlParam = pdfFetchTool.parameters.find((p) => p.name === 'url');
      expect(urlParam).toBeDefined();
      expect(urlParam?.required).toBe(true);
      expect(urlParam?.type).toBe('string');
    });
  });

  describe('URL validation', () => {
    it('should reject invalid URL format', async () => {
      const context = createContext();
      const result = await pdfFetchTool.execute({ url: 'not-a-url' }, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid URL format');
    });

    it('should reject non-HTTP protocols', async () => {
      const context = createContext();
      const result = await pdfFetchTool.execute({ url: 'ftp://example.com/file.pdf' }, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP and HTTPS');
    });

    it('should reject private IP addresses (SSRF prevention)', async () => {
      const context = createContext();

      const privateIPs = [
        'http://10.0.0.1/file.pdf',
        'http://172.16.0.1/file.pdf',
        'http://192.168.1.1/file.pdf',
        'http://127.0.0.1/file.pdf',
        'http://localhost/file.pdf',
      ];

      for (const url of privateIPs) {
        const result = await pdfFetchTool.execute({ url }, context);
        expect(result.success).toBe(false);
        expect(result.error).toContain('private');
      }
    });

    it('should allow valid public URLs', async () => {
      const pdfBuffer = createValidPdfBuffer();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'content-type': 'application/pdf',
          'content-length': '1024',
        }),
        arrayBuffer: () => Promise.resolve(pdfBuffer),
      });

      const context = createContext();
      const result = await pdfFetchTool.execute(
        { url: 'https://arxiv.org/pdf/1234.5678.pdf' },
        context
      );

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('fetch behavior', () => {
    it('should handle HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers(),
      });

      const context = createContext();
      const result = await pdfFetchTool.execute(
        { url: 'https://example.com/missing.pdf' },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('404');
    });

    it('should reject oversized files via content-length header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'content-type': 'application/pdf',
          'content-length': String(100 * 1024 * 1024), // 100MB
        }),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      const context = createContext();
      const result = await pdfFetchTool.execute(
        { url: 'https://example.com/large.pdf' },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('too large');
    });

    it('should reject files with invalid PDF header', async () => {
      // Create buffer without PDF magic bytes
      const invalidBuffer = new ArrayBuffer(1024);
      const view = new Uint8Array(invalidBuffer);
      view.set([0x00, 0x00, 0x00, 0x00], 0); // Not %PDF

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'content-type': 'application/pdf',
        }),
        arrayBuffer: () => Promise.resolve(invalidBuffer),
      });

      const context = createContext();
      const result = await pdfFetchTool.execute(
        { url: 'https://example.com/fake.pdf' },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid PDF');
    });

    it('should accept valid PDFs and store in context', async () => {
      const pdfBuffer = createValidPdfBuffer(2048);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'content-type': 'application/pdf',
          'content-length': '2048',
        }),
        arrayBuffer: () => Promise.resolve(pdfBuffer),
      });

      const context = createContext();
      const result = await pdfFetchTool.execute(
        { url: 'https://example.com/paper.pdf' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('contentLength', 2048);
      expect(context.pdfBuffer).toBeDefined();
      expect(context.pdfBuffer?.byteLength).toBe(2048);
      expect(context.pdfMetadata).toBeDefined();
      expect(context.pdfMetadata?.url).toBe('https://example.com/paper.pdf');
    });

    it('should handle timeout errors', async () => {
      // Simulate AbortError
      const abortError = new Error('Request timeout');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const context = createContext();
      const result = await pdfFetchTool.execute(
        { url: 'https://example.com/slow.pdf' },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const context = createContext();
      const result = await pdfFetchTool.execute(
        { url: 'https://example.com/error.pdf' },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('content type handling', () => {
    it('should accept application/pdf content type', async () => {
      const pdfBuffer = createValidPdfBuffer();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'content-type': 'application/pdf',
        }),
        arrayBuffer: () => Promise.resolve(pdfBuffer),
      });

      const context = createContext();
      const result = await pdfFetchTool.execute(
        { url: 'https://example.com/paper.pdf' },
        context
      );

      expect(result.success).toBe(true);
    });

    it('should accept application/octet-stream with valid PDF', async () => {
      const pdfBuffer = createValidPdfBuffer();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'content-type': 'application/octet-stream',
        }),
        arrayBuffer: () => Promise.resolve(pdfBuffer),
      });

      const context = createContext();
      const result = await pdfFetchTool.execute(
        { url: 'https://example.com/paper.pdf' },
        context
      );

      expect(result.success).toBe(true);
    });

    it('should still validate magic bytes for unexpected content types', async () => {
      const pdfBuffer = createValidPdfBuffer();

      // Console warn is expected for unexpected content types
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'content-type': 'text/html',
        }),
        arrayBuffer: () => Promise.resolve(pdfBuffer),
      });

      const context = createContext();
      const result = await pdfFetchTool.execute(
        { url: 'https://example.com/paper.pdf' },
        context
      );

      // Should still succeed because magic bytes are valid
      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
