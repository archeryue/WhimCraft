/**
 * Archive.org Wayback Machine Integration
 * Final fallback for blocked/deleted content
 * Completely free, unlimited API access
 */

import { PageContent } from '@/types/content-fetching';
import * as cheerio from 'cheerio';

class ArchiveFetcher {
  private readonly apiUrl = 'https://archive.org/wayback/available';

  async fetch(url: string): Promise<PageContent> {
    console.log(`[ArchiveFetcher] Checking Archive.org for: ${url}`);

    // 1. Check if URL has archived snapshots
    const response = await fetch(
      `${this.apiUrl}?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) {
      throw new Error(`Archive.org API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.archived_snapshots?.closest?.available) {
      throw new Error('No archived snapshot available');
    }

    const snapshot = data.archived_snapshots.closest;
    const snapshotUrl = snapshot.url;
    const timestamp = new Date(
      // Archive.org timestamp format: YYYYMMDDhhmmss
      snapshot.timestamp.replace(
        /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,
        '$1-$2-$3T$4:$5:$6Z'
      )
    );
    const ageInDays = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60 * 24);

    console.log(
      `[ArchiveFetcher] Found snapshot from ${timestamp.toISOString()} ` +
      `(${ageInDays.toFixed(0)} days old)`
    );

    // 2. Fetch the archived page
    const archiveResponse = await fetch(snapshotUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!archiveResponse.ok) {
      throw new Error(`Failed to fetch archive: ${archiveResponse.status}`);
    }

    const html = await archiveResponse.text();
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $('script, style, nav, header, footer, aside, .sidebar, .advertisement, .ad').remove();

    // Extract title
    const title =
      $('title').first().text() ||
      $('meta[property="og:title"]').attr('content') ||
      $('h1').first().text() ||
      'Archived Page';

    // Extract content
    const contentSelectors = [
      'article',
      'main',
      '[role="main"]',
      '.post-content',
      '.article-content',
      '.entry-content',
      '.content',
      '#content',
      'body',
    ];

    let content = '';
    for (const selector of contentSelectors) {
      const element = $(selector).first();
      if (element.length) {
        const text = element.text().trim();
        if (text.length > 100) {
          content = text;
          break;
        }
      }
    }

    // Clean whitespace
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();

    return {
      url, // Keep original URL
      title: title.trim(),
      rawHtml: '',
      cleanedText: content,
      metadata: {
        fetchedAt: new Date(),
        fetchDuration: 0,
        contentLength: content.length,
        source: 'archive.org',
        archiveDate: timestamp,
        archiveAgeInDays: Math.floor(ageInDays),
      },
    };
  }
}

export const archiveFetcher = new ArchiveFetcher();
