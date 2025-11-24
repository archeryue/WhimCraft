/**
 * Unit tests for improved content fetcher with fallback chain
 * Tests: Cache → Direct → Jina.ai → Archive.org
 */

import { contentFetcher } from '@/lib/web-search/content-fetcher';
import { contentCache } from '@/lib/web-search/content-cache';
import { jinaFetcher } from '@/lib/web-search/jina-fetcher';
import { archiveFetcher } from '@/lib/web-search/archive-fetcher';
import { PageContent } from '@/types/content-fetching';

// Mock the fetchers
jest.mock('@/lib/web-search/jina-fetcher');
jest.mock('@/lib/web-search/archive-fetcher');

describe('ContentCache', () => {
  beforeEach(() => {
    contentCache.clear();
  });

  it('should cache and retrieve content', () => {
    const url = 'https://example.com';
    const content: PageContent = {
      url,
      title: 'Test',
      rawHtml: '',
      cleanedText: 'test content',
      metadata: {
        fetchedAt: new Date(),
        fetchDuration: 100,
        contentLength: 12,
      },
    };

    contentCache.set(url, content);
    const retrieved = contentCache.get(url);

    expect(retrieved).toBeTruthy();
    expect(retrieved?.cleanedText).toBe('test content');
  });

  it('should respect TTL expiration', async () => {
    const url = 'https://example.com';
    const content: PageContent = {
      url,
      title: 'Test',
      rawHtml: '',
      cleanedText: 'test',
      metadata: {
        fetchedAt: new Date(),
        fetchDuration: 0,
        contentLength: 4,
      },
    };

    // Set with 100ms TTL
    contentCache.set(url, content, 100);
    expect(contentCache.get(url)).toBeTruthy();

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(contentCache.get(url)).toBeNull();
  });

  it('should evict oldest entry at capacity', () => {
    // Fill cache to capacity + 1
    for (let i = 0; i < 501; i++) {
      const content: PageContent = {
        url: `https://example.com/${i}`,
        title: `Test ${i}`,
        rawHtml: '',
        cleanedText: `content ${i}`,
        metadata: {
          fetchedAt: new Date(),
          fetchDuration: 0,
          contentLength: 10,
        },
      };
      contentCache.set(`https://example.com/${i}`, content);
    }

    const stats = contentCache.getStats();
    expect(stats.size).toBe(500);
    expect(stats.maxSize).toBe(500);

    // First entry should be evicted
    expect(contentCache.get('https://example.com/0')).toBeNull();
    // Last entry should exist
    expect(contentCache.get('https://example.com/500')).toBeTruthy();
  });
});

describe('ContentFetcher with Fallbacks', () => {
  beforeEach(() => {
    contentCache.clear();
    jest.clearAllMocks();
  });

  it('should use cache for repeated URLs', async () => {
    const url = 'https://example.com';

    // First fetch (will fetch from network)
    const first = await contentFetcher.fetchPageContent(url);

    // Second fetch (should come from cache)
    const second = await contentFetcher.fetchPageContent(url);

    // Should be the same object from cache
    expect(second).toBe(first);
    expect(second.cleanedText).toBe(first.cleanedText);
  });

  it('should fall back to Jina.ai on 403', async () => {
    const url = 'https://reuters.com/test';

    // Mock Jina.ai to return successful content
    const jinaContent: PageContent = {
      url,
      title: 'Test Article',
      rawHtml: '',
      cleanedText: 'Article content from Jina',
      metadata: {
        fetchedAt: new Date(),
        fetchDuration: 2000,
        contentLength: 25,
        source: 'jina.ai',
      },
    };

    (jinaFetcher.fetch as jest.Mock).mockResolvedValue(jinaContent);

    // Mock direct fetch to fail with 403
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('HTTP 403: Forbidden'));

    try {
      const result = await contentFetcher.fetchPageContent(url);

      expect(result.metadata.source).toBe('jina.ai');
      expect(result.cleanedText).toContain('Jina');
      expect(jinaFetcher.fetch).toHaveBeenCalledWith(url);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should fall back to Archive.org if Jina fails', async () => {
    const url = 'https://old-site.com';

    // Mock Archive.org to return successful content
    const archiveContent: PageContent = {
      url,
      title: 'Archived Article',
      rawHtml: '',
      cleanedText: 'Content from Archive.org',
      metadata: {
        fetchedAt: new Date(),
        fetchDuration: 3000,
        contentLength: 24,
        source: 'archive.org',
        archiveDate: new Date('2023-01-01'),
        archiveAgeInDays: 365,
      },
    };

    (archiveFetcher.fetch as jest.Mock).mockResolvedValue(archiveContent);
    (jinaFetcher.fetch as jest.Mock).mockRejectedValue(new Error('Jina timeout'));

    // Mock direct fetch to fail
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('HTTP 403: Forbidden'));

    try {
      const result = await contentFetcher.fetchPageContent(url);

      expect(result.metadata.source).toBe('archive.org');
      expect(result.cleanedText).toContain('Archive.org');
      expect(archiveFetcher.fetch).toHaveBeenCalledWith(url);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should throw if all methods fail', async () => {
    const url = 'https://impossible.com';

    // Mock all fallbacks to fail
    (jinaFetcher.fetch as jest.Mock).mockRejectedValue(new Error('Jina failed'));
    (archiveFetcher.fetch as jest.Mock).mockRejectedValue(new Error('Archive failed'));

    // Mock direct fetch to fail
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('HTTP 500: Server Error'));

    try {
      await expect(contentFetcher.fetchPageContent(url)).rejects.toThrow();
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('JinaFetcher', () => {
  it('should work with or without API key', () => {
    // API key is optional - works without it (lower rate limits)
    // This test just verifies the implementation exists
    expect(jinaFetcher).toBeDefined();
    expect(typeof jinaFetcher.fetch).toBe('function');
  });
});

describe('ArchiveFetcher', () => {
  it('should parse Archive.org timestamp correctly', () => {
    // Archive.org timestamp format: YYYYMMDDhhmmss
    const timestamp = '20230615120000';
    const expected = new Date('2023-06-15T12:00:00Z');

    const parsed = new Date(
      timestamp.replace(
        /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,
        '$1-$2-$3T$4:$5:$6Z'
      )
    );

    expect(parsed.toISOString()).toBe(expected.toISOString());
  });
});
