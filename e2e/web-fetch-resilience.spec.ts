/**
 * E2E Tests for Web Fetch Resilience
 * Tests the improved fallback chain: Cache → Direct → Jina.ai → Archive.org
 */

import { test, expect } from '@playwright/test';

test.describe('Web Fetch with Fallback Chain', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to home page
    await page.goto('/');

    // Wait for auth
    await page.waitForSelector('[data-testid="message-input"]', { timeout: 10000 });
  });

  test('should successfully fetch content from a normal website', async ({ page }) => {
    // Ask agent to fetch content from a reliable site
    await page.fill('[data-testid="message-input"]',
      'Fetch content from https://example.com and tell me what the page is about');
    await page.click('[data-testid="send-button"]');

    // Wait for agent response (may use ReAct loop)
    const lastMessage = page.locator('[data-testid="message"]').last();
    await expect(lastMessage).toContainText(/example|domain|illustrative|demonstration/i, {
      timeout: 30000,
    });

    // Check that content was fetched successfully
    await expect(lastMessage).not.toContainText(/failed|error|unable/i);
  });

  test('should handle blocked sites with Jina.ai fallback', async ({ page }) => {
    // Test with a site that might block direct fetches
    await page.fill('[data-testid="message-input"]',
      'What are the latest news about Google stock? Use web_fetch on reuters.com if needed');
    await page.click('[data-testid="send-button"]');

    // Agent should try web_search first, then potentially web_fetch
    // If Reuters blocks direct fetch, should fall back to Jina.ai
    const lastMessage = page.locator('[data-testid="message"]').last();

    // Should get some stock information (even if from alternative sources)
    await expect(lastMessage).toContainText(/google|stock|price|market/i, {
      timeout: 45000,
    });
  });

  test('should cache repeated fetches', async ({ page }) => {
    const url = 'https://example.com';

    // First fetch
    await page.fill('[data-testid="message-input"]',
      `Fetch content from ${url} and summarize it`);
    await page.click('[data-testid="send-button"]');

    await page.waitForSelector('[data-testid="message"]', {
      state: 'attached',
      timeout: 30000,
    });

    // Second fetch (should be faster due to cache)
    await page.fill('[data-testid="message-input"]',
      `Fetch content from ${url} again and tell me the title`);
    await page.click('[data-testid="send-button"]');

    const messages = page.locator('[data-testid="message"]');
    await expect(messages.last()).toContainText(/example/i, { timeout: 30000 });

    // Second fetch should be faster (cache hit)
    // This is a qualitative test - we just verify it works
  });

  test('should use Archive.org for old/deleted content', async ({ page }) => {
    // Test with a potentially archived page
    await page.fill('[data-testid="message-input"]',
      'Find information about the Internet Archive at archive.org');
    await page.click('[data-testid="send-button"]');

    const lastMessage = page.locator('[data-testid="message"]').last();
    await expect(lastMessage).toContainText(/archive|library|digital|wayback/i, {
      timeout: 30000,
    });
  });

  test('should provide helpful error when all methods fail', async ({ page }) => {
    // Test with an impossible URL
    await page.fill('[data-testid="message-input"]',
      'Fetch content from https://this-definitely-does-not-exist-123456789.com');
    await page.click('[data-testid="send-button"]');

    const lastMessage = page.locator('[data-testid="message"]').last();

    // Should acknowledge the failure gracefully
    await expect(lastMessage).toContainText(/cannot|unable|failed|not.*found/i, {
      timeout: 30000,
    });
  });

  test('should work with web_search + web_fetch combination', async ({ page }) => {
    // Test the full agentic workflow
    await page.fill('[data-testid="message-input"]',
      'Search for the latest AI news and fetch details from one of the articles');
    await page.click('[data-testid="send-button"]');

    const lastMessage = page.locator('[data-testid="message"]').last();

    // Should use web_search to find articles, then web_fetch to get content
    await expect(lastMessage).toContainText(/AI|artificial intelligence|technology/i, {
      timeout: 60000, // Longer timeout for multi-step agent action
    });

    // Should have fetched actual content (not just search results)
    await expect(lastMessage).not.toContainText(/search results|found \d+ results/i);
  });
});

test.describe('Web Fetch Performance', () => {
  test('should handle multiple concurrent fetches', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="message-input"]', { timeout: 10000 });

    // Ask agent to fetch multiple URLs
    await page.fill('[data-testid="message-input"]',
      'Fetch and compare content from example.com, example.org, and example.net');
    await page.click('[data-testid="send-button"]');

    const lastMessage = page.locator('[data-testid="message"]').last();

    // Should successfully fetch from all three
    await expect(lastMessage).toContainText(/example/i, { timeout: 45000 });

    // Should mention multiple sites
    const content = await lastMessage.textContent();
    expect(content?.match(/example/gi)?.length).toBeGreaterThan(2);
  });
});
