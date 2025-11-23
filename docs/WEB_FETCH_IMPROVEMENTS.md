# Web-Fetch Capability Improvements

**Status**: 📋 Design Document
**Priority**: High
**Estimated Effort**: 6-8 hours (Phase 1 + 2)
**Cost Impact**: ~$0-5/month (with free tiers)

---

## Executive Summary

This document outlines a comprehensive plan to improve WhimCraft's web-fetch capability from ~60% success rate to **85-90% success rate** while keeping costs near zero. The solution uses a **hybrid approach** combining multiple free-tier services and intelligent fallback strategies.

**Key Strategy**: Progressive enhancement with cost-conscious fallbacks

---

## Current System Analysis

### ✅ Strengths

**Implementation** (`src/lib/web-search/content-fetcher.ts`):
- User-Agent rotation (4 different browsers)
- Retry logic with exponential backoff (3 attempts)
- AI-powered content extraction using Gemini Flash Lite
- Smart HTML parsing with cheerio selectors
- Parallel fetching with concurrency control (max 3)
- Content type filtering (skips PDFs, binaries)
- Size limits (2MB max download, 50KB processed)
- Relevance scoring and ranking

**Tools** (`src/lib/agent/tools/web-fetch.ts`):
- Integrated with agentic ReAct loop
- Batch URL processing (max 3 per call)
- Failed URL tracking

### ❌ Issues Identified (from Production Logs)

**From Cloud Run logs (2025-11-23 06:18-06:19 UTC):**
```
[ContentFetcher] Failed to fetch https://www.reuters.com/markets/companies/GOOGL.O/
after 3 attempts: HTTP 401: HTTP Forbidden
```

**Root Causes:**
1. **HTTP 401/403 Blocks**: News sites (Reuters, Bloomberg, WSJ) block automated scrapers
2. **No Caching**: Same URLs fetched multiple times (waste of $$$ and time)
3. **Limited User-Agents**: Only 4 UAs, all modern browsers (easy to fingerprint)
4. **No JavaScript Rendering**: Sites requiring JS fail completely
5. **No Fallback Strategies**: When direct fetch fails, agent has no alternatives
6. **No Per-Domain Rate Limiting**: Risk of IP bans from aggressive fetching

**Success Rate**: ~60% (estimated from logs)

---

## Recommended Solution: Hybrid Approach

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Web Fetch Request                       │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────┐
         │   1. Check Cache        │ ← Redis/Memory (1h-24h TTL)
         │   (1h-24h TTL)          │
         └──────┬──────────────────┘
                │ MISS
                ▼
         ┌─────────────────────────┐
         │   2. Try Cheerio        │ ← Current System (FREE)
         │   (Current System)      │   - User-Agent rotation
         └──────┬──────────────────┘   - Smart retry logic
                │ HTTP 401/403/Timeout  - Cheerio parsing
                ▼
         ┌─────────────────────────┐
         │   3. Alternative        │ ← Free APIs
         │   Sources               │   - Archive.org
         │                         │   - Alternative frontends
         └──────┬──────────────────┘   - RSS feeds
                │ Still Failed
                ▼
         ┌─────────────────────────┐
         │   4. Third-Party API    │ ← ScrapingBee (1000 free/mo)
         │   (JS Rendering)        │   - Handles JS-heavy sites
         └──────┬──────────────────┘   - Bypass bot detection
                │ Still Failed
                ▼
         ┌─────────────────────────┐
         │   5. Return Error       │ ← Structured error with
         │   with Suggestions      │   suggested alternatives
         └─────────────────────────┘
```

**Expected Success Rate**: 85-90%
**Monthly Cost**: $0-5 (under free tiers)

---

## Implementation Plan

### Phase 1: Quick Wins (4 hours)

#### 1.1 Response Caching System ⭐

**File**: `src/lib/web-search/content-cache.ts` (NEW)

```typescript
/**
 * Simple in-memory cache with TTL
 * For production: Use Redis or Vercel KV
 */
export class ContentCache {
  private cache: Map<string, CachedContent> = new Map();
  private readonly DEFAULT_TTL = 3600000; // 1 hour

  async get(url: string): Promise<PageContent | null> {
    const cached = this.cache.get(url);
    if (!cached) return null;

    if (Date.now() > cached.expiresAt) {
      this.cache.delete(url);
      return null;
    }

    console.log(`[ContentCache] HIT: ${url}`);
    return cached.content;
  }

  async set(url: string, content: PageContent, ttl?: number): Promise<void> {
    this.cache.set(url, {
      content,
      expiresAt: Date.now() + (ttl || this.DEFAULT_TTL),
    });
  }
}
```

**Impact**:
- 40-60% cache hit rate (common queries)
- Faster responses (~50ms vs 2-5 seconds)
- Lower costs (no API calls for cached content)

---

#### 1.2 Smarter Retry Logic ⭐

**File**: `src/lib/web-search/content-fetcher.ts:149-158`

**Changes:**
```typescript
// Current: Retry all HTTP errors equally
// Improved: Different strategies per status code

private shouldRetry(error: Error, attempt: number): boolean {
  const message = error.message;

  // NEVER retry these
  if (message.includes('404') || message.includes('410')) {
    return false; // Not Found / Gone
  }

  // Retry with different User-Agent
  if (message.includes('401') || message.includes('403')) {
    return attempt < 3; // Forbidden - UA might help
  }

  // Respect rate limits
  if (message.includes('429')) {
    return attempt < 2; // Too Many Requests
  }

  // Retry server errors
  if (message.includes('5')) {
    return attempt < 2; // Server errors
  }

  return false;
}
```

**Impact**:
- +10-15% success rate
- Fewer wasted retries
- Better handling of rate limits

---

#### 1.3 Expanded User-Agent Pool ⭐

**File**: `src/lib/web-search/content-fetcher.ts:10-15`

**Changes:**
```typescript
const USER_AGENTS = [
  // Desktop browsers (modern)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',

  // Mobile browsers (some sites allow mobile)
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36',

  // Older browsers (less fingerprinting)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15',

  // Crawlers (some sites allow)
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
];
```

**Impact**: +5-10% success rate (harder to fingerprint)

---

#### 1.4 Better Error Reporting to Agent ⭐

**File**: `src/lib/agent/tools/web-fetch.ts:64-66`

**Changes:**
```typescript
// Current: Generic error message
// Improved: Structured error with suggestions

if (validContent.length === 0) {
  const errorSuggestions = this.generateSuggestions(failedUrls);
  return errorResult(
    `Failed to fetch content from all URLs. Suggestions:\n${errorSuggestions}`
  );
}

private generateSuggestions(failedUrls: string[]): string {
  const suggestions: string[] = [];

  for (const url of failedUrls) {
    if (url.includes('reuters.com') || url.includes('bloomberg.com')) {
      suggestions.push(`- Try searching for "${url.split('/').pop()}" on Yahoo Finance or CNBC`);
    } else if (url.includes('twitter.com') || url.includes('x.com')) {
      suggestions.push('- Twitter/X blocks automated access, try web_search for tweets instead');
    }
  }

  return suggestions.join('\n') || '- Try alternative search terms or sources';
}
```

**Impact**: Agent can adapt strategy mid-execution

---

### Phase 2: Alternative Sources (4 hours)

#### 2.1 Alternative Content APIs ⭐⭐⭐

**File**: `src/lib/web-search/alternative-sources.ts` (NEW)

**Free Services to Integrate:**

1. **Archive.org Wayback Machine** (Unlimited Free)
   ```typescript
   async function tryArchiveOrg(url: string): Promise<PageContent | null> {
     const archiveUrl = `http://archive.org/wayback/available?url=${url}`;
     const response = await fetch(archiveUrl);
     const data = await response.json();

     if (data.archived_snapshots?.closest?.available) {
       const snapshotUrl = data.archived_snapshots.closest.url;
       return await contentFetcher.fetchPageContent(snapshotUrl);
     }
     return null;
   }
   ```
   **Use Case**: News articles, older content

2. **Alternative Frontends** (Free)
   ```typescript
   const ALTERNATIVE_FRONTENDS: Record<string, string> = {
     'twitter.com': 'nitter.net',
     'x.com': 'nitter.net',
     'reddit.com': 'old.reddit.com',
     'youtube.com': 'piped.video',
     'instagram.com': 'bibliogram.art',
   };
   ```
   **Use Case**: Social media content

3. **RSS Feeds** (Free)
   ```typescript
   async function tryRssFeed(url: string): Promise<PageContent | null> {
     // Many news sites have RSS feeds
     const rssUrl = url.replace(/\/article\/.*/, '/feed');
     // Parse RSS and find matching article
   }
   ```
   **Use Case**: News sites, blogs

4. **ScrapingBee API** (1000 free/month)
   ```typescript
   async function tryScrapingBee(url: string): Promise<PageContent | null> {
     const apiKey = process.env.SCRAPINGBEE_API_KEY;
     if (!apiKey || requestCount > 900) return null; // Save free quota

     const apiUrl = `https://app.scrapingbee.com/api/v1/?api_key=${apiKey}&url=${url}&render_js=false`;
     const response = await fetch(apiUrl);
     return await parseResponse(response);
   }
   ```
   **Use Case**: JS-heavy sites, bot-protected sites

**Implementation:**
```typescript
export async function fetchWithFallbacks(url: string): Promise<PageContent> {
  // 1. Try direct fetch (cheapest)
  try {
    return await contentFetcher.fetchPageContent(url);
  } catch (error) {
    console.log('[AlternativeSources] Direct fetch failed, trying fallbacks...');
  }

  // 2. Try alternative frontends (free)
  const alternative = getAlternativeFrontend(url);
  if (alternative) {
    try {
      return await contentFetcher.fetchPageContent(alternative);
    } catch (error) {
      console.log('[AlternativeSources] Alternative frontend failed');
    }
  }

  // 3. Try Archive.org (free)
  try {
    const archived = await tryArchiveOrg(url);
    if (archived) return archived;
  } catch (error) {
    console.log('[AlternativeSources] Archive.org failed');
  }

  // 4. Try ScrapingBee (limited free quota)
  try {
    const scraped = await tryScrapingBee(url);
    if (scraped) return scraped;
  } catch (error) {
    console.log('[AlternativeSources] ScrapingBee failed');
  }

  throw new Error('All fallback methods exhausted');
}
```

**Impact**: +30-40% success rate for blocked sites

---

#### 2.2 Per-Domain Rate Limiting

**File**: `src/lib/web-search/domain-limiter.ts` (NEW)

```typescript
/**
 * Rate limiter to avoid getting IP banned
 * Enforces polite crawling: max 3 requests/minute per domain
 */
export class DomainRateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly MAX_PER_MINUTE = 3;

  async checkAndWait(url: string): Promise<void> {
    const domain = new URL(url).hostname;
    const now = Date.now();
    const minute = 60000;

    // Get recent requests to this domain
    const recentRequests = (this.requests.get(domain) || [])
      .filter(time => now - time < minute);

    if (recentRequests.length >= this.MAX_PER_MINUTE) {
      const oldestRequest = Math.min(...recentRequests);
      const waitTime = minute - (now - oldestRequest);
      console.log(`[DomainLimiter] Rate limit for ${domain}, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Record this request
    recentRequests.push(now);
    this.requests.set(domain, recentRequests);
  }
}
```

**Impact**: Avoid IP bans, sustainable long-term fetching

---

#### 2.3 Specialized Site Handlers

**File**: `src/lib/web-search/site-handlers/` (NEW DIRECTORY)

**Structure:**
```
site-handlers/
  ├── index.ts              # Registry
  ├── news-sites.ts         # Reuters, Bloomberg (use RSS)
  ├── social-media.ts       # Twitter/X, Reddit (use alternatives)
  └── financial.ts          # Yahoo Finance, CNBC (API access)
```

**Example - News Handler:**
```typescript
export class NewsHandler {
  canHandle(url: string): boolean {
    return ['reuters.com', 'bloomberg.com', 'wsj.com'].some(
      domain => url.includes(domain)
    );
  }

  async fetch(url: string): Promise<PageContent> {
    // Strategy 1: Try RSS feed
    const rssContent = await this.tryRssFeed(url);
    if (rssContent) return rssContent;

    // Strategy 2: Try Archive.org
    const archived = await tryArchiveOrg(url);
    if (archived) return archived;

    // Strategy 3: Try alternative search
    throw new Error('News site blocked - suggest using web_search instead');
  }
}
```

**Impact**: High-quality extraction from challenging sites

---

### Phase 3: Advanced Features (Future)

**Only implement if Phase 1+2 doesn't achieve 85% success rate**

#### 3.1 Self-Hosted JavaScript Rendering

**When**: If <1000 JS renders/month needed
**Tool**: Playwright on Cloud Run
**Cost**: +$5-10/month (2GB RAM, longer execution)
**Success Rate**: +15-20%

**Hybrid Approach:**
```typescript
async function fetchWithJsIfNeeded(url: string): Promise<PageContent> {
  // Try cheap method first
  const result = await contentFetcher.fetchPageContent(url);

  // Detect if JS rendering needed (low content = likely SPA)
  if (result.cleanedText.length < 500) {
    console.log('[BrowserFetch] Low content, trying headless browser...');
    return await browserFetcher.fetchPageContent(url);
  }

  return result;
}
```

---

## Cost Analysis

### Current Costs (per 100 fetches/day)
```
Cheerio fetching: ~$0.30/month
Gemini extraction: ~$0.50/month
Total: ~$0.80/month
```

### After Phase 1+2 (per 100 fetches/day)
```
Cache hits (40%): $0/month (40 fetches)
Direct fetch (40%): $0.32/month (40 fetches)
Alternative sources (15%): $0/month (15 fetches, free APIs)
ScrapingBee (5%): $0/month (5 fetches, under 1000/mo free)
Gemini extraction: $0.60/month (60 fetches after cache)
Total: ~$0.92/month (+15% for 30% better success rate)
```

### If Phase 3 Needed (self-hosted Playwright)
```
Phase 1+2: $0.92/month
Playwright (10 renders/day): +$3-5/month
Total: ~$4-6/month
```

**ROI**: Spend $0.12-5/month more, get 30-40% more successful fetches

---

## Testing Strategy

### Unit Tests
**File**: `src/__tests__/lib/web-search/content-fetcher-improved.test.ts`

```typescript
describe('ContentFetcher with Fallbacks', () => {
  it('should use cache for repeated URLs', async () => {
    const url = 'https://example.com';
    await fetcher.fetchPageContent(url);
    const cached = await fetcher.fetchPageContent(url);
    expect(cached.metadata.fromCache).toBe(true);
  });

  it('should try alternative frontends for Twitter', async () => {
    const url = 'https://twitter.com/user/status/123';
    const result = await fetchWithFallbacks(url);
    expect(result.url).toContain('nitter.net');
  });

  it('should respect domain rate limits', async () => {
    const limiter = new DomainRateLimiter();
    const start = Date.now();
    for (let i = 0; i < 4; i++) {
      await limiter.checkAndWait('https://reuters.com/article' + i);
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThan(5000); // Should wait ~1 minute
  });
});
```

### E2E Tests
**File**: `e2e/web-fetch-resilience.spec.ts`

```typescript
test('should handle blocked news sites gracefully', async () => {
  const response = await sendMessage('What is the latest GOOGL stock price?');

  // Agent should try web_search + web_fetch
  // If Reuters blocks, should fall back to alternatives
  expect(response).toContain('GOOGL');
  expect(response).toMatch(/\$\d+\.\d+/); // Should have price
});
```

### Manual Testing Checklist
- [ ] Test with known blocked sites (Reuters, Bloomberg)
- [ ] Test cache hit/miss behavior
- [ ] Test alternative frontends (Twitter → Nitter)
- [ ] Test Archive.org fallback
- [ ] Monitor ScrapingBee quota usage
- [ ] Verify domain rate limiting works
- [ ] Check error messages are helpful to agent

---

## Migration Plan

### Step 1: Phase 1 Implementation (Week 1)
1. Add `ContentCache` class
2. Update retry logic in `content-fetcher.ts`
3. Expand User-Agent pool
4. Improve error reporting
5. Write unit tests
6. Deploy to staging

### Step 2: Phase 2 Implementation (Week 2)
1. Create `alternative-sources.ts`
2. Integrate Archive.org API
3. Add alternative frontend redirects
4. Set up ScrapingBee account (free tier)
5. Implement domain rate limiter
6. Write E2E tests
7. Deploy to production

### Step 3: Monitoring (Ongoing)
1. Track success rates in logs
2. Monitor ScrapingBee quota (stay under 900/month)
3. Measure cache hit rates
4. Identify sites that still fail
5. Add specialized handlers as needed

---

## Success Metrics

### Target Metrics (After Phase 1+2)
- **Success Rate**: 85-90% (up from ~60%)
- **Cache Hit Rate**: 40-50%
- **Average Fetch Time**: <2 seconds (down from 3-5s)
- **Monthly Cost**: <$2 (vs $0.80 currently)
- **Agent Adaptation**: 90% of blocked fetches result in alternative strategy

### Monitoring
```typescript
// Add to content-fetcher.ts
const metrics = {
  totalFetches: 0,
  successfulFetches: 0,
  cacheHits: 0,
  fallbackUsed: {
    alternativeFrontend: 0,
    archiveOrg: 0,
    scrapingBee: 0,
  },
};

// Log hourly
setInterval(() => {
  console.log('[ContentFetcher Metrics]', {
    successRate: (metrics.successfulFetches / metrics.totalFetches * 100).toFixed(1) + '%',
    cacheHitRate: (metrics.cacheHits / metrics.totalFetches * 100).toFixed(1) + '%',
    fallbacks: metrics.fallbackUsed,
  });
}, 3600000);
```

---

## Future Enhancements (Beyond Scope)

### If 90% Success Rate Still Not Enough:
1. **Premium Scraping Services** ($50-200/month)
   - Bright Data, Oxylabs, ScraperAPI paid tiers
   - Residential proxies
   - Guaranteed JS rendering

2. **Direct API Integrations** (Free/Paid)
   - News API (news aggregation)
   - Twitter API ($100/month for v2 API)
   - Financial APIs (Yahoo Finance, Alpha Vantage)

3. **Machine Learning Detection**
   - Auto-detect if JS rendering needed
   - Learn which sites need which strategies
   - Optimize retry logic based on historical data

---

## Conclusion

**Recommended Approach:**
1. **Start with Phase 1** (4 hours, $0 cost, +15-20% success rate)
2. **Add Phase 2 selectively** (4 hours, $0 cost, +25-30% success rate)
3. **Monitor results for 2 weeks**
4. **Only add Phase 3 if needed** (expensive, last resort)

**Expected Outcome:**
- 85-90% success rate (vs 60% currently)
- Near-zero cost increase (free tiers)
- Better agent adaptation (helpful errors)
- Faster responses (caching)
- Sustainable long-term (rate limiting)

**Files to Create/Modify:**
- NEW: `src/lib/web-search/content-cache.ts`
- NEW: `src/lib/web-search/alternative-sources.ts`
- NEW: `src/lib/web-search/domain-limiter.ts`
- NEW: `src/lib/web-search/site-handlers/`
- MODIFY: `src/lib/web-search/content-fetcher.ts`
- MODIFY: `src/lib/agent/tools/web-fetch.ts`
- NEW: `src/__tests__/lib/web-search/content-fetcher-improved.test.ts`
- NEW: `e2e/web-fetch-resilience.spec.ts`

---

**Last Updated**: November 23, 2025
**Author**: Archer & Claude Code
**Status**: Ready for Implementation
