# Paper Reader Architecture

This document details the implementation architecture for the Paper Reader feature.

## Overview

Paper Reader accepts academic papers in multiple formats, extracts content, analyzes with AI, and outputs structured analysis that can be saved as a Whim.

```
┌─────────────────────────────────────────────────────────────────┐
│                         INPUT LAYER                              │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  Academic URL   │  Direct PDF URL │  File Upload                │
│  (arXiv, ACL)   │  (any .pdf)     │  (drag & drop)              │
└────────┬────────┴────────┬────────┴──────────────┬──────────────┘
         │                 │                       │
         ▼                 ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                      URL RESOLVER                                │
│  - Detect input type                                             │
│  - Extract PDF URL from academic pages                           │
│  - Validate URLs                                                 │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PDF FETCHER                                 │
│  - Fetch PDF bytes (for URLs)                                    │
│  - Handle file uploads                                           │
│  - Validate PDF format                                           │
│  - Cache fetched PDFs                                            │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PDF PARSER                                  │
│  - Extract text content                                          │
│  - Extract metadata (title, authors, abstract)                   │
│  - Handle multi-page documents                                   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AI ANALYZER                                 │
│  - Send full text to Gemini (2M token context)                   │
│  - Generate structured analysis                                  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      OUTPUT FORMATTER                            │
│  - Structure analysis results                                    │
│  - Convert to Whim-compatible format                             │
│  - Display in UI                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Input Layer

### 1.1 Academic URL Parser

Supported platforms and their URL patterns:

| Platform | URL Pattern | PDF Location |
|----------|-------------|--------------|
| arXiv | `arxiv.org/abs/XXXX.XXXXX` | `arxiv.org/pdf/XXXX.XXXXX.pdf` |
| arXiv (old) | `arxiv.org/abs/category/XXXXXXX` | `arxiv.org/pdf/category/XXXXXXX.pdf` |
| ACL Anthology | `aclanthology.org/XXXX.XXXX/` | `aclanthology.org/XXXX.XXXX.pdf` |
| OpenReview | `openreview.net/forum?id=XXX` | `openreview.net/pdf?id=XXX` |
| Semantic Scholar | `semanticscholar.org/paper/XXX` | API → PDF URL |
| Direct PDF | `*.pdf` | URL itself |

```typescript
// src/lib/paper-reader/url-resolver.ts

interface ResolvedPaper {
  type: 'arxiv' | 'acl' | 'openreview' | 'semantic-scholar' | 'direct-pdf' | 'upload';
  pdfUrl?: string;
  metadata?: {
    title?: string;
    authors?: string[];
    abstract?: string;
    publishedDate?: string;
    venue?: string;
  };
}

function resolveUrl(input: string): Promise<ResolvedPaper>;
```

### 1.2 Direct PDF URL

Simple case - validate URL ends with `.pdf` or has `Content-Type: application/pdf`.

### 1.3 File Upload

```typescript
// Max file size: 20MB (reasonable for academic papers)
const MAX_FILE_SIZE = 20 * 1024 * 1024;

// Accepted MIME types
const ACCEPTED_TYPES = ['application/pdf'];
```

**Security Considerations**:
- Validate MIME type on both client and server
- Check PDF magic bytes (`%PDF-` header)
- Scan for malformed PDFs
- Don't store uploaded files permanently (process in memory)

---

## 2. PDF Fetcher

### 2.1 Fetching Strategy

```typescript
// src/lib/paper-reader/pdf-fetcher.ts

interface FetchResult {
  buffer: ArrayBuffer;
  contentType: string;
  contentLength: number;
  source: 'cache' | 'fetch' | 'upload';
}

async function fetchPdf(url: string): Promise<FetchResult>;
async function handleUpload(file: File): Promise<FetchResult>;
```

### 2.2 Caching Strategy

**Question**: Where to cache?

| Option | Pros | Cons |
|--------|------|------|
| In-memory (LRU) | Fast, simple | Lost on restart, memory pressure |
| Firestore | Persistent, queryable | 1MB doc limit, expensive for PDFs |
| Cloud Storage | Designed for files | Additional service, cost |
| No caching | Simplest | Repeated downloads |

**Recommendation**: Start with no caching. Add in-memory LRU cache later if needed.

### 2.3 Rate Limiting

Protect against abuse and respect upstream services:

```typescript
// Per-user limits
const RATE_LIMITS = {
  fetchesPerHour: 10,
  fetchesPerDay: 50,
  maxConcurrent: 2,
};
```

---

## 3. PDF Parser

### 3.1 Library Options

| Library | Pros | Cons |
|---------|------|------|
| `pdf-parse` | Simple API, popular | Text only, no layout |
| `pdfjs-dist` | Mozilla's library, accurate | Heavier, complex API |
| `pdf2json` | Preserves some layout | Less maintained |
| `unpdf` | Modern, good text extraction | Newer, less tested |

**Recommendation**: Start with `pdf-parse` for simplicity. Evaluate `pdfjs-dist` if text extraction quality is insufficient.

### 3.2 Text Extraction

```typescript
// src/lib/paper-reader/pdf-parser.ts

interface ParsedPaper {
  text: string;              // Full extracted text
  pageCount: number;
  metadata: {
    title?: string;          // From PDF metadata
    author?: string;
    creationDate?: string;
  };
  sections?: Section[];      // If we can detect structure
}

interface Section {
  heading: string;
  content: string;
  page: number;
}

async function parsePdf(buffer: ArrayBuffer): Promise<ParsedPaper>;
```

### 3.3 Full-Text Processing

The READER tier uses Gemini 1.5 Pro with a **2M token context window**. Since academic papers are typically 10-50 pages (~10,000-50,000 tokens), we can always send the full text in a single pass without chunking.

This simplifies the architecture significantly - no need for multi-pass analysis or smart sampling strategies.

---

## 4. AI Analyzer

### 4.1 Analysis Prompt

```typescript
const ANALYSIS_PROMPT = `
Analyze this academic paper and provide a structured analysis:

## Paper Content
{paper_text}

## Required Analysis

Please provide:

### Summary
2-3 sentences summarizing the paper's main contribution.

### Problem Statement
What problem does this paper address? Why is it important?

### Key Contributions
- Bullet point list of main contributions

### Methodology
Describe the technical approach, methods, or algorithms used.

### Results
Key findings, metrics, and experimental results.

### Limitations
What are the acknowledged or apparent limitations?

### Future Work
What directions for future research are suggested?

### Key Takeaways
3-5 bullet points: What should a reader remember from this paper?
`;
```

### 4.2 Model Selection

**New Model Tier: READER**

Paper Reader introduces a new model tier optimized for long-context processing:

| Tier | Model | Context Window | Use Case |
|------|-------|----------------|----------|
| `ModelTier.READER` | Gemini 1.5 Pro | 2M tokens | Paper analysis (long documents) |
| `ModelTier.MAIN` | Gemini 2.5 Flash | 1M tokens | Chat (existing) |
| `ModelTier.LITE` | Gemini 2.5 Flash Lite | 1M tokens | Quick analysis (existing) |

**Why Gemini 1.5 Pro for READER?**
- Optimized for long-context understanding
- 2M token context window (handles any paper)
- Better at maintaining coherence across long documents
- Specifically tuned for document comprehension tasks

```typescript
// Update to src/config/models.ts
export enum ModelTier {
  MAIN = 'main',
  IMAGE = 'image',
  LITE = 'lite',
  READER = 'reader',  // NEW
}

export const MODEL_CONFIG: Record<ModelTier, ModelConfig> = {
  // ... existing tiers
  [ModelTier.READER]: {
    modelId: 'gemini-1.5-pro',
    description: 'Long-context reader optimized for documents',
    contextWindow: 2_000_000,
  },
};
```

### 4.3 Structured Output

Use Gemini's structured output mode for consistent formatting:

```typescript
const analysisSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    problemStatement: { type: "string" },
    keyContributions: {
      type: "array",
      items: { type: "string" }
    },
    methodology: { type: "string" },
    results: { type: "string" },
    limitations: { type: "string" },
    futureWork: { type: "string" },
    keyTakeaways: {
      type: "array",
      items: { type: "string" }
    },
  },
  required: ["summary", "keyContributions", "keyTakeaways"]
};
```

---

## 5. Output & Whim Integration

### 5.1 Display Format

```
┌─────────────────────────────────────────────────────────────────┐
│  📄 [Paper Title]                                                │
│  Authors: [Author List]                                          │
│  Published: [Date] | Venue: [Conference/Journal]                 │
│  Source: [arXiv:XXXX.XXXXX]                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ## Summary                                                      │
│  [2-3 sentence summary]                                          │
│                                                                  │
│  ## Problem Statement                                            │
│  [Problem description]                                           │
│                                                                  │
│  ## Key Contributions                                            │
│  • [Contribution 1]                                              │
│  • [Contribution 2]                                              │
│  • [Contribution 3]                                              │
│                                                                  │
│  ## Methodology                                                  │
│  [Technical approach]                                            │
│                                                                  │
│  ## Results                                                      │
│  [Key findings]                                                  │
│                                                                  │
│  ## Limitations                                                  │
│  [Acknowledged weaknesses]                                       │
│                                                                  │
│  ## Future Work                                                  │
│  [Suggested directions]                                          │
│                                                                  │
│  ## Key Takeaways                                                │
│  • [Takeaway 1]                                                  │
│  • [Takeaway 2]                                                  │
│                                                                  │
│  ## My Notes                                                     │
│  [Editable area for user annotations]                            │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  [Save as Whim]  [Copy Markdown]  [Analyze Another]              │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Concrete Example: "Attention Is All You Need"

Here's what an actual analysis looks like:

```
┌─────────────────────────────────────────────────────────────────┐
│  📄 Attention Is All You Need                                   │
│  Authors: Vaswani, Shazeer, Parmar, Uszkoreit, Jones, et al.   │
│  Published: 2017 | Venue: NeurIPS                               │
│  Source: arXiv:1706.03762                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ## Summary                                                      │
│  This paper introduces the Transformer, a novel architecture    │
│  that relies entirely on self-attention mechanisms, dispensing  │
│  with recurrence and convolutions. It achieves state-of-the-art │
│  results on machine translation while being more parallelizable.│
│                                                                  │
│  ## Problem Statement                                            │
│  Sequential models like RNNs and LSTMs have inherent            │
│  limitations: they process tokens sequentially, preventing      │
│  parallelization and struggling with long-range dependencies.   │
│                                                                  │
│  ## Key Contributions                                            │
│  • Introduced the Transformer architecture based solely on      │
│    attention mechanisms                                          │
│  • Proposed multi-head attention to jointly attend to           │
│    information from different representation subspaces          │
│  • Achieved 28.4 BLEU on WMT 2014 English-to-German translation │
│  • Reduced training time significantly through parallelization  │
│                                                                  │
│  ## Methodology                                                  │
│  The Transformer uses an encoder-decoder structure with         │
│  stacked self-attention and point-wise fully connected layers.  │
│  Key components include:                                         │
│  - Scaled dot-product attention: Attention(Q,K,V) = softmax(QK^T/√d_k)V
│  - Multi-head attention: 8 parallel attention layers            │
│  - Positional encoding: sine/cosine functions for position info │
│                                                                  │
│  ## Results                                                      │
│  - WMT 2014 EN-DE: 28.4 BLEU (new SOTA, +2.0 over previous)    │
│  - WMT 2014 EN-FR: 41.0 BLEU (new SOTA)                         │
│  - Training time: 3.5 days on 8 P100 GPUs                       │
│  - 10x less training cost than competing models                  │
│                                                                  │
│  ## Limitations                                                  │
│  - Memory grows quadratically with sequence length (O(n²))      │
│  - Positional encodings are fixed, not learned                  │
│  - Evaluated primarily on translation tasks                      │
│                                                                  │
│  ## Future Work                                                  │
│  - Apply to other modalities (images, audio, video)             │
│  - Investigate local attention for very long sequences          │
│  - Explore learned positional representations                    │
│                                                                  │
│  ## Key Takeaways                                                │
│  • Self-attention can fully replace recurrence for seq2seq      │
│  • Parallelization dramatically speeds up training              │
│  • Multi-head attention captures different types of relations   │
│  • This architecture became the foundation for BERT, GPT, etc.  │
│                                                                  │
│  ## My Notes                                                     │
│  [Empty - user can add their own annotations here]              │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  [Save as Whim]  [Copy Markdown]  [Analyze Another]              │
└─────────────────────────────────────────────────────────────────┘
```

**API Response (JSON)**:

```json
{
  "metadata": {
    "title": "Attention Is All You Need",
    "authors": ["Vaswani", "Shazeer", "Parmar", "Uszkoreit", "Jones", "..."],
    "publishedDate": "2017",
    "venue": "NeurIPS",
    "sourceUrl": "https://arxiv.org/abs/1706.03762",
    "arxivId": "1706.03762"
  },
  "analysis": {
    "summary": "This paper introduces the Transformer, a novel architecture that relies entirely on self-attention mechanisms, dispensing with recurrence and convolutions. It achieves state-of-the-art results on machine translation while being more parallelizable.",
    "problemStatement": "Sequential models like RNNs and LSTMs have inherent limitations: they process tokens sequentially, preventing parallelization and struggling with long-range dependencies.",
    "keyContributions": [
      "Introduced the Transformer architecture based solely on attention mechanisms",
      "Proposed multi-head attention to jointly attend to information from different representation subspaces",
      "Achieved 28.4 BLEU on WMT 2014 English-to-German translation",
      "Reduced training time significantly through parallelization"
    ],
    "methodology": "The Transformer uses an encoder-decoder structure with stacked self-attention and point-wise fully connected layers. Key components include scaled dot-product attention, multi-head attention (8 parallel layers), and positional encoding using sine/cosine functions.",
    "results": "WMT 2014 EN-DE: 28.4 BLEU (new SOTA, +2.0 over previous). WMT 2014 EN-FR: 41.0 BLEU (new SOTA). Training time: 3.5 days on 8 P100 GPUs. 10x less training cost than competing models.",
    "limitations": "Memory grows quadratically with sequence length (O(n²)). Positional encodings are fixed, not learned. Evaluated primarily on translation tasks.",
    "futureWork": "Apply to other modalities (images, audio, video). Investigate local attention for very long sequences. Explore learned positional representations.",
    "keyTakeaways": [
      "Self-attention can fully replace recurrence for seq2seq",
      "Parallelization dramatically speeds up training",
      "Multi-head attention captures different types of relations",
      "This architecture became the foundation for BERT, GPT, etc."
    ]
  }
}
```

### 5.3 Whim Conversion

When user clicks "Save as Whim", convert to TipTap JSON blocks:

```typescript
// src/lib/paper-reader/whim-converter.ts

function analysisToWhimBlocks(analysis: PaperAnalysis): TipTapBlock[] {
  return [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: analysis.title }] },
    { type: 'paragraph', content: [{ type: 'text', text: `Authors: ${analysis.authors.join(', ')}` }] },
    // ... more blocks for each section
  ];
}
```

### 5.4 Metadata Storage

Store paper metadata for future reference:

```typescript
interface PaperWhimMetadata {
  type: 'paper-analysis';
  sourceUrl?: string;
  arxivId?: string;
  doi?: string;
  authors: string[];
  publishedDate?: string;
  venue?: string;
  analyzedAt: Date;
}
```

---

## 6. API Design

### 6.1 Endpoints

```
POST /api/paper/analyze
  Body: { url: string } | FormData with file
  Response: { jobId: string }

GET /api/paper/progress/:jobId  (SSE)
  Response: Stream of { stage, progress, result?, error? }

GET /api/paper/result/:jobId
  Response: { status, analysis?, error? }
  (For clients that don't support SSE)
```

### 6.2 Processing Flow (Async with Progress Tracking)

Paper analysis uses async processing with real-time progress updates:

```
┌─────────┐      POST /api/paper/analyze      ┌─────────┐
│ Client  │ ─────────────────────────────────▶│ Server  │
│         │◀───────────────────────────────── │         │
│         │      { jobId: "abc123" }          │         │
└────┬────┘                                   └────┬────┘
     │                                              │
     │         SSE: /api/paper/progress/abc123      │
     │◀─────────────────────────────────────────────│
     │  { stage: "fetching", progress: 10 }         │
     │◀─────────────────────────────────────────────│
     │  { stage: "parsing", progress: 30 }          │
     │◀─────────────────────────────────────────────│
     │  { stage: "analyzing", progress: 60 }        │
     │◀─────────────────────────────────────────────│
     │  { stage: "complete", progress: 100,         │
     │    analysis: { ... } }                       │
     ▼                                              ▼
```

**Processing Stages**:

| Stage | Progress | Description |
|-------|----------|-------------|
| `validating` | 0-5% | Validate URL/file |
| `fetching` | 5-20% | Download PDF |
| `parsing` | 20-40% | Extract text |
| `analyzing` | 40-95% | AI analysis |
| `formatting` | 95-100% | Format output |
| `complete` | 100% | Done |
| `error` | - | Failed |

**Implementation**:

```typescript
// Job status stored in memory (or Redis for multi-instance)
interface AnalysisJob {
  id: string;
  userId: string;
  status: 'pending' | 'processing' | 'complete' | 'error';
  stage: string;
  progress: number;
  result?: PaperAnalysis;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Progress updates via Server-Sent Events (SSE)
// src/app/api/paper/progress/[jobId]/route.ts
export async function GET(req: Request, { params }: { params: { jobId: string } }) {
  const stream = new ReadableStream({
    start(controller) {
      const interval = setInterval(() => {
        const job = getJob(params.jobId);
        controller.enqueue(`data: ${JSON.stringify(job)}\n\n`);
        if (job.status === 'complete' || job.status === 'error') {
          clearInterval(interval);
          controller.close();
        }
      }, 500);
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' }
  });
}
```

**UI Progress Indicator**:

```
┌─────────────────────────────────────────────────────────────────┐
│  Analyzing paper...                                              │
│                                                                  │
│  [████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░] 35%                  │
│                                                                  │
│  📥 Fetching PDF ✓                                               │
│  📄 Parsing content ✓                                            │
│  🤖 Analyzing with AI...                                         │
│  📝 Formatting output                                            │
│                                                                  │
│  Estimated time remaining: ~30 seconds                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. File Structure

```
src/lib/paper-reader/
├── index.ts                 # Public exports
├── url-resolver.ts          # URL parsing and PDF URL extraction
├── pdf-fetcher.ts           # PDF downloading and caching
├── pdf-parser.ts            # PDF text extraction
├── analyzer.ts              # AI analysis logic
├── whim-converter.ts        # Convert analysis to Whim blocks
├── types.ts                 # TypeScript interfaces
└── platforms/               # Platform-specific parsers
    ├── arxiv.ts
    ├── acl.ts
    ├── openreview.ts
    └── semantic-scholar.ts

src/app/
├── paper/
│   └── page.tsx             # Paper Reader UI
└── api/paper/
    ├── analyze/route.ts     # Start analysis, returns jobId
    ├── progress/[jobId]/route.ts  # SSE progress stream
    └── result/[jobId]/route.ts    # Get final result (fallback)

src/components/paper-reader/
├── PaperInput.tsx           # URL input + file upload
├── PaperAnalysis.tsx        # Analysis display
└── PaperActions.tsx         # Save/Copy/Share buttons
```

---

## 8. Error Handling

| Error | User Message | Action |
|-------|--------------|--------|
| Invalid URL | "Please enter a valid paper URL" | Show input error |
| PDF fetch failed | "Couldn't download the paper. Check the URL or try uploading." | Suggest upload |
| PDF parse failed | "Couldn't read this PDF. It may be scanned or protected." | Explain limitation |
| Rate limited | "You've analyzed many papers today. Try again in X hours." | Show limit info |
| Analysis failed | "Analysis failed. Please try again." | Offer retry |
| File too large | "File is too large (max 20MB)" | Show limit |

---

## 9. Security Considerations

1. **URL Validation**: Only allow HTTP(S) URLs
2. **SSRF Prevention**: Block internal/private IP ranges
3. **File Validation**: Check PDF magic bytes, not just extension
4. **Rate Limiting**: Prevent abuse
5. **No Persistent Storage**: Don't store uploaded PDFs
6. **Sanitize Output**: Clean AI output before display

---

## 10. Decisions & Open Questions

### Decided

| Question | Decision | Notes |
|----------|----------|-------|
| Async vs Sync Processing | **Async with SSE progress tracking** | See Section 6.2 |
| Model for Analysis | **Gemini 1.5 Pro (READER tier)** | 2M context, optimized for long docs |

### Open Questions (To Be Discussed Later)

1. **PDF Text Quality**
   - How to handle scanned PDFs (images)?
   - OCR needed? (adds complexity)

2. **Math and Figures**
   - Ignore figures for now?
   - Extract figure captions?
   - How to represent equations in text?

3. **Caching Strategy**
   - Cache parsed text? Cache analysis?
   - Cache key: URL hash? Content hash?

4. **Citation Extraction**
   - Extract and link references?
   - Would require parsing bibliography

5. **Multi-Language Papers**
   - Support non-English papers?
   - Auto-detect and translate?

6. **Batch Processing**
   - Analyze multiple papers?
   - Compare papers?

7. **Integration with Memory**
   - Auto-save paper summaries to memory?
   - Link related papers?

---

## 11. Implementation Phases

### Phase 1: MVP
- [ ] URL input (arXiv only)
- [ ] PDF fetching
- [ ] Basic text extraction
- [ ] AI analysis with structured output
- [ ] Display results
- [ ] Save as Whim

### Phase 2: Enhanced Input
- [ ] Direct PDF URL support
- [ ] File upload
- [ ] More platforms (ACL, OpenReview)
- [ ] Better metadata extraction

### Phase 3: Polish
- [ ] Progress indicator
- [ ] Error handling improvements
- [ ] Rate limiting
- [ ] Caching

### Phase 4: Advanced Features
- [ ] Citation extraction
- [ ] Figure caption extraction
- [ ] Batch processing
- [ ] Memory integration

---

**Created**: December 1, 2025
**Status**: Draft - Awaiting Review
