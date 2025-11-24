/**
 * Unit tests for financial website handling
 * Ensures fallback chain works well for finance sites that often block scrapers
 */

import { contentFetcher } from '@/lib/web-search/content-fetcher';
import { contentCache } from '@/lib/web-search/content-cache';
import { jinaFetcher } from '@/lib/web-search/jina-fetcher';
import { archiveFetcher } from '@/lib/web-search/archive-fetcher';
import { PageContent } from '@/types/content-fetching';

jest.mock('@/lib/web-search/jina-fetcher');
jest.mock('@/lib/web-search/archive-fetcher');

describe('Financial Website Fallback Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    contentCache.clear(); // Clear cache between tests
  });

  const financialSites = [
    'https://www.reuters.com/markets/companies/GOOGL.O/',
    'https://www.bloomberg.com/quote/TSLA:US',
    'https://www.wsj.com/market-data/quotes/AAPL',
    'https://www.ft.com/markets',
    'https://www.marketwatch.com/investing/stock/msft',
  ];

  test.each(financialSites)(
    'should fall back to Jina.ai when %s returns 403',
    async (url) => {
      // Mock Jina.ai to succeed
      const jinaContent: PageContent = {
        url,
        title: 'Financial Data',
        rawHtml: '',
        cleanedText: 'Stock price: $150.00. Market cap: $2T.',
        metadata: {
          fetchedAt: new Date(),
          fetchDuration: 2000,
          contentLength: 50,
          source: 'jina.ai',
        },
      };

      (jinaFetcher.fetch as jest.Mock).mockResolvedValue(jinaContent);

      // Mock direct fetch to fail with 403
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockRejectedValue(
        new Error('HTTP 403: Forbidden')
      );

      try {
        const result = await contentFetcher.fetchPageContent(url);

        // Should use Jina.ai fallback
        expect(result.metadata.source).toBe('jina.ai');
        expect(result.cleanedText).toContain('Stock price');
        expect(jinaFetcher.fetch).toHaveBeenCalledWith(url);
      } finally {
        global.fetch = originalFetch;
      }
    }
  );

  // Removed redundant test - covered by parameterized test above

  test('should successfully fetch from Yahoo Finance (less restrictive)', async () => {
    const url = 'https://finance.yahoo.com/quote/AAPL';

    // Yahoo Finance is less restrictive, should work with direct fetch
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'text/html' }),
      text: async () => `
        <html>
          <head><title>Apple Inc. (AAPL) Stock Price</title></head>
          <body>
            <article>
              <h1>Apple Inc.</h1>
              <p>Current Price: $175.50</p>
              <p>Market Cap: $2.8T</p>
            </article>
          </body>
        </html>
      `,
    } as Response);

    try {
      const result = await contentFetcher.fetchPageContent(url);

      // Should succeed with direct fetch
      expect(result.metadata.source).toBe('direct');
      expect(result.cleanedText).toContain('Apple');
      expect(result.cleanedText).toContain('Price');

      // Should NOT use Jina.ai for successful direct fetch
      expect(jinaFetcher.fetch).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('should extract financial data from various sources', async () => {
    const testCases = [
      {
        site: 'CNBC',
        content: 'S&P 500 up 1.2% to 4,500 points',
        keywords: ['S&P', '500', 'points'],
      },
      {
        site: 'MarketWatch',
        content: 'MSFT earnings beat expectations with $2.50 EPS',
        keywords: ['MSFT', 'earnings', 'EPS'],
      },
      {
        site: 'Seeking Alpha',
        content: 'Amazon revenue growth accelerates to 15% YoY',
        keywords: ['Amazon', 'revenue', 'growth'],
      },
    ];

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('HTTP 403'));

    try {
      for (const testCase of testCases) {
        contentCache.clear(); // Clear cache between iterations

        const mockContent: PageContent = {
          url: `https://example.com/${testCase.site}`,
          title: testCase.site,
          rawHtml: '',
          cleanedText: testCase.content,
          metadata: {
            fetchedAt: new Date(),
            fetchDuration: 1000,
            contentLength: testCase.content.length,
            source: 'jina.ai',
          },
        };

        (jinaFetcher.fetch as jest.Mock).mockResolvedValue(mockContent);

        const result = await contentFetcher.fetchPageContent(mockContent.url);

        // Verify all keywords present
        for (const keyword of testCase.keywords) {
          expect(result.cleanedText.toLowerCase()).toContain(
            keyword.toLowerCase()
          );
        }
      }
    } finally {
      global.fetch = originalFetch;
    }
  }, 15000); // Increase timeout to 15s for multiple iterations

  test('should handle paywall with helpful error', async () => {
    const url = 'https://www.wsj.com/articles/paywalled-article-123';

    // All methods fail
    (jinaFetcher.fetch as jest.Mock).mockRejectedValue(
      new Error('Paywall detected')
    );
    (archiveFetcher.fetch as jest.Mock).mockRejectedValue(
      new Error('No archive available')
    );

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(
      new Error('HTTP 403: Forbidden - Paywall')
    );

    try {
      await expect(contentFetcher.fetchPageContent(url)).rejects.toThrow();

      // Should have tried all fallbacks
      expect(jinaFetcher.fetch).toHaveBeenCalled();
      expect(archiveFetcher.fetch).toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('Financial Data Extraction Patterns', () => {
  test('should extract stock ticker patterns', () => {
    const content = 'AAPL is up 2.5% to $175.50';
    const tickerRegex = /[A-Z]{1,5}/g;
    const tickers = content.match(tickerRegex);

    expect(tickers).toContain('AAPL');
  });

  test('should extract price patterns', () => {
    const content = 'Stock price: $142.50, up $5.25 (3.8%)';
    const priceRegex = /\$[\d,]+\.?\d*/g;
    const prices = content.match(priceRegex);

    expect(prices).toContain('$142.50');
    expect(prices).toContain('$5.25');
  });

  test('should extract percentage patterns', () => {
    const content = 'Market up 2.5%, down -1.3% from yesterday';
    const percentRegex = /-?[\d.]+%/g;
    const percentages = content.match(percentRegex);

    expect(percentages).toEqual(expect.arrayContaining(['2.5%', '-1.3%']));
  });

  test('should extract market cap patterns', () => {
    const content = 'Market cap: $2.8T, Revenue: $1.5B';
    const capRegex = /\$[\d.]+[TBM]/g;
    const caps = content.match(capRegex);

    expect(caps).toEqual(expect.arrayContaining(['$2.8T', '$1.5B']));
  });
});
