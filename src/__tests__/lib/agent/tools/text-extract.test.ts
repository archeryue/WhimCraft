/**
 * Tests for Text Extract Tool
 */

import { textExtractTool } from '@/lib/agent/tools/text-extract';
import { PdfToolContext } from '@/lib/agent/tools/pdf-fetch';

// Mock unpdf module
jest.mock('unpdf', () => ({
  getDocumentProxy: jest.fn(),
  extractText: jest.fn(),
  getMeta: jest.fn(),
}));

import { getDocumentProxy, extractText, getMeta } from 'unpdf';

const mockGetDocumentProxy = getDocumentProxy as jest.Mock;
const mockExtractText = extractText as jest.Mock;
const mockGetMeta = getMeta as jest.Mock;

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

describe('TextExtractTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parameter validation', () => {
    it('should have correct name and description', () => {
      expect(textExtractTool.name).toBe('text_extract');
      expect(textExtractTool.description).toContain('Extract text');
    });

    it('should have optional target parameter with enum values', () => {
      const targetParam = textExtractTool.parameters.find((p) => p.name === 'target');
      expect(targetParam).toBeDefined();
      expect(targetParam?.required).toBe(false);
      expect(targetParam?.enum).toContain('full');
      expect(targetParam?.enum).toContain('pages');
      expect(targetParam?.enum).toContain('section');
    });

    it('should have optional section parameter', () => {
      const sectionParam = textExtractTool.parameters.find((p) => p.name === 'section');
      expect(sectionParam).toBeDefined();
      expect(sectionParam?.required).toBe(false);
      expect(sectionParam?.type).toBe('string');
    });
  });

  describe('prerequisite check', () => {
    it('should fail if no PDF is loaded', async () => {
      const context = createContextWithoutPdf();
      const result = await textExtractTool.execute({}, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No PDF loaded');
      expect(result.error).toContain('pdf_fetch');
    });
  });

  describe('full text extraction', () => {
    it('should extract full text by default', async () => {
      const mockPdf = { numPages: 10 };
      const mockText = 'This is the full text of the document.';

      mockGetDocumentProxy.mockResolvedValueOnce(mockPdf);
      mockExtractText.mockResolvedValueOnce({
        text: mockText,
        totalPages: 10,
      });
      mockGetMeta.mockResolvedValueOnce({
        info: {
          Title: 'Test Paper',
          Author: 'Test Author',
        },
      });

      const context = createContextWithPdf();
      const result = await textExtractTool.execute({}, context);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('text', mockText);
      expect(result.data).toHaveProperty('pageCount', 10);
      expect(result.data).toHaveProperty('metadata');
      expect((result.data as { metadata: { title: string } }).metadata.title).toBe('Test Paper');
    });

    it('should handle array text from extractText', async () => {
      const mockPdf = { numPages: 5 };
      const mockTextArray = ['Page 1 content', 'Page 2 content', 'Page 3 content'];

      mockGetDocumentProxy.mockResolvedValueOnce(mockPdf);
      mockExtractText.mockResolvedValueOnce({
        text: mockTextArray,
        totalPages: 5,
      });
      mockGetMeta.mockResolvedValueOnce({ info: {} });

      const context = createContextWithPdf();
      const result = await textExtractTool.execute({ target: 'full' }, context);

      expect(result.success).toBe(true);
      expect((result.data as { text: string }).text).toContain('Page 1 content');
      expect((result.data as { text: string }).text).toContain('Page 2 content');
    });

    it('should clean extracted text', async () => {
      const mockPdf = { numPages: 1 };
      // Text with issues that should be cleaned
      const messyText = 'Hello\r\n\r\n\r\n\r\nWorld   \nTest-\ning';

      mockGetDocumentProxy.mockResolvedValueOnce(mockPdf);
      mockExtractText.mockResolvedValueOnce({
        text: messyText,
        totalPages: 1,
      });
      mockGetMeta.mockResolvedValueOnce({ info: {} });

      const context = createContextWithPdf();
      const result = await textExtractTool.execute({}, context);

      expect(result.success).toBe(true);
      const text = (result.data as { text: string }).text;
      // Should have normalized line endings and fixed hyphenation
      expect(text).not.toContain('\r\n');
      expect(text).not.toMatch(/\n{3,}/); // No more than 2 newlines
      expect(text).toContain('Testing'); // Hyphenated word should be joined
    });
  });

  describe('section extraction', () => {
    it('should extract abstract section', async () => {
      const mockPdf = { numPages: 10 };
      const mockText = `
Title of the Paper

Abstract
This is the abstract of the paper. It summarizes the key findings.

1. Introduction
This is the introduction section.
`;

      mockGetDocumentProxy.mockResolvedValueOnce(mockPdf);
      mockExtractText.mockResolvedValueOnce({
        text: mockText,
        totalPages: 10,
      });
      mockGetMeta.mockResolvedValueOnce({ info: {} });

      const context = createContextWithPdf();
      const result = await textExtractTool.execute(
        { target: 'section', section: 'abstract' },
        context
      );

      expect(result.success).toBe(true);
      const text = (result.data as { text: string }).text;
      expect(text).toContain('abstract of the paper');
      expect(text).not.toContain('Introduction');
    });

    it('should extract conclusion section', async () => {
      const mockPdf = { numPages: 10 };
      const mockText = `
5. Results
The results show significant improvement.

6. Conclusion
We have presented a novel approach. Future work includes...

References
[1] Some reference
`;

      mockGetDocumentProxy.mockResolvedValueOnce(mockPdf);
      mockExtractText.mockResolvedValueOnce({
        text: mockText,
        totalPages: 10,
      });
      mockGetMeta.mockResolvedValueOnce({ info: {} });

      const context = createContextWithPdf();
      const result = await textExtractTool.execute(
        { target: 'section', section: 'conclusion' },
        context
      );

      expect(result.success).toBe(true);
      const text = (result.data as { text: string }).text;
      expect(text).toContain('novel approach');
      expect(text).not.toContain('Results');
    });

    it('should fail gracefully for non-existent section', async () => {
      const mockPdf = { numPages: 10 };
      const mockText = 'Just some random text without clear sections.';

      mockGetDocumentProxy.mockResolvedValueOnce(mockPdf);
      mockExtractText.mockResolvedValueOnce({
        text: mockText,
        totalPages: 10,
      });
      mockGetMeta.mockResolvedValueOnce({ info: {} });

      const context = createContextWithPdf();
      const result = await textExtractTool.execute(
        { target: 'section', section: 'methodology' },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Could not find section');
    });
  });

  describe('page extraction', () => {
    it('should validate page range', async () => {
      const mockPdf = { numPages: 5 };
      const mockText = 'Full text content';

      mockGetDocumentProxy.mockResolvedValueOnce(mockPdf);
      mockExtractText.mockResolvedValueOnce({
        text: mockText,
        totalPages: 5,
      });
      mockGetMeta.mockResolvedValueOnce({ info: {} });

      const context = createContextWithPdf();
      const result = await textExtractTool.execute(
        { target: 'pages', startPage: 100 },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds document length');
    });

    it('should accept valid page range', async () => {
      const mockPdf = { numPages: 10 };
      const mockText = 'Page content';

      mockGetDocumentProxy.mockResolvedValueOnce(mockPdf);
      mockExtractText.mockResolvedValueOnce({
        text: mockText,
        totalPages: 10,
      });
      mockGetMeta.mockResolvedValueOnce({ info: {} });

      const context = createContextWithPdf();
      const result = await textExtractTool.execute(
        { target: 'pages', startPage: 1, endPage: 3 },
        context
      );

      expect(result.success).toBe(true);
      expect((result.data as { extraction: { requestedPages: { start: number } } }).extraction.requestedPages.start).toBe(1);
    });
  });

  describe('metadata extraction', () => {
    it('should include PDF metadata in result', async () => {
      const mockPdf = { numPages: 10 };

      mockGetDocumentProxy.mockResolvedValueOnce(mockPdf);
      mockExtractText.mockResolvedValueOnce({
        text: 'Content',
        totalPages: 10,
      });
      mockGetMeta.mockResolvedValueOnce({
        info: {
          Title: 'Attention Is All You Need',
          Author: 'Vaswani et al.',
          CreationDate: '2017-06-12',
        },
      });

      const context = createContextWithPdf();
      const result = await textExtractTool.execute({}, context);

      expect(result.success).toBe(true);
      const metadata = (result.data as { metadata: { title: string; author: string } }).metadata;
      expect(metadata.title).toBe('Attention Is All You Need');
      expect(metadata.author).toBe('Vaswani et al.');
    });

    it('should handle missing metadata gracefully', async () => {
      const mockPdf = { numPages: 5 };

      mockGetDocumentProxy.mockResolvedValueOnce(mockPdf);
      mockExtractText.mockResolvedValueOnce({
        text: 'Content',
        totalPages: 5,
      });
      mockGetMeta.mockResolvedValueOnce({ info: {} });

      const context = createContextWithPdf();
      const result = await textExtractTool.execute({}, context);

      expect(result.success).toBe(true);
      expect((result.data as { metadata: object }).metadata).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle unpdf errors', async () => {
      mockGetDocumentProxy.mockRejectedValueOnce(new Error('PDF parsing failed'));

      const context = createContextWithPdf();
      const result = await textExtractTool.execute({}, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('PDF parsing failed');
    });

    it('should include token estimate in result', async () => {
      const mockPdf = { numPages: 10 };
      const mockText = 'This is a sample text with about 40 characters.';

      mockGetDocumentProxy.mockResolvedValueOnce(mockPdf);
      mockExtractText.mockResolvedValueOnce({
        text: mockText,
        totalPages: 10,
      });
      mockGetMeta.mockResolvedValueOnce({ info: {} });

      const context = createContextWithPdf();
      const result = await textExtractTool.execute({}, context);

      expect(result.success).toBe(true);
      expect((result.data as { estimatedTokens: number }).estimatedTokens).toBeGreaterThan(0);
    });
  });
});
