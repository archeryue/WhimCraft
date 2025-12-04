/**
 * PDF Tools E2E Test Suite
 *
 * Tests the Paper Reader feature with real arXiv papers.
 * Uses CLIP paper (https://arxiv.org/abs/2103.00020) as the primary test case.
 */

import { test, expect, Page } from '@playwright/test';

// CLIP paper - "Learning Transferable Visual Models From Natural Language Supervision"
const CLIP_PAPER_URL = 'https://arxiv.org/abs/2103.00020';

// Helper to set up authenticated session
async function setupAuthenticatedSession(page: Page) {
  await page.goto('/chat');
  await page.waitForLoadState('networkidle');
}

test.describe('Paper Reader - CLIP Paper Analysis', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
  });

  test('should complete full CLIP paper analysis and verify output quality', async ({ page }) => {
    test.setTimeout(180000); // 3 minutes max

    // Navigate to Paper Reader page
    await page.goto('/paper');
    await page.waitForLoadState('networkidle');

    // Enter CLIP paper URL
    const input = page.locator('input[placeholder*="arxiv"]');
    await input.fill(CLIP_PAPER_URL);

    // Click analyze button
    const analyzeButton = page.locator('button:has-text("Analyze")');
    await analyzeButton.click();

    // Wait for analysis to complete
    await expect(page.locator('[data-testid="paper-analysis"]')).toBeVisible({
      timeout: 120000,
    });

    // Get the analysis content
    const analysisContent = await page.textContent('[data-testid="paper-analysis"]');

    // Verify analysis quality - should contain key CLIP concepts
    const content = analysisContent?.toLowerCase() || '';

    // CLIP paper is about contrastive learning between images and text
    const hasContrastive = content.includes('contrastive');
    const hasImage = content.includes('image');
    const hasText = content.includes('text') || content.includes('language');
    const hasVisual = content.includes('visual');

    // Should mention at least 2 of these key concepts
    const conceptCount = [hasContrastive, hasImage, hasText, hasVisual].filter(Boolean).length;
    expect(conceptCount).toBeGreaterThanOrEqual(2);

    // Verify structure - should have summary and key sections
    await expect(page.locator('text=Summary')).toBeVisible();
  });

  test('should fetch and parse CLIP paper PDF', async ({ page }) => {
    test.setTimeout(60000);

    const response = await page.evaluate(async (url) => {
      const res = await fetch('/api/paper/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const reader = res.body?.getReader();
      if (!reader) return { error: 'No reader' };

      const decoder = new TextDecoder();
      let buffer = '';
      let stages: string[] = [];
      let pageCount = 0;
      let textLength = 0;

      // Read SSE stream
      for (let i = 0; i < 50; i++) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.stage && !stages.includes(data.stage)) {
                stages.push(data.stage);
              }
              if (data.stage === 'parsing' && data.message) {
                const match = data.message.match(/(\d+) pages/);
                if (match) pageCount = parseInt(match[1], 10);
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }

        // Stop when we see parsing complete
        if (stages.includes('analyzing')) break;
      }

      reader.cancel();
      return { stages, pageCount };
    }, CLIP_PAPER_URL);

    // Verify pipeline stages
    expect(response.stages).toContain('validating');
    expect(response.stages).toContain('fetching');
    expect(response.stages).toContain('parsing');

    // CLIP paper has 48 pages
    expect(response.pageCount).toBeGreaterThan(40);
  });
});

test.describe('Paper Reader - Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
  });

  test('should reject invalid URL', async ({ page }) => {
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/paper/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'not-a-valid-url' }),
      });

      const reader = res.body?.getReader();
      if (!reader) return { error: 'No reader' };

      const decoder = new TextDecoder();
      const { value } = await reader.read();
      const text = decoder.decode(value);
      reader.cancel();

      return { hasError: text.includes('"stage":"error"') };
    });

    expect(response.hasError).toBe(true);
  });

  test('should reject non-arXiv URLs', async ({ page }) => {
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/paper/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/paper.pdf' }),
      });

      const reader = res.body?.getReader();
      if (!reader) return { error: 'No reader' };

      const decoder = new TextDecoder();
      let buffer = '';

      for (let i = 0; i < 5; i++) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.includes('"stage":"error"')) break;
      }

      reader.cancel();
      return { hasError: buffer.includes('"stage":"error"') || buffer.includes('Unsupported') };
    });

    expect(response.hasError).toBe(true);
  });

  test('should handle non-existent paper', async ({ page }) => {
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/paper/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://arxiv.org/abs/9999.99999' }),
      });

      const reader = res.body?.getReader();
      if (!reader) return { error: 'No reader' };

      const decoder = new TextDecoder();
      let buffer = '';

      for (let i = 0; i < 10; i++) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.includes('"stage":"error"')) break;
      }

      reader.cancel();
      return { hasError: buffer.includes('"stage":"error"') };
    });

    expect(response.hasError).toBe(true);
  });

  test('should require authentication', async ({ page, context }) => {
    await context.clearCookies();

    const response = await page.evaluate(async () => {
      const res = await fetch('/api/paper/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://arxiv.org/abs/2103.00020' }),
      });
      return { status: res.status };
    });

    expect(response.status).toBe(401);
  });
});

test.describe('Paper Reader - API', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
  });

  test('paper analyzer API endpoint exists', async ({ page }) => {
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/paper/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      return { status: res.status };
    });

    // Should not be 404
    expect(response.status).not.toBe(404);
  });

  test('paper reader page is accessible', async ({ page }) => {
    await page.goto('/paper');
    await page.waitForLoadState('networkidle');

    const input = page.locator('input[placeholder*="arxiv"], input[type="url"], input[type="text"]');
    await expect(input.first()).toBeVisible({ timeout: 5000 });
  });
});
