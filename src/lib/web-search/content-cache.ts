/**
 * Simple in-memory LRU cache for fetched content
 * Survives per-instance, resets on cold start (acceptable trade-off)
 */

import { PageContent } from '@/types/content-fetching';

interface CachedContent {
  content: PageContent;
  expiresAt: number;
}

class ContentCache {
  private cache: Map<string, CachedContent> = new Map();
  private readonly MAX_ENTRIES = 500; // ~10MB max memory
  private readonly DEFAULT_TTL = 3600000; // 1 hour

  get(url: string): PageContent | null {
    const cached = this.cache.get(url);
    if (!cached) return null;

    // Check expiration
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(url);
      return null;
    }

    console.log(`[ContentCache] HIT: ${url}`);
    return cached.content;
  }

  set(url: string, content: PageContent, ttl: number = this.DEFAULT_TTL): void {
    // LRU eviction: remove oldest if at capacity
    if (this.cache.size >= this.MAX_ENTRIES) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        console.log(`[ContentCache] Evicted oldest entry: ${firstKey}`);
      }
    }

    this.cache.set(url, {
      content,
      expiresAt: Date.now() + ttl,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  // Metrics for monitoring
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_ENTRIES,
    };
  }
}

export const contentCache = new ContentCache();
