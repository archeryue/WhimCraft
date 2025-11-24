/**
 * Content Fetcher Service
 * Fetches and parses web page content using cheerio with intelligent fallbacks
 * Fallback chain: Cache → Direct → Jina.ai → Archive.org
 */

import * as cheerio from 'cheerio';
import { PageContent, ContentFetcherOptions, ContentFetchError } from '@/types/content-fetching';
import { contentCache } from './content-cache';
import { jinaFetcher } from './jina-fetcher';
import { archiveFetcher } from './archive-fetcher';

// Expanded User-Agent pool (harder to fingerprint)
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
];

const DEFAULT_OPTIONS: ContentFetcherOptions = {
  timeout: 5000, // 5 seconds
  maxContentLength: 50000, // 50KB
  userAgent: USER_AGENTS[0],
  respectRobotsTxt: true,
};

// Maximum download size: 2MB (to prevent memory exhaustion)
const MAX_DOWNLOAD_SIZE = 2 * 1024 * 1024;

export class ContentFetcher {
  private options: ContentFetcherOptions;

  constructor(options?: Partial<ContentFetcherOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Get a random User-Agent from the pool
   */
  private getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Main entry point: Try cache → direct → Jina.ai → Archive.org
   */
  async fetchPageContent(url: string): Promise<PageContent> {
    // 1. Check cache first
    const cached = contentCache.get(url);
    if (cached) {
      return cached;
    }

    // 2. Try direct fetch
    try {
      const content = await this.directFetch(url);
      contentCache.set(url, content);
      return content;
    } catch (directError) {
      const errorMsg = directError instanceof Error ? directError.message : '';
      console.log(`[ContentFetcher] Direct fetch failed: ${errorMsg}`);

      // 3. Try Jina.ai (handles JS + bot detection)
      try {
        console.log('[ContentFetcher] Trying Jina.ai fallback...');
        const jinaContent = await jinaFetcher.fetch(url);
        contentCache.set(url, jinaContent);
        return jinaContent;
      } catch (jinaError) {
        console.log(`[ContentFetcher] Jina.ai failed: ${jinaError}`);

        // 4. Try Archive.org (final fallback)
        try {
          console.log('[ContentFetcher] Trying Archive.org fallback...');
          const archiveContent = await archiveFetcher.fetch(url);
          contentCache.set(url, archiveContent, 7200000); // Cache 2 hours
          return archiveContent;
        } catch (archiveError) {
          console.error(`[ContentFetcher] All methods failed for ${url}`);
          // Throw original error for best error message
          throw directError;
        }
      }
    }
  }

  /**
   * Direct fetch using Cheerio (current system, improved)
   */
  private async directFetch(url: string): Promise<PageContent> {
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const startTime = Date.now();

        if (attempt > 0) {
          // Exponential backoff: 1s, 2s
          const delay = 1000 * Math.pow(2, attempt - 1);
          console.log(`[ContentFetcher] Retry ${attempt}/${maxRetries} after ${delay}ms`);
          await this.sleep(delay);
        }

        console.log(`[ContentFetcher] Direct fetching: ${url}`);

        // Use random User-Agent on retries
        const userAgent = attempt > 0 ? this.getRandomUserAgent() : this.options.userAgent;

        const response = await fetch(url, {
          signal: AbortSignal.timeout(this.options.timeout),
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Referer': new URL(url).origin,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Check Content-Type
        const contentType = response.headers.get('Content-Type') || '';
        if (contentType.includes('application/pdf') ||
            contentType.includes('application/octet-stream') ||
            contentType.includes('application/zip')) {
          throw new Error(`Unsupported content type: ${contentType}`);
        }

        // Check Content-Length
        const contentLength = response.headers.get('Content-Length');
        if (contentLength && parseInt(contentLength) > MAX_DOWNLOAD_SIZE) {
          throw new Error(`File too large: ${contentLength} bytes`);
        }

        const html = await response.text();
        const fetchDuration = Date.now() - startTime;

        // Parse with cheerio
        const $ = cheerio.load(html);
        const title = this.extractTitle($);
        const mainContent = this.extractMainContent($);
        const cleanedText = this.cleanText(mainContent);
        const truncatedText = cleanedText.substring(0, this.options.maxContentLength);

        console.log(`[ContentFetcher] Direct success in ${fetchDuration}ms (${truncatedText.length} chars)`);

        return {
          url,
          title,
          rawHtml: html.substring(0, this.options.maxContentLength),
          cleanedText: truncatedText,
          metadata: {
            fetchedAt: new Date(),
            fetchDuration,
            contentLength: truncatedText.length,
            source: 'direct',
          },
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        const errorMessage = lastError.message;

        // Don't retry non-retryable errors
        if (errorMessage.includes('Unsupported content type') ||
            errorMessage.includes('File too large') ||
            errorMessage.includes('404') ||
            errorMessage.includes('410')) {
          console.error(`[ContentFetcher] Non-retryable error: ${errorMessage}`);
          break;
        }

        // Continue retrying for other errors
        if (attempt < maxRetries) {
          continue;
        }
      }
    }

    throw lastError || new Error('Failed to fetch');
  }

  /**
   * Extract page title
   */
  private extractTitle($: ReturnType<typeof cheerio.load>): string {
    // Try multiple title sources
    const title =
      $('title').first().text() ||
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('h1').first().text() ||
      'Untitled';

    return title.trim();
  }

  /**
   * Extract main content using common selectors
   */
  private extractMainContent($: ReturnType<typeof cheerio.load>): string {
    // Remove unwanted elements first (across entire document)
    $('script, style, nav, header, footer, aside, .sidebar, .advertisement, .ad, iframe, noscript').remove();

    // Try common content selectors in order of preference
    const selectors = [
      'article',              // Semantic article tag
      'main',                 // Main content area
      '[role="main"]',        // ARIA main role
      '.post-content',        // Common blog class
      '.article-content',     // Common article class
      '.entry-content',       // WordPress default
      '.content',             // Generic content class
      '#content',             // Generic content ID
      '.markdown-body',       // GitHub, Markdown renderers
      'body',                 // Ultimate fallback
    ];

    for (const selector of selectors) {
      const content = $(selector).first();
      if (content.length) {
        const text = content.text().trim();
        // Must have substantial content (>100 chars)
        if (text.length > 100) {
          console.log(`[ContentFetcher] Found content with selector: ${selector}`);
          return text;
        }
      }
    }

    // Fallback: get body text
    console.log(`[ContentFetcher] Using fallback: body text`);
    return $('body').text();
  }

  /**
   * Clean and normalize text
   */
  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')           // Normalize whitespace
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive newlines
      .replace(/\t+/g, ' ')           // Replace tabs with spaces
      .trim();
  }

  /**
   * Categorize error type
   */
  private categorizeError(error: unknown): ContentFetchError['errorType'] {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return 'timeout';
      }
      if (error.message.includes('HTTP')) {
        return 'http_error';
      }
    }
    return 'unknown';
  }

  /**
   * Batch fetch multiple URLs (in parallel with concurrency limit)
   */
  async fetchMultiple(
    urls: string[],
    options?: { concurrency?: number }
  ): Promise<Array<PageContent | ContentFetchError>> {
    const concurrency = options?.concurrency || 3;
    const results: Array<PageContent | ContentFetchError> = [];

    // Process in batches
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(url => this.fetchPageContent(url))
      );

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            url: batch[index],
            error: result.reason?.message || 'Failed to fetch',
            errorType: 'unknown',
          });
        }
      });
    }

    return results;
  }
}

// Export singleton instance
export const contentFetcher = new ContentFetcher();
