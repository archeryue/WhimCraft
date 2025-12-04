#!/usr/bin/env npx tsx
/**
 * Test script for PaperReaderSkill
 *
 * Usage:
 *   export FIGURE_EXTRACT_SERVICE_URL=http://localhost:8000
 *   npx tsx src/lib/skills/test-paper-reader.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { paperReaderSkill } from './paper-reader-skill';
import { ToolContext } from '@/types/agent';

const CLIP_PDF_URL = 'https://arxiv.org/pdf/2103.00020.pdf';

// Find Windows Downloads directory
function findWindowsDownloads(): string | null {
  const windowsUsers = '/mnt/c/Users';
  if (!fs.existsSync(windowsUsers)) {
    return null;
  }

  const skipDirs = ['Default', 'Default User', 'Public', 'All Users'];
  for (const user of fs.readdirSync(windowsUsers)) {
    if (skipDirs.includes(user)) continue;
    const downloads = path.join(windowsUsers, user, 'Downloads');
    try {
      if (fs.existsSync(downloads) && fs.statSync(downloads).isDirectory()) {
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
  console.log('=== PaperReaderSkill Test ===\n');

  // Check environment
  const serviceUrl = process.env.FIGURE_EXTRACT_SERVICE_URL;
  if (!serviceUrl) {
    console.error('Error: FIGURE_EXTRACT_SERVICE_URL not set');
    console.log('Start the figure extraction service first:');
    console.log('  cd services/pdf-figures');
    console.log('  source venv/bin/activate');
    console.log('  python3 main.py');
    console.log('\nThen set:');
    console.log('  export FIGURE_EXTRACT_SERVICE_URL=http://localhost:8000');
    process.exit(1);
  }

  // Create test context
  const context: ToolContext = {
    conversationId: 'skill-test',
    userId: 'test-user',
    requestId: 'test-' + Date.now(),
  };

  // Test query
  const query = 'What is the main contribution of CLIP and how does it achieve zero-shot transfer?';

  console.log(`Query: ${query}`);
  console.log(`URL: ${CLIP_PDF_URL}\n`);

  // Execute skill
  console.log('Executing PaperReaderSkill...\n');
  const startTime = Date.now();

  const result = await paperReaderSkill.execute(
    {
      query,
      params: { url: CLIP_PDF_URL },
    },
    context
  );

  const duration = Date.now() - startTime;

  console.log('\n=== Results ===\n');
  console.log(`Success: ${result.success}`);
  console.log(`Duration: ${(duration / 1000).toFixed(1)}s`);

  if (!result.success) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }

  // Print summary
  console.log(`\nSummary:\n${result.summary}\n`);

  // Print sections
  if (result.sections?.length) {
    console.log('Sections:');
    for (const section of result.sections) {
      console.log(`  - ${section.title}`);
    }
  }

  // Print figures info
  if (result.figures?.length) {
    console.log(`\nKey Figures (${result.figures.length}):`);
    for (const fig of result.figures) {
      console.log(`  - ${fig.id} (page ${fig.page}): ${fig.type || 'unknown'}`);
      console.log(`    Importance: ${fig.importance}/100`);
      console.log(`    Reason: ${fig.importanceReason || 'N/A'}`);
      console.log(`    Caption: ${fig.caption?.substring(0, 100) || 'N/A'}...`);
    }

    // Save figures to Downloads
    const downloadsDir = findWindowsDownloads();
    if (downloadsDir) {
      const outputDir = path.join(downloadsDir, 'clip_skill_figures');
      fs.mkdirSync(outputDir, { recursive: true });

      for (const fig of result.figures) {
        const filename = `${fig.id}_page${fig.page}_importance${fig.importance}.png`;
        const filepath = path.join(outputDir, filename);
        const imgBuffer = Buffer.from(fig.imageBase64, 'base64');
        fs.writeFileSync(filepath, imgBuffer);
        console.log(`\nSaved: ${filename}`);
      }
      console.log(`\nFigures saved to: ${outputDir}`);
    }
  } else {
    console.log('\nNo key figures selected');
  }

  // Print metadata
  if (result.metadata) {
    console.log(`\nMetadata:`);
    console.log(`  Duration: ${result.metadata.durationMs}ms`);
    console.log(`  Tools: ${result.metadata.toolsInvoked?.join(', ')}`);
  }

  console.log('\n=== Test Complete ===');
}

main().catch(console.error);
