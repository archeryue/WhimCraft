/**
 * Repo Reader E2E Test Suite
 *
 * Tests for the Repo Reader feature:
 * - Page load and navigation
 * - URL input validation
 * - Repository analysis flow with SSE progress
 * - Error handling
 * - Save as Whim functionality
 *
 * Note: Most tests use mocked API responses for speed.
 * The full integration test with real GitHub API is marked @slow.
 */

import { test, expect, Page } from '@playwright/test';

// Test GitHub repo: WhimCraft repository
const TEST_GITHUB_URL = 'https://github.com/archeryue/WhimCraft';

// Environment flag to skip slow tests
const SKIP_SLOW_TESTS = process.env.SKIP_SLOW_TESTS === 'true';

// Mock analysis result for fast tests
const MOCK_ANALYSIS = {
  metadata: {
    name: 'WhimCraft',
    owner: 'archeryue',
    fullName: 'archeryue/WhimCraft',
    description: 'AI chatbot with intelligent memory and agentic capabilities',
    url: TEST_GITHUB_URL,
    stars: 10,
    forks: 2,
    language: 'TypeScript',
    license: 'MIT',
    defaultBranch: 'main',
    lastPush: '2024-12-12T12:00:00Z',
    analyzedAt: new Date().toISOString(),
  },
  analysis: {
    overview: 'A Next.js AI chatbot with intelligent memory and agentic capabilities.',
    techStack: {
      language: 'TypeScript',
      framework: 'Next.js',
      buildTool: 'npm',
      dependencies: ['next', 'react', '@google/generative-ai', 'firebase'],
    },
    architecture: `archeryue/WhimCraft
├── src/
│   ├── app/ (Next.js app router)
│   ├── lib/ (core logic)
│   └── components/ (React components)
├── e2e/ (Playwright tests)
└── package.json`,
    modules: [
      {
        path: 'src/lib/',
        name: 'Core Library',
        description: 'Core business logic including agent, memory, and providers',
        keyFiles: [
          { path: 'src/lib/agent/core/agent.ts', url: 'https://github.com/archeryue/WhimCraft/blob/main/src/lib/agent/core/agent.ts', description: 'Main agent implementation' },
        ],
      },
    ],
    dataFlow: 'User messages flow through the agent which orchestrates tools and memory.',
    entryPoints: [
      { type: 'api', file: 'src/app/api/chat/route.ts', url: 'https://github.com/archeryue/WhimCraft/blob/main/src/app/api/chat/route.ts', description: 'Chat API endpoint' },
    ],
    setupInstructions: 'npm install && npm run dev',
    codePatterns: ['ReAct pattern', 'Server components', 'API routes'],
    learningPoints: ['Agentic AI', 'Memory systems', 'Next.js App Router'],
  },
  sections: [
    { title: 'Overview', content: 'A Next.js AI chatbot application', type: 'text' },
  ],
};

// Helper to create mock SSE response
function createMockSSEResponse() {
  const events = [
    { stage: 'reconnaissance', progress: 5, message: 'Fetching repository metadata...' },
    { stage: 'reconnaissance', progress: 15, message: 'Detecting project type...' },
    { stage: 'entry_points', progress: 25, message: 'Analyzing entry points...' },
    { stage: 'entry_points', progress: 35, message: 'Building import graph...' },
    { stage: 'exploration', progress: 45, message: 'Exploring modules...' },
    { stage: 'exploration', progress: 60, message: 'Exploring modules...' },
    { stage: 'synthesis', progress: 75, message: 'Generating architecture document...' },
    { stage: 'synthesis', progress: 90, message: 'Finalizing analysis...' },
    { stage: 'complete', progress: 100, message: 'Analysis complete!', result: MOCK_ANALYSIS },
  ];

  return events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('');
}

// Helper to set up mock API for fast tests
async function setupMockAnalysis(page: Page) {
  await page.route('**/api/repo/analyze', async (route) => {
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

test.describe('Repo Reader - Page Load', () => {
  test('should load repo reader page', async ({ page }) => {
    await page.goto('/repo');
    await page.waitForLoadState('networkidle');

    // Verify page title/header
    await expect(page.locator('h1:has-text("Repo Reader")')).toBeVisible();

    // Verify Beta badge
    await expect(page.locator('text=Beta')).toBeVisible();

    // Verify input field is visible
    await expect(page.locator('[data-testid="repo-url-input"]')).toBeVisible();

    // Verify Analyze button is visible
    await expect(page.locator('[data-testid="repo-analyze-button"]')).toBeVisible();
  });

  test('should have back navigation to chat', async ({ page }) => {
    await page.goto('/repo');
    await page.waitForLoadState('networkidle');

    // Find and click back arrow
    const backLink = page.locator('a[href="/chat"]');
    await expect(backLink).toBeVisible();
  });

  test('should redirect unauthenticated users to login', async ({ page, context }) => {
    // Clear all cookies to simulate unauthenticated state
    await context.clearCookies();

    await page.goto('/repo');

    // Should redirect to login page
    await page.waitForURL(/\/login/, { timeout: 10000 });
  });
});

test.describe('Repo Reader - URL Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/repo');
    await page.waitForLoadState('networkidle');
  });

  test('should show error for empty URL', async ({ page }) => {
    const analyzeButton = page.locator('[data-testid="repo-analyze-button"]');

    // Button should be disabled when input is empty
    await expect(analyzeButton).toBeDisabled();
  });

  test('should show error for invalid URL format', async ({ page }) => {
    const input = page.locator('[data-testid="repo-url-input"]');
    await input.fill('not-a-valid-url');

    const analyzeButton = page.locator('[data-testid="repo-analyze-button"]');
    await analyzeButton.click();

    // Should show error message
    await expect(page.locator('[data-testid="repo-input-error"]')).toBeVisible({ timeout: 5000 });
  });

  test('should accept valid GitHub URL', async ({ page }) => {
    const input = page.locator('[data-testid="repo-url-input"]');
    await input.fill(TEST_GITHUB_URL);

    const analyzeButton = page.locator('[data-testid="repo-analyze-button"]');

    // Button should be enabled
    await expect(analyzeButton).toBeEnabled();
  });

  test('should accept shorthand format (owner/repo)', async ({ page }) => {
    const input = page.locator('[data-testid="repo-url-input"]');
    await input.fill('sindresorhus/is');

    const analyzeButton = page.locator('[data-testid="repo-analyze-button"]');

    // Button should be enabled
    await expect(analyzeButton).toBeEnabled();
  });
});

test.describe('Repo Reader - Analysis Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/repo');
    await page.waitForLoadState('networkidle');
  });

  test('should show progress indicators when starting analysis', async ({ page }) => {
    // Intercept to return fast progress events
    await page.route('**/api/repo/analyze', async (route) => {
      const events = [
        { stage: 'reconnaissance', progress: 5, message: 'Fetching repository metadata...' },
        { stage: 'reconnaissance', progress: 15, message: 'Detecting project type...' },
        { stage: 'entry_points', progress: 25, message: 'Analyzing entry points...' },
      ];

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

    const input = page.locator('[data-testid="repo-url-input"]');
    await input.fill(TEST_GITHUB_URL);

    const analyzeButton = page.locator('[data-testid="repo-analyze-button"]');
    await analyzeButton.click();

    // Should show progress UI - wait for either progress or complete state
    await expect(
      page.locator('[data-testid="repo-progress"], [data-testid="repo-analysis"]')
    ).toBeVisible({ timeout: 10000 });
  });

  test('should complete analysis with mock data', async ({ page }) => {
    // Use mock API for fast test
    await setupMockAnalysis(page);

    const input = page.locator('[data-testid="repo-url-input"]');
    await input.fill(TEST_GITHUB_URL);

    const analyzeButton = page.locator('[data-testid="repo-analyze-button"]');
    await analyzeButton.click();

    // Wait for analysis to complete (fast with mock)
    await expect(page.locator('[data-testid="repo-analysis"]')).toBeVisible({
      timeout: 10000,
    });

    // Verify analysis sections are present
    await expect(page.locator('text=Overview')).toBeVisible();
    await expect(page.locator('text=Tech Stack')).toBeVisible();
    await expect(page.locator('text=Architecture')).toBeVisible();
    await expect(page.locator('text=Module Breakdown')).toBeVisible();
  });

  // SLOW TEST: Full analysis with real GitHub API takes 1-2 minutes
  // Uses go-torrent repo for stable assertions (repo doesn't change frequently)
  test('should complete analysis for a real repository @slow', async ({ page }) => {
    test.skip(SKIP_SLOW_TESTS, 'Skipping slow test - set SKIP_SLOW_TESTS=false to run');
    test.setTimeout(180000); // 3 minutes for full analysis

    const input = page.locator('[data-testid="repo-url-input"]');
    // Use AutoCut for stable assertions - this repo doesn't change frequently
    await input.fill('https://github.com/archeryue/AutoCut');

    const analyzeButton = page.locator('[data-testid="repo-analyze-button"]');
    await analyzeButton.click();

    // Wait for analysis to complete (may take a while)
    await expect(page.locator('[data-testid="repo-analysis"]')).toBeVisible({
      timeout: 150000,
    });

    // Verify repo name is displayed (minimal assertions - AI output varies)
    await expect(page.locator('text=archeryue/AutoCut')).toBeVisible();

    // Verify basic analysis sections are present (don't assert on specific content)
    await expect(page.locator('text=Overview')).toBeVisible();
    await expect(page.locator('text=Tech Stack')).toBeVisible();
  });
});

test.describe('Repo Reader - Actions (with mock)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/repo');
    await page.waitForLoadState('networkidle');

    // Use mock API for fast tests
    await setupMockAnalysis(page);

    // Run a mock analysis first
    const input = page.locator('[data-testid="repo-url-input"]');
    await input.fill(TEST_GITHUB_URL);

    const analyzeButton = page.locator('[data-testid="repo-analyze-button"]');
    await analyzeButton.click();

    // Wait for analysis to complete (fast with mock)
    await expect(page.locator('[data-testid="repo-analysis"]')).toBeVisible({ timeout: 10000 });
  });

  test('should show action buttons after analysis', async ({ page }) => {
    // Verify action buttons are visible
    await expect(page.locator('[data-testid="repo-save-whim-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="repo-copy-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="repo-analyze-another-button"]')).toBeVisible();
  });

  test('should copy markdown to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const copyButton = page.locator('[data-testid="repo-copy-button"]');
    await copyButton.click();

    // Button should show "Copied!" feedback
    await expect(page.locator('text=Copied!')).toBeVisible({ timeout: 3000 });

    // Verify clipboard content contains markdown
    const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardContent).toContain('# ');
    expect(clipboardContent).toContain('## Overview');
  });

  test('should reset to input state when clicking Analyze Another', async ({ page }) => {
    const analyzeAnotherButton = page.locator('[data-testid="repo-analyze-another-button"]');
    await analyzeAnotherButton.click();

    // Should return to input state
    await expect(page.locator('[data-testid="repo-url-input"]')).toBeVisible();
    await expect(page.locator('text=Analyze GitHub Repositories')).toBeVisible();
  });

  test('should save analysis as Whim successfully', async ({ page }) => {
    // Mock the save-whim API
    await page.route('**/api/repo/save-whim', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          whim: {
            id: 'test-whim-repo-123',
            title: 'sindresorhus/is - Architecture Analysis',
          },
        }),
      });
    });

    // Click Save as Whim button
    const saveButton = page.locator('[data-testid="repo-save-whim-button"]');
    await saveButton.click();

    // Should navigate to whim page with the new whim ID
    await page.waitForURL(/\/whim\?id=test-whim-repo-123/, { timeout: 5000 });
    await expect(page).toHaveURL(/\/whim\?id=test-whim-repo-123/);
  });
});

test.describe('Repo Reader - Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/repo');
    await page.waitForLoadState('networkidle');
  });

  test('should handle non-existent repository gracefully', async ({ page }) => {
    // Mock error response
    await page.route('**/api/repo/analyze', async (route) => {
      const events = [
        { stage: 'error', progress: 0, message: 'Repository not found', error: 'Repository not found' },
      ];
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

    const input = page.locator('[data-testid="repo-url-input"]');
    await input.fill('https://github.com/nonexistent-user-12345/nonexistent-repo-12345');

    const analyzeButton = page.locator('[data-testid="repo-analyze-button"]');
    await analyzeButton.click();

    // Should show error after attempting to fetch
    await expect(page.locator('[data-testid="repo-error"]')).toBeVisible({
      timeout: 10000,
    });

    // Should show Try Again option
    await expect(page.locator('[data-testid="repo-try-again"]')).toBeVisible();
  });

  test('should allow retry after error', async ({ page }) => {
    // Mock error response
    await page.route('**/api/repo/analyze', async (route) => {
      const events = [
        { stage: 'error', progress: 0, message: 'Repository not found', error: 'Repository not found' },
      ];
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

    const input = page.locator('[data-testid="repo-url-input"]');
    await input.fill('https://github.com/nonexistent/repo');

    const analyzeButton = page.locator('[data-testid="repo-analyze-button"]');
    await analyzeButton.click();

    // Wait for error
    await expect(page.locator('[data-testid="repo-try-again"]')).toBeVisible({ timeout: 10000 });

    // Click Try Again
    await page.locator('[data-testid="repo-try-again"]').click();

    // Should return to input state
    await expect(page.locator('[data-testid="repo-url-input"]')).toBeVisible();
  });
});

test.describe('Repo Reader - Navigation', () => {
  test('should be accessible from welcome page', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Find Repo Reader button on welcome page
    const repoReaderButton = page.locator('button:has-text("Repo Reader")');
    await expect(repoReaderButton).toBeVisible();

    // Click to navigate
    await repoReaderButton.click();

    // Should be on repo reader page
    await expect(page).toHaveURL(/\/repo/);
    await expect(page.locator('h1:has-text("Repo Reader")')).toBeVisible();
  });
});
