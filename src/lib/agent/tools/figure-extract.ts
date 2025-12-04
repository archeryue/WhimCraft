/**
 * Figure Extract Tool
 *
 * Extracts figures and images from PDF documents using PyMuPDF (fitz).
 * Calls a Python service for the actual extraction, as PyMuPDF is a Python library.
 *
 * The Python service uses:
 * - cluster_drawings() for automatic vector figure detection
 * - Caption search as fallback for figure location
 * - High-resolution rendering (3x zoom for crisp output)
 */

import { ToolParameter, ToolResult } from '@/types/agent';
import { BaseTool, successResult, errorResult } from './base';
import { PdfToolContext } from './pdf-fetch';

// Default max figures to extract
const DEFAULT_MAX_FIGURES = 10;

/**
 * Get figure service URL at runtime (allows for testing with env var changes)
 */
function getFigureServiceUrl(): string | undefined {
  return process.env.FIGURE_EXTRACT_SERVICE_URL;
}

// Figure extraction result type
export interface ExtractedFigure {
  page: number;
  imageBase64: string;
  dimensions: {
    width: number;
    height: number;
  };
  bounds?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  captionHint?: string;
}

export class FigureExtractTool extends BaseTool {
  name = 'figure_extract';

  description = `Extract figures, charts, and diagrams from a PDF document.
Uses vector clustering to detect figure areas and renders them as high-resolution images.
Requires pdf_fetch to be called first. Returns base64-encoded PNG images.`;

  parameters: ToolParameter[] = [
    {
      name: 'maxFigures',
      type: 'number',
      description: 'Maximum number of figures to extract (default: 10)',
      required: false,
      default: DEFAULT_MAX_FIGURES,
    },
    {
      name: 'startPage',
      type: 'number',
      description: 'Starting page to extract from (1-indexed)',
      required: false,
    },
    {
      name: 'endPage',
      type: 'number',
      description: 'Ending page to extract from (inclusive)',
      required: false,
    },
  ];

  protected async run(params: Record<string, unknown>): Promise<ToolResult> {
    const maxFigures = (params.maxFigures as number) || DEFAULT_MAX_FIGURES;
    const startPage = params.startPage as number | undefined;
    const endPage = params.endPage as number | undefined;

    // Get PDF buffer from context
    const extendedContext = this.context as PdfToolContext;
    const pdfBuffer = extendedContext.pdfBuffer;

    if (!pdfBuffer) {
      return errorResult('No PDF loaded. Use pdf_fetch first to load a PDF document.');
    }

    // Check if service URL is configured
    const serviceUrl = getFigureServiceUrl();
    if (!serviceUrl) {
      return errorResult(
        'Figure extraction service not configured. ' +
        'Set FIGURE_EXTRACT_SERVICE_URL environment variable to enable figure extraction.'
      );
    }

    try {
      // Prepare form data for the service
      const formData = new FormData();
      formData.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), 'document.pdf');
      formData.append('max_figures', String(maxFigures));
      if (startPage !== undefined) {
        formData.append('start_page', String(startPage));
      }
      if (endPage !== undefined) {
        formData.append('end_page', String(endPage));
      }

      // Call the Python service
      const response = await fetch(`${serviceUrl}/extract-figures`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return errorResult(`Figure extraction service error: ${response.status} - ${errorText}`);
      }

      const result = await response.json() as {
        success: boolean;
        figures: ExtractedFigure[];
        error?: string;
      };

      if (!result.success) {
        return errorResult(result.error || 'Figure extraction failed');
      }

      const figures = result.figures || [];

      return successResult({
        figures: figures.map((fig, index) => ({
          index: index + 1,
          page: fig.page,
          imageBase64: fig.imageBase64,
          dimensions: fig.dimensions,
          bounds: fig.bounds,
          captionHint: fig.captionHint,
        })),
        figureCount: figures.length,
        message: `Extracted ${figures.length} figure(s) using vector clustering`,
      });
    } catch (error) {
      if (error instanceof Error) {
        // Check for connection errors
        if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
          return errorResult(
            'Figure extraction service is not available. ' +
            'Ensure the PyMuPDF service is running at ' + serviceUrl
          );
        }
        return errorResult(`Figure extraction failed: ${error.message}`);
      }
      return errorResult('Unknown error during figure extraction');
    }
  }
}

// Export singleton instance
export const figureExtractTool = new FigureExtractTool();
