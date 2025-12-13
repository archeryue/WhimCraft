/**
 * Deep Research E2E Test Suite
 *
 * Tests for Deep Research feature with mocked API responses.
 */

import { test, expect, Page } from "@playwright/test";

// Mock research result
const MOCK_RESULT = {
  success: true,
  query: "Explain the history of quantum computing",
  report: `# History of Quantum Computing

## Introduction
Quantum computing represents a paradigm shift in computational capabilities, leveraging the principles of quantum mechanics to process information in fundamentally new ways.

## Key Milestones
- **1980s**: Richard Feynman proposes quantum computers could simulate quantum systems
- **1994**: Peter Shor develops his algorithm for factoring large numbers
- **2019**: Google claims quantum supremacy with 53-qubit processor

## Current State
Major players in quantum computing include IBM, Google, Microsoft, and various startups working on different approaches to quantum hardware.

## Future Prospects
Experts predict practical quantum advantage in specific domains within the next decade.`,
  citations: [
    {
      url: "https://example.com/quantum-history",
      title: "History of Quantum Computing",
    },
    {
      url: "https://example.com/quantum-supremacy",
      title: "Quantum Supremacy Explained",
    },
  ],
  metadata: {
    interactionId: "test-interaction-123",
    completedAt: new Date().toISOString(),
    durationMs: 600000,
  },
};

function createMockSSEResponse() {
  const events = [
    { stage: "starting", progress: 5, message: "Initiating research..." },
    {
      stage: "researching",
      progress: 15,
      message: "Research started. This may take 10-20 minutes...",
    },
    {
      stage: "thinking",
      progress: 40,
      message: "Processing research...",
      thoughtSummary: "Analyzing quantum computing history and milestones",
    },
    { stage: "writing", progress: 80, message: "Generating report..." },
    { stage: "complete", progress: 100, message: "Research complete!" },
    { result: MOCK_RESULT },
  ];

  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
}

async function setupMockResearch(page: Page) {
  await page.route("**/api/research/start", async (route) => {
    const body = createMockSSEResponse();
    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
      body,
    });
  });
}

async function setupMockSaveWhim(page: Page) {
  await page.route("**/api/research/save-whim", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        whim: {
          id: "mock-whim-id-123",
          title: "Research: Explain the history of quantum computing",
        },
      }),
    });
  });
}

test.describe("Deep Research - Page Load", () => {
  test("should load research page with correct elements", async ({ page }) => {
    await page.goto("/research");
    await page.waitForLoadState("networkidle");

    // Check header elements
    await expect(page.locator("h1:has-text('Deep Research')")).toBeVisible();
    await expect(page.locator("text=Beta")).toBeVisible();

    // Check input elements
    await expect(
      page.locator('[data-testid="research-query-input"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="research-start-button"]')
    ).toBeVisible();

    // Check informational text
    await expect(page.locator("text=AI-Powered Deep Research")).toBeVisible();
  });

  test("should have back navigation to chat", async ({ page }) => {
    await page.goto("/research");
    await page.waitForLoadState("networkidle");

    const backLink = page.locator('a[href="/chat"]');
    await expect(backLink).toBeVisible();
  });
});

test.describe("Deep Research - Input Validation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/research");
    await page.waitForLoadState("networkidle");
  });

  test("should disable button for empty query", async ({ page }) => {
    const button = page.locator('[data-testid="research-start-button"]');
    await expect(button).toBeDisabled();
  });

  test("should disable button for short queries", async ({ page }) => {
    const input = page.locator('[data-testid="research-query-input"]');
    await input.fill("short");

    const button = page.locator('[data-testid="research-start-button"]');
    await expect(button).toBeDisabled();
  });

  test("should enable button for valid queries (10+ chars)", async ({
    page,
  }) => {
    const input = page.locator('[data-testid="research-query-input"]');
    await input.fill("Explain the history and development of quantum computing");

    const button = page.locator('[data-testid="research-start-button"]');
    await expect(button).toBeEnabled();
  });

  test("should show character count", async ({ page }) => {
    const input = page.locator('[data-testid="research-query-input"]');
    await input.fill("test");

    // Should show "4/10 min characters"
    await expect(page.locator("text=4/10 min characters")).toBeVisible();

    await input.fill("longer query text");
    await expect(page.locator("text=17/10 min characters")).toBeVisible();
  });
});

test.describe("Deep Research - Research Flow", () => {
  test("should complete research with mock data", async ({ page }) => {
    // Setup mock BEFORE navigating
    await setupMockResearch(page);

    await page.goto("/research");
    await page.waitForLoadState("networkidle");

    const input = page.locator('[data-testid="research-query-input"]');
    await input.fill("Explain the history of quantum computing");

    const button = page.locator('[data-testid="research-start-button"]');
    await button.click();

    // Wait for either progress or report (SSE mock sends all events at once)
    await expect(page.locator('[data-testid="research-report"]')).toBeVisible({
      timeout: 15000,
    });

    // Verify report content (use specific selectors to avoid strict mode violations)
    await expect(
      page.locator("h1:has-text('History of Quantum Computing')")
    ).toBeVisible();
    await expect(page.locator("text=Richard Feynman").first()).toBeVisible();
    await expect(page.locator("h3:has-text('Sources')")).toBeVisible();
  });

  test("should show action buttons after completion", async ({ page }) => {
    // Setup mock BEFORE navigating
    await setupMockResearch(page);

    await page.goto("/research");
    await page.waitForLoadState("networkidle");

    const input = page.locator('[data-testid="research-query-input"]');
    await input.fill("Explain the history of quantum computing");

    const button = page.locator('[data-testid="research-start-button"]');
    await button.click();

    await expect(page.locator('[data-testid="research-report"]')).toBeVisible({
      timeout: 15000,
    });

    // Check all action buttons are visible
    await expect(
      page.locator('[data-testid="research-save-whim-button"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="research-copy-button"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="research-another-button"]')
    ).toBeVisible();
  });

  test("should allow starting new research", async ({ page }) => {
    // Setup mock BEFORE navigating
    await setupMockResearch(page);

    await page.goto("/research");
    await page.waitForLoadState("networkidle");

    const input = page.locator('[data-testid="research-query-input"]');
    await input.fill("Explain the history of quantum computing");

    const button = page.locator('[data-testid="research-start-button"]');
    await button.click();

    await expect(page.locator('[data-testid="research-report"]')).toBeVisible({
      timeout: 15000,
    });

    // Click "New Research" button
    await page.locator('[data-testid="research-another-button"]').click();

    // Should be back to input state
    await expect(
      page.locator('[data-testid="research-query-input"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="research-report"]')
    ).not.toBeVisible();
  });
});

test.describe("Deep Research - Save as Whim", () => {
  test("should save research as whim and redirect", async ({ page }) => {
    // Setup all mocks BEFORE navigating
    await setupMockResearch(page);
    await setupMockSaveWhim(page);

    // Mock the whim page route (use specific pattern to avoid intercepting API calls)
    await page.route("**/whim?id=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body><h1>Whim Page</h1></body></html>",
      });
    });

    await page.goto("/research");
    await page.waitForLoadState("networkidle");

    const input = page.locator('[data-testid="research-query-input"]');
    await input.fill("Explain the history of quantum computing");

    const button = page.locator('[data-testid="research-start-button"]');
    await button.click();

    await expect(page.locator('[data-testid="research-report"]')).toBeVisible({
      timeout: 15000,
    });

    // Click save as whim
    await page.locator('[data-testid="research-save-whim-button"]').click();

    // Should redirect to whim page
    await page.waitForURL(/\/whim\?id=/, { timeout: 5000 });
  });
});

test.describe("Deep Research - Navigation from Welcome", () => {
  test("should be accessible from welcome page", async ({ page }) => {
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");

    // Find and click the Deep Research button
    const researchButton = page.locator('button:has-text("Deep Research")');
    await expect(researchButton).toBeVisible();

    await researchButton.click();

    // Should navigate to research page
    await expect(page).toHaveURL(/\/research/);
    await expect(page.locator("h1:has-text('Deep Research')")).toBeVisible();
  });
});

test.describe("Deep Research - Error Handling", () => {
  test("should handle rate limit error", async ({ page }) => {
    await page.route("**/api/research/start", async (route) => {
      await route.fulfill({
        status: 429,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Rate limit exceeded",
          message:
            "Daily limit of 5 research queries reached. Try again tomorrow.",
        }),
      });
    });

    await page.goto("/research");
    await page.waitForLoadState("networkidle");

    const input = page.locator('[data-testid="research-query-input"]');
    await input.fill("Explain the history of quantum computing");

    const button = page.locator('[data-testid="research-start-button"]');
    await button.click();

    // Should show error state
    await expect(page.locator('[data-testid="research-error"]')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator("text=Daily limit")).toBeVisible();
  });

  test("should allow retry after error", async ({ page }) => {
    await page.route("**/api/research/start", async (route) => {
      await route.fulfill({
        status: 429,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Rate limit exceeded",
          message: "Rate limit exceeded",
        }),
      });
    });

    await page.goto("/research");
    await page.waitForLoadState("networkidle");

    const input = page.locator('[data-testid="research-query-input"]');
    await input.fill("Explain the history of quantum computing");

    const button = page.locator('[data-testid="research-start-button"]');
    await button.click();

    await expect(page.locator('[data-testid="research-error"]')).toBeVisible({
      timeout: 5000,
    });

    // Click try again
    await page.locator('[data-testid="research-try-again"]').click();

    // Should be back to input state
    await expect(
      page.locator('[data-testid="research-query-input"]')
    ).toBeVisible();
  });
});
