# Web Integration

**Status**: ✅ Implemented
**Last Updated**: December 1, 2025

WhimCraft integrates web search and content fetching via the agentic ReAct loop, providing real-time information access with intelligent fallback chains.

---

## Overview

The web integration consists of two agent tools:
1. **web_search** - Google Custom Search API for finding relevant URLs
2. **web_fetch** - Multi-tier content fetching with 90-95% success rate

---

## Web Search

### Provider
**Google Custom Search API** - chosen for:
- Same GCP ecosystem (consolidated billing)
- 100 free searches/day (3,000/month)
- Best search quality (Google's algorithm)
- Cheapest at scale ($5/1K queries)

### Rate Limits
- **Global limit**: 100 searches/day for all users combined
- **Free tier**: First 100/day = $0
- **Paid tier**: $0.005 per search beyond free tier
- **Tracking**: Firestore `search_usage` collection

### Configuration
```bash
# .env.local
NEXT_PUBLIC_USE_WEB_SEARCH=true
GOOGLE_SEARCH_API_KEY=your-api-key
GOOGLE_SEARCH_ENGINE_ID=your-engine-id
```

### Files
- `src/lib/web-search/google-search.ts` - Search API client
- `src/lib/web-search/rate-limiter.ts` - Global rate limiting
- `src/lib/agent/tools/web-search.ts` - Agent tool

---

## Web Fetch

### Fallback Chain (Zero-Cost)

```
1. Cache (In-Memory LRU)     → <1ms,  Cost: $0
      ↓ MISS
2. Direct Fetch (Cheerio)    → 1-2s,  Cost: $0, Success: ~60%
      ↓ FAIL (401/403)
3. Jina.ai Reader (JS)       → 2-5s,  Cost: $0, Success: ~85%
      ↓ FAIL (rare)
4. Archive.org (Wayback)     → 3-5s,  Cost: $0, Success: ~5-10%
      ↓ FAIL (very rare)
5. Return Error with suggestions
```

**Combined Success Rate**: 90-95%
**Monthly Cost**: $0

### Features
- In-memory LRU cache (500 entries, 1h TTL)
- User-Agent rotation (4 browsers)
- Retry with exponential backoff (3 attempts)
- Parallel fetching (max 3 concurrent)
- Content size limits (2MB download, 50KB processed)
- AI-powered content extraction (Gemini Flash Lite)

### Files
- `src/lib/web-search/content-fetcher.ts` - Fetch implementation
- `src/lib/web-search/content-extractor.ts` - AI extraction
- `src/lib/agent/tools/web-fetch.ts` - Agent tool

---

## Cost Summary

| Usage Level | Search Cost | Fetch Cost | Total |
|-------------|-------------|------------|-------|
| Light (500/mo) | $0 | $0 | $0 |
| Normal (3,000/mo) | $0 | $0 | $0 |
| Heavy (5,000/mo) | $10 | $0 | $10 |

---

## Testing

### Unit Tests
- `src/__tests__/lib/web-search/` - 6 tests for search functionality
- `src/__tests__/lib/agent/tools/` - Tool integration tests

### E2E Tests
- Web search flow tested in `e2e/02-authenticated-chat.e2e.ts`
- Content fetching tested with real URLs

---

**Files**: `src/lib/web-search/`, `src/lib/agent/tools/web-*.ts`
