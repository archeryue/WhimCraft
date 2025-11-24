# Future Improvements

This document tracks planned enhancements and future features for WhimCraft.

## High Priority

### 1. Web-Fetch Capability Improvements

**Description**: Improve web content fetching success rate from ~60% to 85-90% using a hybrid approach with multiple free-tier fallback strategies.

**Current Issues** (from production logs):
- HTTP 401/403 blocks from news sites (Reuters, Bloomberg, WSJ)
- No caching (repeated fetches waste money and time)
- Limited retry intelligence (treats all errors the same)
- No fallback strategies when sites block automated access
- Success rate: ~60%

**Proposed Solution**: Hybrid fallback system
```
Direct Fetch (Cheerio) → Alternative Frontends → Archive.org → ScrapingBee → Error with Suggestions
```

**Phase 1: Quick Wins** (4 hours, $0 cost, +15-20% success)
1. Response caching (1h TTL for dynamic, 24h for static)
2. Smarter retry logic (different strategies per HTTP status)
3. Expanded User-Agent pool (10+ diverse UAs)
4. Better error reporting to agent (suggest alternatives)

**Phase 2: Alternative Sources** (4 hours, $0 cost, +25-30% success)
5. Archive.org Wayback Machine fallback
6. Alternative frontends (nitter.net for Twitter, old.reddit.com for Reddit)
7. RSS feed parsing for news sites
8. ScrapingBee API (1000 free requests/month for JS rendering)
9. Per-domain rate limiting (avoid IP bans)
10. Specialized handlers for common sites

**Expected Results**:
- Success rate: 85-90% (up from ~60%)
- Cache hit rate: 40-50%
- Average fetch time: <2s (down from 3-5s)
- Monthly cost: ~$1-2 (vs $0.80 currently, +$0.20-1.20)
- All under free tiers of third-party services

**Design Document**: See [WEB_FETCH_IMPROVEMENTS.md](./WEB_FETCH_IMPROVEMENTS.md) for detailed architecture, implementation plan, cost analysis, and testing strategy.

**Files to Create/Modify**:
- NEW: `src/lib/web-search/content-cache.ts`
- NEW: `src/lib/web-search/alternative-sources.ts`
- NEW: `src/lib/web-search/domain-limiter.ts`
- NEW: `src/lib/web-search/site-handlers/`
- MODIFY: `src/lib/web-search/content-fetcher.ts`
- MODIFY: `src/lib/agent/tools/web-fetch.ts`

**Estimated Effort**: 6-8 hours (Phase 1 + 2)

**Cost Impact**: +$0-5/month (staying within free tiers)

**Priority Rationale**: HIGH - Production logs show 40% failure rate on important sites (financial news). This directly impacts user experience when agent tries to fetch web content. Solution is cost-effective and uses proven free services.

---

## Low Priority

### 1. Notion-like Whim Editing Experience - Phase 2 Enhancements

**Description**: Add advanced Notion-like features to the TipTap editor. Phase 1 (LaTeX, code highlighting, tables, images) is already complete.

**Current State**:
- ✅ TipTap WYSIWYG editor implemented
- ✅ LaTeX math support (inline and block)
- ✅ Syntax-highlighted code blocks
- ✅ Table creation and editing
- ✅ Image support
- ✅ Basic formatting (bold, italic, headings, lists)

**Phase 2 Enhancements** (Nice-to-have):
1. **Slash Commands**
   - Type `/` to insert blocks (heading, list, code, table, etc.)
   - Searchable command palette

2. **Drag & Drop Blocks**
   - Reorder paragraphs, headings, lists by dragging
   - Visual drop indicators

3. **Video Embedding**
   - Support YouTube, Vimeo URLs
   - Responsive embeds

4. **Enhanced Code Blocks**
   - Line numbers
   - Copy button
   - Language badge

**Benefits**:
- Enhanced user experience with Notion-like polish
- Faster content organization with drag & drop
- Quick formatting with slash commands

**Estimated Effort**: 4-6 hours

**Cost Impact**: None (all client-side)

**Priority Rationale**:
This is LOW PRIORITY because Phase 1 already provides core functionality. These are polish features that can be added later.

---

**Last Updated**: November 24, 2025
**Maintained By**: Archer & Claude Code
