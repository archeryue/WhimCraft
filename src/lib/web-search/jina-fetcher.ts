/**
 * Jina.ai Reader Integration
 * Handles JavaScript rendering and bypasses bot detection
 * With API key: Higher rate limits (200 requests/minute)
 * Without API key: Free tier (20 requests/minute)
 */

import { PageContent } from '@/types/content-fetching';

class JinaFetcher {
  private readonly baseUrl = 'https://r.jina.ai/';
  private readonly apiKey = process.env.JINA_API_KEY;

  async fetch(url: string): Promise<PageContent> {
    console.log(`[JinaFetcher] Fetching: ${url}`);
    const startTime = Date.now();

    // Jina.ai API: just prefix the URL
    const jinaUrl = this.baseUrl + url;

    // Prepare headers
    const headers: Record<string, string> = {
      'Accept': 'text/plain', // Get clean markdown
    };

    // Add API key if available (higher rate limits)
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
      console.log('[JinaFetcher] Using API key for higher rate limits');
    }

    const response = await fetch(jinaUrl, {
      headers,
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
      throw new Error(`Jina.ai error: HTTP ${response.status}`);
    }

    const content = await response.text();
    const fetchDuration = Date.now() - startTime;

    console.log(`[JinaFetcher] Success in ${fetchDuration}ms (${content.length} chars)`);

    return {
      url,
      title: this.extractTitle(content),
      rawHtml: '',
      cleanedText: content,
      metadata: {
        fetchedAt: new Date(),
        fetchDuration,
        contentLength: content.length,
        source: 'jina.ai',
      },
    };
  }

  private extractTitle(content: string): string {
    // Extract first markdown heading
    const match = content.match(/^#\s+(.+)$/m);
    return match ? match[1] : 'Untitled';
  }
}

export const jinaFetcher = new JinaFetcher();
