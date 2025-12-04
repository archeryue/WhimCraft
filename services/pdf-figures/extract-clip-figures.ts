#!/usr/bin/env npx tsx
/**
 * Script to extract figures from CLIP paper using the agent tools
 *
 * Usage:
 *   export FIGURE_EXTRACT_SERVICE_URL=http://localhost:8000
 *   npx tsx services/pdf-figures/extract-clip-figures.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { PdfFetchTool, PdfToolContext } from '../../src/lib/agent/tools/pdf-fetch';
import { FigureExtractTool } from '../../src/lib/agent/tools/figure-extract';

const CLIP_PDF_URL = 'https://arxiv.org/pdf/2103.00020.pdf';

// Find Windows Downloads directory
function findWindowsDownloads(): string | null {
  const windowsUsers = '/mnt/c/Users';
  if (!fs.existsSync(windowsUsers)) {
    return null;
  }

  // Skip system directories
  const skipDirs = ['Default', 'Default User', 'Public', 'All Users'];

  for (const user of fs.readdirSync(windowsUsers)) {
    if (skipDirs.includes(user)) continue;

    const downloads = path.join(windowsUsers, user, 'Downloads');
    try {
      // Check if it's a real user directory with writable Downloads
      if (fs.existsSync(downloads) && fs.statSync(downloads).isDirectory()) {
        // Try to access it
        fs.accessSync(downloads, fs.constants.W_OK);
        return downloads;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function main() {
  console.log('=== CLIP Paper Figure Extraction ===\n');

  // Check environment
  const serviceUrl = process.env.FIGURE_EXTRACT_SERVICE_URL;
  if (!serviceUrl) {
    console.error('Error: FIGURE_EXTRACT_SERVICE_URL not set');
    console.log('Start the service first:');
    console.log('  cd services/pdf-figures');
    console.log('  source venv/bin/activate');
    console.log('  uvicorn main:app --port 8000');
    console.log('\nThen set:');
    console.log('  export FIGURE_EXTRACT_SERVICE_URL=http://localhost:8000');
    process.exit(1);
  }

  // Create shared context - this will be passed to both tools
  // and the pdfBuffer will be stored here by pdf_fetch for figure_extract to use
  const context: PdfToolContext = {
    conversationId: 'figure-extract-test',
    userId: 'script-user',
    requestId: 'extract-' + Date.now(),
  };

  // Step 1: Fetch PDF using pdf_fetch tool
  console.log('Step 1: Fetching CLIP paper PDF...');
  const pdfFetchTool = new PdfFetchTool();

  // Pass context as second argument to execute()
  const fetchResult = await pdfFetchTool.execute({ url: CLIP_PDF_URL }, context);

  if (!fetchResult.success) {
    console.error('Failed to fetch PDF:', fetchResult.error);
    process.exit(1);
  }

  const fetchData = fetchResult.data as { message: string; url: string };
  console.log(`  ✓ ${fetchData.message}`);
  console.log(`  URL: ${fetchData.url}\n`);

  // Step 2: Extract figures using figure_extract tool
  // The context now has pdfBuffer set by the previous tool
  // Note: verifyWithLlm=false by default - agent-brain will judge figure importance
  console.log('Step 2: Extracting figures...');
  const figureExtractTool = new FigureExtractTool();

  const extractResult = await figureExtractTool.execute({ maxFigures: 10 }, context);

  if (!extractResult.success) {
    console.error('Failed to extract figures:', extractResult.error);
    process.exit(1);
  }

  const extractData = extractResult.data as {
    figures: Array<{
      index: number;
      page: number;
      imageBase64: string;
      dimensions: { width: number; height: number };
    }>;
    figureCount: number;
    message: string;
  };

  console.log(`  ✓ ${extractData.message}\n`);

  // Step 3: Save to Windows Downloads
  console.log('Step 3: Saving figures to Windows Downloads...');
  const downloadsDir = findWindowsDownloads();

  if (!downloadsDir) {
    console.error('Could not find Windows Downloads directory');
    process.exit(1);
  }

  const outputDir = path.join(downloadsDir, 'clip_figures_v3');
  fs.mkdirSync(outputDir, { recursive: true });

  for (const fig of extractData.figures) {
    const filename = `clip_figure_${fig.index}_page${fig.page}.png`;
    const filepath = path.join(outputDir, filename);

    const imgBuffer = Buffer.from(fig.imageBase64, 'base64');
    fs.writeFileSync(filepath, imgBuffer);

    console.log(`  ✓ ${filename} (${fig.dimensions.width}x${fig.dimensions.height})`);
  }

  console.log(`\n=== Complete ===`);
  console.log(`Saved ${extractData.figures.length} figures to: ${outputDir}`);
}

main().catch(console.error);
