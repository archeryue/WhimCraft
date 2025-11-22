# Stream Resilience: Server-Side Buffering + Resume

**Status**: Planned (Low Priority)
**Estimated Effort**: 8-12 hours
**Last Updated**: November 22, 2025

---

## Problem Statement

**Current Behavior**:
- Chat uses HTTP streaming (chunked transfer encoding) to send AI responses in real-time
- When user switches browser tabs during generation:
  - **Chrome/Edge**: May pause/cancel stream after ~1 minute of inactivity
  - **Safari**: Can close connections within seconds
  - **Firefox**: Handles better but still has issues
- Stream is lost and cannot resume - partial response is gone
- User must restart the entire request

**Impact**: Poor UX when users multitask or have aggressive browser throttling (especially mobile Safari)

---

## Proposed Solution

Implement a robust buffering + resume system that allows interrupted streams to reconnect and continue.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Server Side                                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Stream Buffer Manager                                  │
│     - In-memory Map<requestId, StreamBuffer>               │
│     - Stores: content chunks, progress events, metadata    │
│     - TTL: 5 minutes (auto-cleanup)                        │
│     - Max size: 10MB per buffer                            │
│                                                             │
│  2. Enhanced Chat API                                      │
│     - Writes all chunks to buffer AND stream               │
│     - Returns requestId in response headers                │
│     - New endpoint: GET /api/chat/resume/:requestId        │
│                                                             │
│  3. Resume Endpoint                                        │
│     - Accepts: requestId, lastChunkIndex                   │
│     - Returns: remaining chunks + completion status        │
│     - Validates: user owns the request                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Client Side                                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Stream Monitor                                         │
│     - Page Visibility API: detect tab switches             │
│     - Connection health check: detect stalls               │
│     - Reconnection logic: exponential backoff              │
│                                                             │
│  2. Chunk Tracker                                          │
│     - Stores: requestId, lastChunkIndex, content so far    │
│     - Persists to sessionStorage for tab recovery          │
│                                                             │
│  3. Resume Manager                                         │
│     - Auto-reconnect on tab return (if incomplete)         │
│     - Manual retry button (user-triggered)                 │
│     - Seamless continuation from last chunk                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Server-Side Buffer (Core)

**1. Create `StreamBufferManager` service**
   - In-memory Map with TTL cleanup (5 min)
   - Thread-safe chunk storage
   - Automatic cleanup on completion
   - Memory limits per buffer (10MB) and total (100MB)

**2. Modify chat API route to buffer chunks**
   - Write to buffer before streaming
   - Include chunk sequence numbers
   - Store progress events separately
   - Add completion marker

**3. Create resume endpoint `/api/chat/resume/:requestId`**
   - Validate user authorization
   - Return chunks from lastChunkIndex onwards
   - Include completion status
   - Handle missing/expired buffers gracefully

### Phase 2: Client-Side Resume Logic

**1. Implement `StreamMonitor` hook**
   - Page Visibility API integration
   - Detect tab hidden/visible events
   - Show warning toast when tab switches during stream
   - Track stream health (last chunk timestamp)

**2. Create `ChunkTracker` utility**
   - Store requestId and chunk indices
   - Persist to sessionStorage (survives reload)
   - Track content and progress separately
   - Clear on completion

**3. Build `ResumeManager`**
   - Auto-reconnect when tab becomes visible
   - Exponential backoff (1s, 2s, 4s, max 10s)
   - Max 5 retry attempts
   - Merge resumed chunks with existing content
   - Show reconnection status in UI

### Phase 3: UI Enhancements

**1. Connection status indicator**
   - "Streaming..." (green)
   - "Connection lost, reconnecting..." (yellow)
   - "Reconnected successfully" (green, fade out)
   - "Failed to reconnect" (red) with manual retry button

**2. Warning on tab switch**
   - Toast: "Switching tabs may interrupt. We'll try to resume when you return."
   - Auto-dismiss after 3 seconds

**3. Manual retry control**
   - "Retry" button if auto-resume fails
   - Shows remaining attempts

---

## Data Structures

```typescript
// Server-side buffer
interface StreamBuffer {
  requestId: string;
  userId: string;
  conversationId: string;
  chunks: StreamChunk[];
  progressEvents: ProgressEvent[];
  startedAt: number;
  completedAt: number | null;
  expiresAt: number; // TTL
  totalSize: number; // bytes
  isComplete: boolean;
}

interface StreamChunk {
  index: number;
  type: 'content' | 'progress';
  data: string;
  timestamp: number;
}

// Client-side tracking
interface StreamState {
  requestId: string;
  conversationId: string;
  lastChunkIndex: number;
  isComplete: boolean;
  lastUpdateTime: number;
  retryCount: number;
}

// Resume API response
interface ResumeResponse {
  chunks: StreamChunk[];
  isComplete: boolean;
  totalChunks: number;
  hasMore: boolean;
}
```

---

## Edge Cases & Error Handling

### 1. Buffer Expired
- **Server**: Return 410 Gone
- **Client**: Show error, offer to regenerate

### 2. Multiple Tabs
- Use sessionStorage (tab-specific)
- Each tab manages own resume state

### 3. Network Failure
- Exponential backoff with jitter
- Max 5 retries, then show manual retry

### 4. Concurrent Requests
- Buffer keyed by requestId (unique per request)
- No conflicts

### 5. Memory Limits
- Max 10MB per buffer, 100MB total
- Evict oldest completed buffers first
- Log warning if limits approached

### 6. User Switches Conversation
- Abandon resume attempt
- Clear sessionStorage for old request

### 7. Browser Refresh
- sessionStorage persists (same session)
- Resume on reload if not expired

---

## Files to Modify/Create

### Server
- `src/lib/stream/buffer-manager.ts` (NEW) - Buffer management
- `src/lib/stream/types.ts` (NEW) - Type definitions
- `src/app/api/chat/route.ts` - Add buffering logic
- `src/app/api/chat/resume/[requestId]/route.ts` (NEW) - Resume endpoint

### Client
- `src/hooks/useStreamMonitor.ts` (NEW) - Monitor stream health
- `src/hooks/useStreamResume.ts` (NEW) - Resume logic
- `src/lib/stream/chunk-tracker.ts` (NEW) - Track chunks
- `src/app/chat/page.tsx` - Integrate resume hooks
- `src/components/chat/StreamStatus.tsx` (NEW) - Status indicator

---

## Testing Requirements

### Unit Tests
- Buffer manager: add, get, cleanup, TTL
- Chunk tracker: store, retrieve, clear
- Resume manager: retry logic, backoff

### Integration Tests
- Complete stream flow with buffering
- Resume from various chunk indices
- Authorization validation

### E2E Tests
- Switch tabs during stream, verify resume
- Browser refresh during stream
- Network disconnection simulation
- Multiple concurrent streams

### Manual Tests
- Chrome tab switch (30s, 1min, 2min)
- Safari aggressive throttling
- Firefox background behavior
- Slow 3G network simulation

---

## Effort Estimation

**Total**: 8-12 hours

- Phase 1 (Server buffer): 3-4 hours
- Phase 2 (Client resume): 3-4 hours
- Phase 3 (UI polish): 1-2 hours
- Testing: 2-3 hours

---

## Cost Impact

- Minimal memory overhead (~10-100MB for active streams)
- No additional API costs
- Slight CPU overhead for buffering (negligible)

---

## Benefits

- ✅ Resilient to tab switches (major UX improvement)
- ✅ Handles network hiccups gracefully
- ✅ No lost responses - always resumable
- ✅ Better mobile experience (aggressive backgrounding)
- ✅ Professional-grade reliability
- ✅ Works with all existing features (agentic mode, whim assistant, etc.)

---

## Priority Rationale

**LOW PRIORITY** because:
- Workaround exists: Don't switch tabs during generation
- Affects edge case (most users stay on tab)
- Non-trivial engineering effort for moderate UX gain
- No security/data loss concerns (just UX annoyance)

However, when implemented, this will significantly improve perceived reliability and professionalism of the application.
