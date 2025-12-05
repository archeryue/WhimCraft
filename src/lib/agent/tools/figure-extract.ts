/**
 * Figure Extract Tool
 *
 * Extracts figures and images from PDF documents using PyMuPDF (fitz).
 * Uses spawn() to call Python script directly (preferred for deployment),
 * with HTTP fallback for local development.
 *
 * The Python script uses:
 * - cluster_drawings() for automatic vector figure detection
 * - Caption search as fallback for figure location
 * - High-resolution rendering (3x zoom for crisp output)
 */

import { spawn } from 'child_process';
import path from 'path';
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

/**
 * Get path to Python script
 */
function getPythonScriptPath(): string {
  // In production (Cloud Run), the script is at /app/services/pdf-figures/main.py
  // In development, it's relative to project root
  const prodPath = '/app/services/pdf-figures/main.py';
  const devPath = path.join(process.cwd(), 'services/pdf-figures/main.py');

  // Check if running in production container
  if (process.env.NODE_ENV === 'production') {
    return prodPath;
  }
  return devPath;
}

/**
 * Get Python executable - use venv in development, system python in production
 */
function getPythonExecutable(): string {
  // In production (Cloud Run), use system python3
  if (process.env.NODE_ENV === 'production') {
    return 'python3';
  }

  // In development, use venv if available
  const venvPython = path.join(process.cwd(), 'services/pdf-figures/venv/bin/python3');
  return venvPython;
}

/**
 * Extract figures using spawn() - preferred method
 */
async function extractViaSpawn(
  pdfBuffer: ArrayBuffer,
  maxFigures: number,
  startPage?: number,
  endPage?: number,
  verifyWithLlm?: boolean
): Promise<{ success: boolean; figures: ExtractedFigure[]; error?: string }> {
  return new Promise((resolve) => {
    const scriptPath = getPythonScriptPath();
    const pythonExe = getPythonExecutable();
    const args = ['--cli', '--max-figures', String(maxFigures)];

    if (startPage !== undefined) {
      args.push('--start-page', String(startPage));
    }
    if (endPage !== undefined) {
      args.push('--end-page', String(endPage));
    }
    if (verifyWithLlm) {
      args.push('--verify-with-llm');
    }

    const child = spawn(pythonExe, [scriptPath, ...args]);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      resolve({
        success: false,
        figures: [],
        error: `Failed to spawn Python process: ${err.message}`,
      });
    });

    child.on('close', (code) => {
      if (code !== 0 && !stdout) {
        resolve({
          success: false,
          figures: [],
          error: stderr || `Python process exited with code ${code}`,
        });
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch {
        resolve({
          success: false,
          figures: [],
          error: `Failed to parse Python output: ${stdout.slice(0, 200)}`,
        });
      }
    });

    // Write PDF to stdin (convert ArrayBuffer to Buffer)
    child.stdin.write(Buffer.from(pdfBuffer));
    child.stdin.end();
  });
}

/**
 * Extract figures using HTTP - fallback method
 */
async function extractViaHttp(
  serviceUrl: string,
  pdfBuffer: ArrayBuffer,
  maxFigures: number,
  startPage?: number,
  endPage?: number,
  verifyWithLlm?: boolean
): Promise<{ success: boolean; figures: ExtractedFigure[]; error?: string }> {
  const formData = new FormData();
  formData.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), 'document.pdf');
  formData.append('max_figures', String(maxFigures));
  if (startPage !== undefined) {
    formData.append('start_page', String(startPage));
  }
  if (endPage !== undefined) {
    formData.append('end_page', String(endPage));
  }
  if (verifyWithLlm) {
    formData.append('verify_with_llm', 'true');
  }

  const response = await fetch(`${serviceUrl}/extract-figures`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      success: false,
      figures: [],
      error: `HTTP ${response.status}: ${errorText}`,
    };
  }

  return response.json();
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
    {
      name: 'verifyWithLlm',
      type: 'boolean',
      description: 'Use LLM vision to verify and filter out text blocks (requires GOOGLE_API_KEY)',
      required: false,
      default: false,
    },
  ];

  protected async run(params: Record<string, unknown>): Promise<ToolResult> {
    const maxFigures = (params.maxFigures as number) || DEFAULT_MAX_FIGURES;
    const startPage = params.startPage as number | undefined;
    const endPage = params.endPage as number | undefined;
    const verifyWithLlm = (params.verifyWithLlm as boolean) || false;

    // Get PDF buffer from context
    const extendedContext = this.context as PdfToolContext;
    const pdfBuffer = extendedContext.pdfBuffer;

    if (!pdfBuffer) {
      return errorResult('No PDF loaded. Use pdf_fetch first to load a PDF document.');
    }

    try {
      let result: { success: boolean; figures: ExtractedFigure[]; error?: string };

      // Try spawn() first (preferred for production deployment)
      const serviceUrl = getFigureServiceUrl();

      if (serviceUrl) {
        // Use HTTP if service URL is explicitly configured (for backwards compatibility)
        result = await extractViaHttp(
          serviceUrl,
          pdfBuffer,
          maxFigures,
          startPage,
          endPage,
          verifyWithLlm
        );
      } else {
        // Use spawn() - preferred method for deployment
        result = await extractViaSpawn(
          pdfBuffer,
          maxFigures,
          startPage,
          endPage,
          verifyWithLlm
        );
      }

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
        return errorResult(`Figure extraction failed: ${error.message}`);
      }
      return errorResult('Unknown error during figure extraction');
    }
  }
}

// Export singleton instance
export const figureExtractTool = new FigureExtractTool();
