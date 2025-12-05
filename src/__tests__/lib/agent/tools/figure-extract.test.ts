/**
 * Tests for Figure Extract Tool
 */

import { figureExtractTool, ExtractedFigure } from '@/lib/agent/tools/figure-extract';
import { PdfToolContext } from '@/lib/agent/tools/pdf-fetch';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Store original env
const originalEnv = process.env;

// Create base context without PDF
function createContextWithoutPdf(): PdfToolContext {
  return {
    userId: 'test-user',
    conversationId: 'test-conv',
    requestId: 'test-req',
  };
}

// Create context with PDF buffer
function createContextWithPdf(): PdfToolContext {
  return {
    userId: 'test-user',
    conversationId: 'test-conv',
    requestId: 'test-req',
    pdfBuffer: new ArrayBuffer(1024),
    pdfMetadata: {
      url: 'https://example.com/paper.pdf',
      contentLength: 1024,
      fetchedAt: Date.now(),
    },
  };
}

// Mock figure response
const mockFigures: ExtractedFigure[] = [
  {
    page: 1,
    imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    dimensions: { width: 600, height: 400 },
    bounds: { x0: 50, y0: 100, x1: 250, y1: 200 },
  },
  {
    page: 2,
    imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    dimensions: { width: 800, height: 600 },
    bounds: { x0: 100, y0: 150, x1: 400, y1: 350 },
    captionHint: 'Figure',
  },
];

describe('FigureExtractTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('parameter validation', () => {
    it('should have correct name and description', () => {
      expect(figureExtractTool.name).toBe('figure_extract');
      expect(figureExtractTool.description).toContain('figures');
      expect(figureExtractTool.description).toContain('charts');
    });

    it('should have optional maxFigures parameter', () => {
      const maxFiguresParam = figureExtractTool.parameters.find(
        (p) => p.name === 'maxFigures'
      );
      expect(maxFiguresParam).toBeDefined();
      expect(maxFiguresParam?.required).toBe(false);
      expect(maxFiguresParam?.type).toBe('number');
    });

    it('should have optional page range parameters', () => {
      const startPageParam = figureExtractTool.parameters.find(
        (p) => p.name === 'startPage'
      );
      const endPageParam = figureExtractTool.parameters.find(
        (p) => p.name === 'endPage'
      );

      expect(startPageParam).toBeDefined();
      expect(startPageParam?.required).toBe(false);
      expect(endPageParam).toBeDefined();
      expect(endPageParam?.required).toBe(false);
    });
  });

  describe('prerequisite check', () => {
    it('should fail if no PDF is loaded', async () => {
      process.env.FIGURE_EXTRACT_SERVICE_URL = 'http://localhost:8000';

      const context = createContextWithoutPdf();
      const result = await figureExtractTool.execute({}, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No PDF loaded');
      expect(result.error).toContain('pdf_fetch');
    });
  });

  describe('service configuration', () => {
    it('should use spawn() when service URL is not configured', async () => {
      delete process.env.FIGURE_EXTRACT_SERVICE_URL;

      const context = createContextWithPdf();
      // When no URL is set, it uses spawn() which will fail due to missing Python/script
      // but doesn't complain about missing config
      const result = await figureExtractTool.execute({}, context);

      // spawn() will either succeed or fail with Python-related error, not config error
      if (!result.success) {
        expect(result.error).not.toContain('not configured');
        expect(result.error).not.toContain('FIGURE_EXTRACT_SERVICE_URL');
      }
    });
  });

  describe('service communication', () => {
    beforeEach(() => {
      process.env.FIGURE_EXTRACT_SERVICE_URL = 'http://localhost:8000';
    });

    it('should call service with correct parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, figures: mockFigures }),
      });

      const context = createContextWithPdf();
      await figureExtractTool.execute(
        { maxFigures: 5, startPage: 1, endPage: 3 },
        context
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/extract-figures',
        expect.objectContaining({
          method: 'POST',
        })
      );

      // Check FormData contents
      const callArgs = mockFetch.mock.calls[0];
      const formData = callArgs[1].body as FormData;
      expect(formData).toBeDefined();
    });

    it('should handle successful extraction', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, figures: mockFigures }),
      });

      const context = createContextWithPdf();
      const result = await figureExtractTool.execute({ maxFigures: 10 }, context);

      expect(result.success).toBe(true);
      expect((result.data as { figureCount: number }).figureCount).toBe(2);
      expect((result.data as { figures: ExtractedFigure[] }).figures).toHaveLength(2);
      expect((result.data as { figures: ExtractedFigure[] }).figures[0].page).toBe(1);
    });

    it('should handle HTTP errors from service', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal server error'),
      });

      const context = createContextWithPdf();
      const result = await figureExtractTool.execute({}, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('500');
    });

    it('should handle service error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: false,
            figures: [],
            error: 'PDF parsing failed',
          }),
      });

      const context = createContextWithPdf();
      const result = await figureExtractTool.execute({}, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('PDF parsing failed');
    });

    it('should handle connection errors', async () => {
      const connectionError = new Error('fetch failed: ECONNREFUSED');
      mockFetch.mockRejectedValueOnce(connectionError);

      const context = createContextWithPdf();
      const result = await figureExtractTool.execute({}, context);

      expect(result.success).toBe(false);
      // Error message contains the original error (connection refused)
      expect(result.error).toContain('ECONNREFUSED');
    });

    it('should handle empty figure results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, figures: [] }),
      });

      const context = createContextWithPdf();
      const result = await figureExtractTool.execute({}, context);

      expect(result.success).toBe(true);
      expect((result.data as { figureCount: number }).figureCount).toBe(0);
      expect((result.data as { figures: ExtractedFigure[] }).figures).toHaveLength(0);
    });
  });

  describe('result formatting', () => {
    beforeEach(() => {
      process.env.FIGURE_EXTRACT_SERVICE_URL = 'http://localhost:8000';
    });

    it('should add index to each figure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, figures: mockFigures }),
      });

      const context = createContextWithPdf();
      const result = await figureExtractTool.execute({}, context);

      expect(result.success).toBe(true);
      const figures = (result.data as { figures: Array<{ index: number }> }).figures;
      expect(figures[0].index).toBe(1);
      expect(figures[1].index).toBe(2);
    });

    it('should include message about extraction method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, figures: mockFigures }),
      });

      const context = createContextWithPdf();
      const result = await figureExtractTool.execute({}, context);

      expect(result.success).toBe(true);
      expect((result.data as { message: string }).message).toContain('vector clustering');
    });

    it('should preserve figure metadata', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, figures: mockFigures }),
      });

      const context = createContextWithPdf();
      const result = await figureExtractTool.execute({}, context);

      expect(result.success).toBe(true);
      const figures = (result.data as { figures: ExtractedFigure[] }).figures;

      // Check first figure
      expect(figures[0].dimensions.width).toBe(600);
      expect(figures[0].bounds?.x0).toBe(50);

      // Check second figure with caption hint
      expect(figures[1].captionHint).toBe('Figure');
    });
  });
});
