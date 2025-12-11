/**
 * Paper Reader E2E Test Suite
 *
 * Tests for the Paper Reader feature:
 * - Page load and navigation
 * - URL input validation
 * - Paper analysis flow with SSE progress
 * - Error handling
 * - Save as Whim functionality
 *
 * Note: Most tests use mocked API responses for speed.
 * The full integration test with real AI is marked @slow.
 */

import { test, expect, Page } from '@playwright/test';

// Test arXiv paper: A short paper for faster testing
const TEST_ARXIV_URL = 'https://arxiv.org/abs/1706.03762';

// Environment flag to skip slow tests
const SKIP_SLOW_TESTS = process.env.SKIP_SLOW_TESTS === 'true';

// Mock figure for testing (small 1x1 red pixel PNG in base64)
const MOCK_FIGURE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

// Mock analysis result for fast tests
const MOCK_ANALYSIS = {
  metadata: {
    title: 'Attention Is All You Need',
    authors: ['Ashish Vaswani', 'Noam Shazeer'],
    arxivId: '1706.03762',
    publishedDate: '2017-06-12',
    pdfUrl: 'https://arxiv.org/pdf/1706.03762.pdf',
    originalUrl: TEST_ARXIV_URL,
  },
  analysis: {
    summary: 'This paper introduces the Transformer architecture.',
    problemStatement: 'Sequential computation limits parallelization.',
    keyContributions: ['Self-attention mechanism', 'Multi-head attention'],
    methodology: 'Encoder-decoder with attention.',
    results: 'State-of-the-art on translation tasks.',
    limitations: 'High memory for long sequences.',
    futureWork: 'Apply to other domains.',
    keyTakeaways: ['Attention replaces recurrence', 'Better parallelization'],
  },
  figures: [
    {
      id: 'fig-1',
      page: 3,
      imageBase64: MOCK_FIGURE_BASE64,
      caption: 'The Transformer architecture',
      importance: 85,
      importanceReason: 'Core architecture diagram showing the model structure',
    },
    {
      id: 'fig-2',
      page: 5,
      imageBase64: MOCK_FIGURE_BASE64,
      caption: 'Multi-head attention mechanism',
      importance: 75,
      importanceReason: 'Illustrates the key innovation of multi-head attention',
    },
  ],
};

// Helper to create mock SSE response
function createMockSSEResponse() {
  const events = [
    { stage: 'validating', progress: 5, message: 'Validating paper URL...' },
    { stage: 'validating', progress: 10, message: 'Detected arxiv paper' },
    { stage: 'fetching', progress: 15, message: 'Downloading PDF...' },
    { stage: 'fetching', progress: 30, message: 'Downloaded 1024 KB' },
    { stage: 'parsing', progress: 35, message: 'Extracting text from PDF...' },
    { stage: 'parsing', progress: 45, message: 'Extracted 15 pages' },
    { stage: 'analyzing', progress: 50, message: 'Analyzing paper with AI...' },
    { stage: 'analyzing', progress: 85, message: 'AI is reading the paper...' },
    { stage: 'complete', progress: 100, message: 'Analysis complete.', result: MOCK_ANALYSIS },
  ];

  return events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('');
}

// Helper to set up mock API for fast tests
async function setupMockAnalysis(page: Page) {
  await page.route('**/api/paper/analyze', async (route) => {
    const body = createMockSSEResponse();
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
      body,
    });
  });
}

test.describe('Paper Reader - Page Load', () => {
  test('should load paper reader page', async ({ page }) => {
    await page.goto('/paper');
    await page.waitForLoadState('networkidle');

    // Verify page title/header
    await expect(page.locator('h1:has-text("Paper Reader")')).toBeVisible();

    // Verify Beta badge
    await expect(page.locator('text=Beta')).toBeVisible();

    // Verify input field is visible
    await expect(page.locator('input[placeholder*="arxiv"]')).toBeVisible();

    // Verify Analyze button is visible
    await expect(page.locator('button:has-text("Analyze")')).toBeVisible();
  });

  test('should have back navigation to chat', async ({ page }) => {
    await page.goto('/paper');
    await page.waitForLoadState('networkidle');

    // Find and click back arrow
    const backLink = page.locator('a[href="/chat"]');
    await expect(backLink).toBeVisible();
  });

  test('should redirect unauthenticated users to login', async ({ page, context }) => {
    // Clear all cookies to simulate unauthenticated state
    await context.clearCookies();

    await page.goto('/paper');

    // Should redirect to login page
    await page.waitForURL(/\/login/, { timeout: 10000 });
  });
});

test.describe('Paper Reader - URL Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/paper');
    await page.waitForLoadState('networkidle');
  });

  test('should show error for empty URL', async ({ page }) => {
    const analyzeButton = page.locator('button:has-text("Analyze")');

    // Button should be disabled when input is empty
    await expect(analyzeButton).toBeDisabled();
  });

  test('should show error for invalid URL format', async ({ page }) => {
    const input = page.locator('input[placeholder*="arxiv"]');
    await input.fill('not-a-valid-url');

    const analyzeButton = page.locator('button:has-text("Analyze")');
    await analyzeButton.click();

    // Should show error message
    await expect(page.locator('text=valid URL')).toBeVisible({ timeout: 5000 });
  });

  test('should show error for non-arXiv URLs', async ({ page }) => {
    const input = page.locator('input[placeholder*="arxiv"]');
    await input.fill('https://example.com/paper.pdf');

    const analyzeButton = page.locator('button:has-text("Analyze")');
    await analyzeButton.click();

    // Should show arXiv-only message
    await expect(page.locator('text=/arXiv.*supported/i')).toBeVisible({ timeout: 5000 });
  });

  test('should accept valid arXiv abs URL', async ({ page }) => {
    const input = page.locator('input[placeholder*="arxiv"]');
    await input.fill(TEST_ARXIV_URL);

    const analyzeButton = page.locator('button:has-text("Analyze")');

    // Button should be enabled
    await expect(analyzeButton).toBeEnabled();
  });

  test('should accept arXiv PDF URL', async ({ page }) => {
    const input = page.locator('input[placeholder*="arxiv"]');
    await input.fill('https://arxiv.org/pdf/1706.03762.pdf');

    const analyzeButton = page.locator('button:has-text("Analyze")');

    // Button should be enabled
    await expect(analyzeButton).toBeEnabled();
  });
});

test.describe('Paper Reader - Analysis Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/paper');
    await page.waitForLoadState('networkidle');
  });

  test('should show progress indicators when starting analysis', async ({ page }) => {
    // Don't use mock - we need real SSE streaming to see progress
    // But intercept to return fast error so we don't wait for full analysis
    await page.route('**/api/paper/analyze', async (route) => {
      // Simulate slow SSE with progress events
      const events = [
        { stage: 'validating', progress: 5, message: 'Validating paper URL...' },
        { stage: 'validating', progress: 10, message: 'Detected arxiv paper' },
        { stage: 'fetching', progress: 15, message: 'Downloading PDF...' },
      ];

      // Send events one at a time with delay
      const body = events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('');

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        body,
      });
    });

    const input = page.locator('input[placeholder*="arxiv"]');
    await input.fill(TEST_ARXIV_URL);

    const analyzeButton = page.locator('button:has-text("Analyze")');
    await analyzeButton.click();

    // Should show progress UI - wait for either progress or complete state
    await expect(
      page.locator('[data-testid="paper-progress"], [data-testid="paper-analysis"]')
    ).toBeVisible({ timeout: 10000 });
  });

  test('should complete analysis with mock data', async ({ page }) => {
    // Use mock API for fast test
    await setupMockAnalysis(page);

    const input = page.locator('input[placeholder*="arxiv"]');
    await input.fill(TEST_ARXIV_URL);

    const analyzeButton = page.locator('button:has-text("Analyze")');
    await analyzeButton.click();

    // Wait for analysis to complete (fast with mock)
    await expect(page.locator('[data-testid="paper-analysis"]')).toBeVisible({
      timeout: 10000,
    });

    // Verify analysis sections are present
    await expect(page.locator('text=Summary')).toBeVisible();
    await expect(page.locator('text=Problem Statement')).toBeVisible();
    await expect(page.locator('text=Key Contributions')).toBeVisible();
    await expect(page.locator('text=Methodology')).toBeVisible();

    // Verify figures section is present (mock includes 2 figures)
    await expect(page.locator('text=Key Figures')).toBeVisible();

    // Verify figure images are displayed
    const figureImages = page.locator('[data-testid="paper-analysis"] img');
    await expect(figureImages).toHaveCount(2);

    // Verify figure importance scores are displayed
    await expect(page.locator('text=Importance: 85/100')).toBeVisible();
    await expect(page.locator('text=Importance: 75/100')).toBeVisible();
  });

  // SLOW TEST: Full analysis with real API takes 2-3 minutes
  test('should complete analysis for a real paper @slow', async ({ page }) => {
    test.skip(SKIP_SLOW_TESTS, 'Skipping slow test - set SKIP_SLOW_TESTS=false to run');
    test.setTimeout(180000); // 3 minutes for full analysis

    const input = page.locator('input[placeholder*="arxiv"]');
    await input.fill(TEST_ARXIV_URL);

    const analyzeButton = page.locator('button:has-text("Analyze")');
    await analyzeButton.click();

    // Wait for analysis to complete (may take a while)
    await expect(page.locator('[data-testid="paper-analysis"]')).toBeVisible({
      timeout: 150000,
    });

    // Verify paper title is displayed (not "Untitled Paper")
    // Title should be "Attention Is All You Need" from arXiv API
    const titleElement = page.locator('h1.text-xl');
    await expect(titleElement).toBeVisible();
    const titleText = await titleElement.textContent();
    expect(titleText).not.toBe('Untitled Paper');
    expect(titleText?.toLowerCase()).toContain('attention');

    // Verify all required analysis sections are present (use heading selectors to avoid duplicates)
    await expect(page.locator('h2:has-text("Summary")')).toBeVisible();
    await expect(page.locator('h2:has-text("Key Contributions"), h2:has-text("Key Findings")').first()).toBeVisible();
    await expect(page.locator('h2:has-text("Methodology")')).toBeVisible();
  });
});

test.describe('Paper Reader - Actions (with mock)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/paper');
    await page.waitForLoadState('networkidle');

    // Use mock API for fast tests
    await setupMockAnalysis(page);

    // Run a mock analysis first
    const input = page.locator('input[placeholder*="arxiv"]');
    await input.fill(TEST_ARXIV_URL);

    const analyzeButton = page.locator('button:has-text("Analyze")');
    await analyzeButton.click();

    // Wait for analysis to complete (fast with mock)
    await expect(page.locator('[data-testid="paper-analysis"]')).toBeVisible({ timeout: 10000 });
  });

  test('should show action buttons after analysis', async ({ page }) => {
    // Verify action buttons are visible
    await expect(page.locator('button:has-text("Save as Whim")')).toBeVisible();
    await expect(page.locator('button:has-text("Copy Markdown")')).toBeVisible();
    await expect(page.locator('button:has-text("Analyze Another")')).toBeVisible();
  });

  test('should copy markdown to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const copyButton = page.locator('button:has-text("Copy Markdown")');
    await copyButton.click();

    // Button should show "Copied!" feedback
    await expect(page.locator('text=Copied!')).toBeVisible({ timeout: 3000 });

    // Verify clipboard content contains markdown
    const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardContent).toContain('# ');
    expect(clipboardContent).toContain('## Summary');
  });

  test('should reset to input state when clicking Analyze Another', async ({ page }) => {
    const analyzeAnotherButton = page.locator('button:has-text("Analyze Another")');
    await analyzeAnotherButton.click();

    // Should return to input state
    await expect(page.locator('input[placeholder*="arxiv"]')).toBeVisible();
    await expect(page.locator('text=Analyze Academic Papers')).toBeVisible();
  });

  test('should save analysis as Whim successfully', async ({ page }) => {
    // Mock the save-whim API
    await page.route('**/api/paper/save-whim', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          whim: {
            id: 'test-whim-123',
            title: 'Attention Is All You Need',
          },
        }),
      });
    });

    // Click Save as Whim button
    const saveButton = page.locator('button:has-text("Save as Whim")');
    await saveButton.click();

    // Should navigate to whim page with the new whim ID
    await page.waitForURL(/\/whim\?id=test-whim-123/, { timeout: 5000 });
    await expect(page).toHaveURL(/\/whim\?id=test-whim-123/);
  });
});

test.describe('Paper Reader - Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/paper');
    await page.waitForLoadState('networkidle');
  });

  test('should handle invalid arXiv ID gracefully', async ({ page }) => {
    const input = page.locator('input[placeholder*="arxiv"]');
    // Use a non-existent arXiv ID
    await input.fill('https://arxiv.org/abs/9999.99999');

    const analyzeButton = page.locator('button:has-text("Analyze")');
    await analyzeButton.click();

    // Should show error after attempting to fetch
    await expect(page.locator('[data-testid="paper-error"]')).toBeVisible({
      timeout: 30000,
    });

    // Should show Try Again option
    await expect(page.locator('text=/Try Again/i')).toBeVisible();
  });

  test('should allow retry after error', async ({ page }) => {
    const input = page.locator('input[placeholder*="arxiv"]');
    await input.fill('https://arxiv.org/abs/9999.99999');

    const analyzeButton = page.locator('button:has-text("Analyze")');
    await analyzeButton.click();

    // Wait for error
    await expect(page.locator('text=/Try Again/i')).toBeVisible({ timeout: 30000 });

    // Click Try Again
    await page.locator('text=/Try Again/i').click();

    // Should return to input state
    await expect(page.locator('input[placeholder*="arxiv"]')).toBeVisible();
  });
});

test.describe('Paper Reader - Navigation', () => {
  test('should be accessible from welcome page', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Find Paper Reader button on welcome page
    const paperReaderButton = page.locator('button:has-text("Paper Reader")');
    await expect(paperReaderButton).toBeVisible();

    // Click to navigate
    await paperReaderButton.click();

    // Should be on paper reader page
    await expect(page).toHaveURL(/\/paper/);
    await expect(page.locator('h1:has-text("Paper Reader")')).toBeVisible();
  });
});
