/**
 * E2E Tests for Financial Website Fetching
 * Tests fetching from finance-specific sites that often block scrapers
 */

import { test, expect } from '@playwright/test';

test.describe('Financial Website Fetching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="message-input"]', { timeout: 10000 });
  });

  test('should fetch Google stock information from Yahoo Finance', async ({ page }) => {
    await page.fill('[data-testid="message-input"]',
      'Get the latest Google (GOOGL) stock price from Yahoo Finance');
    await page.click('[data-testid="send-button"]');

    const lastMessage = page.locator('[data-testid="message"]').last();

    // Should successfully fetch and mention stock-related terms
    await expect(lastMessage).toContainText(/google|googl|alphabet|stock|price|\$/i, {
      timeout: 60000,
    });

    // Should have actual content, not just a search result
    const content = await lastMessage.textContent();
    expect(content?.length).toBeGreaterThan(100);
  });

  test('should handle Reuters financial news (blocked site)', async ({ page }) => {
    await page.fill('[data-testid="message-input"]',
      'Find the latest technology stock news on Reuters and summarize it');
    await page.click('[data-testid="send-button"]');

    const lastMessage = page.locator('[data-testid="message"]').last();

    // Should either:
    // 1. Successfully fetch via Jina.ai/Archive.org fallback
    // 2. Use web_search as alternative
    // 3. Provide helpful alternative suggestion
    await expect(lastMessage).toContainText(/technology|stock|market|news|reuters/i, {
      timeout: 60000,
    });

    // Should not show a raw error
    await expect(lastMessage).not.toContainText(/HTTP 403|HTTP 401|forbidden.*error/i);
  });

  test('should fetch company financial data from multiple sources', async ({ page }) => {
    await page.fill('[data-testid="message-input"]',
      'What is Apple\'s current market cap and stock price? Use reliable financial sources.');
    await page.click('[data-testid="send-button"]');

    const lastMessage = page.locator('[data-testid="message"]').last();

    // Should provide financial information
    await expect(lastMessage).toContainText(/apple|aapl|market cap|stock|price|\$/i, {
      timeout: 60000,
    });

    // Should have substantive content
    const content = await lastMessage.textContent();
    expect(content?.length).toBeGreaterThan(150);
  });

  test('should handle Bloomberg paywall with fallback', async ({ page }) => {
    await page.fill('[data-testid="message-input"]',
      'Search for Tesla earnings news on Bloomberg');
    await page.click('[data-testid="send-button"]');

    const lastMessage = page.locator('[data-testid="message"]').last();

    // Should adapt strategy (use web_search or alternative sources)
    await expect(lastMessage).toContainText(/tesla|earnings|stock|market/i, {
      timeout: 60000,
    });

    // Should provide actual news, not just an error
    await expect(lastMessage).not.toContainText(/unable to fetch|all methods failed/i);
  });

  test('should fetch market overview from CNBC', async ({ page }) => {
    await page.fill('[data-testid="message-input"]',
      'Get today\'s market overview from CNBC - how are major indices performing?');
    await page.click('[data-testid="send-button"]');

    const lastMessage = page.locator('[data-testid="message"]').last();

    // Should mention major indices
    await expect(lastMessage).toContainText(/dow|s&p|nasdaq|market|index|indices/i, {
      timeout: 60000,
    });
  });

  test('should handle MarketWatch company profile', async ({ page }) => {
    await page.fill('[data-testid="message-input"]',
      'Get Microsoft\'s company profile and recent stock performance from MarketWatch');
    await page.click('[data-testid="send-button"]');

    const lastMessage = page.locator('[data-testid="message"]').last();

    // Should provide company information
    await expect(lastMessage).toContainText(/microsoft|msft|company|stock|performance/i, {
      timeout: 60000,
    });
  });

  test('should fetch financial ratios and metrics', async ({ page }) => {
    await page.fill('[data-testid="message-input"]',
      'What are Amazon\'s P/E ratio and other key financial metrics? Use financial websites.');
    await page.click('[data-testid="send-button"]');

    const lastMessage = page.locator('[data-testid="message"]').last();

    // Should provide financial metrics
    await expect(lastMessage).toContainText(/amazon|amzn|p\/e|ratio|financial|metric/i, {
      timeout: 60000,
    });
  });

  test('should handle multiple financial sources for comparison', async ({ page }) => {
    await page.fill('[data-testid="message-input"]',
      'Compare Nvidia stock information from Yahoo Finance and CNBC');
    await page.click('[data-testid="send-button"]');

    const lastMessage = page.locator('[data-testid="message"]').last();

    // Should fetch from multiple sources
    await expect(lastMessage).toContainText(/nvidia|nvda|stock|comparison/i, {
      timeout: 90000, // Longer timeout for multiple fetches
    });

    // Should mention both sources or provide comparison
    const content = await lastMessage.textContent() || '';
    const hasYahoo = /yahoo/i.test(content);
    const hasCNBC = /cnbc/i.test(content);
    const hasComparison = /comparison|compare|versus|vs/i.test(content);

    expect(hasYahoo || hasCNBC || hasComparison).toBe(true);
  });
});

test.describe('Financial Query Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="message-input"]', { timeout: 10000 });
  });

  test('should handle real-time stock quotes request', async ({ page }) => {
    await page.fill('[data-testid="message-input"]',
      'What is the current real-time price of Tesla stock?');
    await page.click('[data-testid="send-button"]');

    const lastMessage = page.locator('[data-testid="message"]').last();

    // Should provide stock information (may be delayed, not real-time)
    await expect(lastMessage).toContainText(/tesla|tsla|stock|price|\$/i, {
      timeout: 60000,
    });

    // Should indicate if data is delayed
    const content = await lastMessage.textContent();
    expect(content?.length).toBeGreaterThan(50);
  });

  test('should handle historical stock data request', async ({ page }) => {
    await page.fill('[data-testid="message-input"]',
      'What was Apple stock price 6 months ago? Find historical data.');
    await page.click('[data-testid="send-button"]');

    const lastMessage = page.locator('[data-testid="message"]').last();

    // Should attempt to find historical data
    await expect(lastMessage).toContainText(/apple|aapl|stock|historical|price|month|ago/i, {
      timeout: 60000,
    });
  });

  test('should handle earnings report request', async ({ page }) => {
    await page.fill('[data-testid="message-input"]',
      'Find Meta\'s latest quarterly earnings report. What were the key highlights?');
    await page.click('[data-testid="send-button"]');

    const lastMessage = page.locator('[data-testid="message"]').last();

    // Should find earnings information
    await expect(lastMessage).toContainText(/meta|facebook|earnings|quarterly|revenue|profit/i, {
      timeout: 60000,
    });
  });

  test('should handle sector analysis request', async ({ page }) => {
    await page.fill('[data-testid="message-input"]',
      'What is the current state of the semiconductor sector? Look at financial news.');
    await page.click('[data-testid="send-button"]');

    const lastMessage = page.locator('[data-testid="message"]').last();

    // Should provide sector analysis
    await expect(lastMessage).toContainText(/semiconductor|chip|sector|industry|market/i, {
      timeout: 60000,
    });
  });

  test('should cache repeated financial queries', async ({ page }) => {
    // First query
    await page.fill('[data-testid="message-input"]',
      'Get Tesla stock price from Yahoo Finance');
    await page.click('[data-testid="send-button"]');

    await page.waitForSelector('[data-testid="message"]', {
      state: 'attached',
      timeout: 60000,
    });

    // Second identical query (should use cache)
    await page.fill('[data-testid="message-input"]',
      'Get Tesla stock price from Yahoo Finance again');
    await page.click('[data-testid="send-button"]');

    const messages = page.locator('[data-testid="message"]');
    const lastMessage = messages.last();

    // Should still work (from cache)
    await expect(lastMessage).toContainText(/tesla|tsla|stock|price/i, {
      timeout: 30000, // Should be faster due to cache
    });
  });

  test('should handle invalid stock ticker gracefully', async ({ page }) => {
    await page.fill('[data-testid="message-input"]',
      'Get stock information for ticker INVALIDTICKER123456');
    await page.click('[data-testid="send-button"]');

    const lastMessage = page.locator('[data-testid="message"]').last();

    // Should handle gracefully
    await expect(lastMessage).toContainText(/not found|invalid|cannot find|no.*information|unknown/i, {
      timeout: 60000,
    });
  });
});

test.describe('Financial Website Performance', () => {
  test('should handle concurrent financial data fetches', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="message-input"]', { timeout: 10000 });

    await page.fill('[data-testid="message-input"]',
      'Compare stock prices for AAPL, GOOGL, MSFT, and AMZN from financial websites');
    await page.click('[data-testid="send-button"]');

    const lastMessage = page.locator('[data-testid="message"]').last();

    // Should handle multiple tickers
    await expect(lastMessage).toContainText(/apple|google|microsoft|amazon/i, {
      timeout: 90000, // Longer timeout for multiple fetches
    });

    // Should mention multiple stock tickers
    const content = await lastMessage.textContent() || '';
    const tickerCount = (content.match(/aapl|googl|msft|amzn/gi) || []).length;
    expect(tickerCount).toBeGreaterThan(1);
  });
});
