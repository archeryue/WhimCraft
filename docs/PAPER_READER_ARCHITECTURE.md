# Paper Reader Architecture

This document details the implementation architecture for the Paper Reader feature.

## Overview

Paper Reader uses a **Workflow Agent** pattern to analyze academic papers. It combines deterministic extraction phases with a ReAct agent for intelligent analysis, producing structured outputs that can be saved as Whims.

```
┌─────────────────────────────────────────────────────────────────┐
│                      PAPER READER AGENT                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Phase 1: EXTRACTION (Deterministic)                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  URL → pdf_fetch → text_extract → metadata + full text  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  Phase 2: ANALYSIS (ReAct Agent)                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Agent reasons about paper type                          │    │
│  │       │                                                  │    │
│  │       ▼                                                  │    │
│  │  REASON → SELECT TOOL → OBSERVE → REASON → ...          │    │
│  │       │                                                  │    │
│  │       ▼                                                  │    │
│  │  Tools: text_extract, figure_extract, web_search, etc.  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  Phase 3: SYNTHESIS (Deterministic)                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Combine tool outputs → structured analysis → Whim      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. General-Purpose PDF Tools

These tools are **reusable across different agent scenarios** (paper reader, contract analyzer, manual reader, etc.).

### 1.1 Tool Definitions

```typescript
// src/lib/agent/tools/pdf-tools.ts

/**
 * pdf_fetch - Fetch PDF from URL
 *
 * Downloads a PDF file and returns it as a buffer for processing.
 * Validates PDF format and enforces size limits.
 */
interface PdfFetchTool {
  name: "pdf_fetch";
  description: "Fetch a PDF document from a URL";
  parameters: {
    url: string;  // The PDF URL to fetch
  };
  returns: {
    success: boolean;
    buffer?: ArrayBuffer;
    contentLength?: number;
    error?: string;
  };
}

/**
 * text_extract - Extract text from PDF
 *
 * Extracts text content from a PDF buffer. Supports full extraction
 * or targeted extraction by page range or section.
 */
interface TextExtractTool {
  name: "text_extract";
  description: "Extract text content from a PDF document";
  parameters: {
    target?: "full" | "pages" | "section";  // Default: "full"
    pages?: { start: number; end: number }; // For target: "pages"
    section?: string;                        // For target: "section" (e.g., "abstract", "methods")
  };
  returns: {
    success: boolean;
    text?: string;
    pageCount?: number;
    metadata?: {
      title?: string;
      author?: string;
      creationDate?: string;
    };
    error?: string;
  };
}

/**
 * figure_extract - Extract figures from PDF
 *
 * Extracts images and figures from a PDF, optionally with captions.
 * Returns base64-encoded images for multimodal analysis.
 */
interface FigureExtractTool {
  name: "figure_extract";
  description: "Extract figures and images from a PDF document";
  parameters: {
    pages?: { start: number; end: number };  // Optional page range
    includeCaption?: boolean;                 // Try to extract captions
    maxFigures?: number;                      // Limit number of figures (default: 10)
  };
  returns: {
    success: boolean;
    figures?: Array<{
      page: number;
      imageBase64: string;
      caption?: string;
      dimensions: { width: number; height: number };
    }>;
    error?: string;
  };
}
```

### 1.2 Existing Tools (Reused from Chat Agent)

| Tool | Description | Location |
|------|-------------|----------|
| `web_search` | Search the web for information | `src/lib/agent/tools/web-search.ts` |
| `web_fetch` | Fetch and parse web page content | `src/lib/agent/tools/web-fetch.ts` |

---

## 2. Paper Reader Agent

### 2.1 Agent Configuration

```typescript
// src/lib/agent/configs/paper-reader.ts

export const PAPER_READER_AGENT_CONFIG = {
  name: "paper-reader",
  description: "Analyzes academic papers with structured output",

  systemPrompt: `You are an expert academic paper analyst. Your task is to
thoroughly analyze research papers and extract key insights.

When analyzing a paper:
1. First understand the paper type (methods, empirical, survey, theoretical)
2. Use appropriate tools to extract and analyze different sections
3. Adapt your analysis depth based on the paper's focus
4. Provide concrete, specific insights rather than generic summaries

You have access to tools for extracting text, figures, and searching for
related work. Use them strategically based on what the paper emphasizes.`,

  tools: [
    "pdf_fetch",
    "text_extract",
    "figure_extract",
    "web_search",
    "web_fetch",
  ],

  model: ModelTier.READER,  // Gemini 2.5 Flash (1M context)

  maxIterations: 10,  // Max ReAct loops
};
```

### 2.2 Skills (Prompt Templates)

Skills are specialized prompts that guide the agent's analysis for specific aspects of a paper.

```typescript
// src/lib/agent/skills/paper-analysis.ts

export const PAPER_ANALYSIS_SKILLS = {
  /**
   * Contribution Analysis
   * Focus: Problem statement, novelty, key contributions
   */
  contributions: {
    name: "contribution_analysis",
    prompt: `Analyze the paper's contributions:

1. What specific problem does this paper address?
2. Why is this problem important or challenging?
3. What are the key contributions (list 3-5)?
4. What is novel compared to prior work?

Use text_extract to focus on the abstract and introduction sections.
Be specific - cite concrete claims, not vague statements.`,
  },

  /**
   * Methodology Analysis
   * Focus: Technical approach, algorithms, architecture
   */
  methodology: {
    name: "methodology_analysis",
    prompt: `Analyze the paper's methodology:

1. What is the core technical approach?
2. Describe the key algorithm, model, or framework
3. What are the important design choices and why?
4. Are there any assumptions or constraints?

Use text_extract on the methods/approach section.
Use figure_extract if there are architecture diagrams.
Be technical but accessible.`,
  },

  /**
   * Experiments Analysis
   * Focus: Results, comparisons, ablations
   */
  experiments: {
    name: "experiments_analysis",
    prompt: `Analyze the paper's experimental results:

1. What datasets/benchmarks were used?
2. What are the main results and metrics?
3. How does it compare to baselines/prior work?
4. Are there ablation studies? What do they show?

Use text_extract on the experiments/results section.
Use figure_extract for result tables and charts.
Include specific numbers where available.`,
  },

  /**
   * Related Work Analysis
   * Focus: Positioning, connections, gaps
   */
  relatedWork: {
    name: "related_work_analysis",
    prompt: `Analyze how this paper relates to prior work:

1. What are the main related approaches?
2. How does this work differ from or build on them?
3. What gap in the literature does it address?

Use text_extract on the related work section.
Optionally use web_search for context on cited papers.
Focus on positioning, not just listing papers.`,
  },

  /**
   * Figure Analysis
   * Focus: Key visualizations and their insights
   */
  figures: {
    name: "figure_analysis",
    prompt: `Analyze the key figures in this paper:

1. Identify the most important figures/tables
2. What does each key figure show?
3. What insights can be drawn from the visualizations?

Use figure_extract to get the figures.
Focus on figures that convey core ideas or results.`,
  },
};
```

---

## 3. Workflow Phases

### 3.1 Phase 1: Extraction (Deterministic)

This phase always runs and extracts basic content from the PDF.

```typescript
// src/lib/paper-reader/workflow.ts

interface ExtractionResult {
  pdfBuffer: ArrayBuffer;
  fullText: string;
  pageCount: number;
  metadata: {
    title?: string;
    authors?: string[];
    arxivId?: string;
    sourceUrl: string;
  };
  abstract?: string;
  conclusion?: string;
}

async function phase1_extraction(url: string): Promise<ExtractionResult> {
  // 1. Fetch PDF
  const pdfResult = await tools.pdf_fetch({ url });

  // 2. Extract full text
  const textResult = await tools.text_extract({
    buffer: pdfResult.buffer,
    target: "full"
  });

  // 3. Try to extract abstract and conclusion specifically
  const abstract = await tools.text_extract({
    buffer: pdfResult.buffer,
    target: "section",
    section: "abstract"
  });

  const conclusion = await tools.text_extract({
    buffer: pdfResult.buffer,
    target: "section",
    section: "conclusion"
  });

  return {
    pdfBuffer: pdfResult.buffer,
    fullText: textResult.text,
    pageCount: textResult.pageCount,
    metadata: extractMetadata(url, textResult),
    abstract: abstract.text,
    conclusion: conclusion.text,
  };
}
```

### 3.2 Phase 2: Analysis (ReAct Agent)

The agent reasons about the paper and selects appropriate skills/tools.

```typescript
// Agent's reasoning process (conceptual)

// Agent receives: paper metadata, abstract, conclusion, full text available

// Agent reasons:
// "This paper has 'Transformer' in the title and mentions 'attention mechanism'
//  in the abstract. It appears to be a methods paper introducing a new architecture.
//  I should focus on methodology analysis and experiment results."

// Agent actions:
// 1. Use text_extract on methods section → analyze methodology
// 2. Use figure_extract → get architecture diagram
// 3. Use text_extract on experiments → analyze results
// 4. (Optional) Use web_search for context on prior attention mechanisms

// Agent continues until it has sufficient coverage of key aspects
```

**ReAct Loop:**

```
┌─────────────────────────────────────────────────────────────┐
│  THOUGHT: "This is a methods paper, I should analyze the    │
│           architecture first"                                │
│                                                              │
│  ACTION: text_extract(section="methods")                     │
│                                                              │
│  OBSERVATION: "The Transformer uses self-attention..."      │
│                                                              │
│  THOUGHT: "I see there's a figure reference. Let me         │
│           extract the architecture diagram"                  │
│                                                              │
│  ACTION: figure_extract(pages={1,3})                         │
│                                                              │
│  OBSERVATION: [Figure showing encoder-decoder architecture]  │
│                                                              │
│  THOUGHT: "Now I understand the architecture. Let me        │
│           check the experimental results"                    │
│                                                              │
│  ACTION: text_extract(section="experiments")                 │
│                                                              │
│  ... continues until complete ...                            │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Phase 3: Synthesis (Deterministic)

Combine all agent outputs into a structured analysis.

```typescript
interface PaperAnalysis {
  metadata: {
    title: string;
    authors: string[];
    publishedDate?: string;
    venue?: string;
    sourceUrl: string;
    arxivId?: string;
  };
  analysis: {
    summary: string;           // 2-3 sentence overview
    problemStatement: string;  // Problem and importance
    keyContributions: string[]; // Main contributions
    methodology: string;       // Technical approach
    results: string;           // Key findings
    limitations: string;       // Weaknesses
    futureWork: string;        // Suggested directions
    keyTakeaways: string[];    // What to remember
  };
  figures?: Array<{            // Key figures analyzed
    description: string;
    insight: string;
  }>;
}

async function phase3_synthesis(
  extractionResult: ExtractionResult,
  agentOutputs: AgentToolOutputs[]
): Promise<PaperAnalysis> {
  // Combine agent's analysis outputs into structured format
  // Use LITE model for final synthesis to save cost

  const synthesisPrompt = buildSynthesisPrompt(extractionResult, agentOutputs);
  const result = await generateStructuredOutput(synthesisPrompt, analysisSchema);

  return result;
}
```

---

## 4. File Structure

```
src/lib/
├── agent/
│   ├── tools/
│   │   ├── pdf-fetch.ts        # NEW: Fetch PDF from URL
│   │   ├── text-extract.ts     # NEW: Extract text from PDF
│   │   ├── figure-extract.ts   # NEW: Extract figures from PDF
│   │   ├── web-search.ts       # Existing
│   │   └── web-fetch.ts        # Existing
│   ├── skills/
│   │   └── paper-analysis.ts   # NEW: Paper analysis skill prompts
│   └── configs/
│       └── paper-reader.ts     # NEW: Paper reader agent config
│
├── paper-reader/
│   ├── index.ts                # Public exports
│   ├── workflow.ts             # NEW: 3-phase workflow orchestration
│   ├── url-resolver.ts         # URL parsing (arXiv, etc.)
│   ├── whim-converter.ts       # Convert analysis to Whim
│   └── types.ts                # TypeScript interfaces

src/app/
├── paper/
│   └── page.tsx                # Paper Reader UI
└── api/paper/
    ├── analyze/route.ts        # SSE streaming endpoint
    └── save-whim/route.ts      # Save analysis as Whim
```

---

## 5. Tool Implementation Details

### 5.1 pdf_fetch

```typescript
// src/lib/agent/tools/pdf-fetch.ts

import { ToolDefinition } from "../core/types";

const MAX_PDF_SIZE = 50 * 1024 * 1024; // 50MB limit

export const pdfFetchTool: ToolDefinition = {
  name: "pdf_fetch",
  description: "Fetch a PDF document from a URL. Returns the PDF as a buffer for further processing.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL of the PDF to fetch",
      },
    },
    required: ["url"],
  },

  execute: async ({ url }, context) => {
    // Validate URL
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return { success: false, error: "Only HTTP(S) URLs are supported" };
    }

    // SSRF prevention - block private IPs
    if (isPrivateIP(parsedUrl.hostname)) {
      return { success: false, error: "Cannot fetch from private addresses" };
    }

    // Fetch with timeout
    const response = await fetch(url, {
      headers: { "User-Agent": "WhimCraft-PaperReader/1.0" },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return { success: false, error: `Fetch failed: ${response.status}` };
    }

    // Validate content type
    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("application/pdf")) {
      return { success: false, error: "URL does not point to a PDF" };
    }

    // Check size
    const contentLength = parseInt(response.headers.get("content-length") || "0");
    if (contentLength > MAX_PDF_SIZE) {
      return { success: false, error: `PDF too large (max ${MAX_PDF_SIZE / 1024 / 1024}MB)` };
    }

    const buffer = await response.arrayBuffer();

    // Validate PDF magic bytes
    const header = new Uint8Array(buffer.slice(0, 5));
    const pdfHeader = "%PDF-";
    if (String.fromCharCode(...header) !== pdfHeader) {
      return { success: false, error: "Invalid PDF format" };
    }

    // Store buffer in context for subsequent tools
    context.pdfBuffer = buffer;

    return {
      success: true,
      contentLength: buffer.byteLength,
      message: `Fetched PDF (${(buffer.byteLength / 1024).toFixed(0)} KB)`,
    };
  },
};
```

### 5.2 text_extract

```typescript
// src/lib/agent/tools/text-extract.ts

import pdfParse from "pdf-parse";
import { ToolDefinition } from "../core/types";

export const textExtractTool: ToolDefinition = {
  name: "text_extract",
  description: "Extract text content from the fetched PDF. Can extract full text, specific pages, or attempt to find a named section.",
  parameters: {
    type: "object",
    properties: {
      target: {
        type: "string",
        enum: ["full", "pages", "section"],
        description: "What to extract: full document, page range, or named section",
        default: "full",
      },
      pages: {
        type: "object",
        properties: {
          start: { type: "number" },
          end: { type: "number" },
        },
        description: "Page range (1-indexed). Required if target is 'pages'",
      },
      section: {
        type: "string",
        description: "Section name to find (e.g., 'abstract', 'methods', 'conclusion'). Required if target is 'section'",
      },
    },
  },

  execute: async ({ target = "full", pages, section }, context) => {
    if (!context.pdfBuffer) {
      return { success: false, error: "No PDF loaded. Use pdf_fetch first." };
    }

    try {
      const data = await pdfParse(Buffer.from(context.pdfBuffer));

      let extractedText = data.text;

      // Handle page extraction
      if (target === "pages" && pages) {
        // Note: pdf-parse doesn't support per-page extraction directly
        // Would need pdfjs-dist for page-level control
        // For now, return full text with note
        extractedText = data.text;
      }

      // Handle section extraction
      if (target === "section" && section) {
        extractedText = extractSection(data.text, section);
      }

      return {
        success: true,
        text: extractedText,
        pageCount: data.numpages,
        metadata: {
          title: data.info?.Title,
          author: data.info?.Author,
          creationDate: data.info?.CreationDate,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Text extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  },
};

function extractSection(text: string, sectionName: string): string {
  // Common section patterns in academic papers
  const patterns = [
    new RegExp(`\\b${sectionName}\\b[\\s\\n]*([\\s\\S]*?)(?=\\n\\s*(?:introduction|related work|method|approach|experiment|result|conclusion|reference|acknowledgment)\\b|$)`, "i"),
    new RegExp(`\\d+\\.?\\s*${sectionName}[\\s\\n]*([\\s\\S]*?)(?=\\n\\s*\\d+\\.?\\s*[a-z]|$)`, "i"),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1]?.trim() || match[0];
    }
  }

  return `Could not find section: ${sectionName}`;
}
```

### 5.3 figure_extract

**Library Choice: PyMuPDF (fitz)**

PyMuPDF is the best library for figure extraction because:
- `cluster_drawings()` detects vector figures (charts, diagrams) automatically
- Renders pages exactly like a PDF viewer
- High-resolution output with zoom matrix

Since PyMuPDF is Python, we implement this as a **Python service** called from Node.js.

```python
# src/services/pdf-figures/extract.py

import fitz  # PyMuPDF
import base64
import json
from io import BytesIO

def extract_figures(pdf_bytes: bytes, max_figures: int = 10, zoom: float = 3.0):
    """
    Extract vector figures from PDF using cluster_drawings().

    Args:
        pdf_bytes: PDF file as bytes
        max_figures: Maximum figures to extract
        zoom: Resolution multiplier (3.0 = Retina quality)

    Returns:
        List of figures with base64 images and metadata
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    figures = []

    for page_index, page in enumerate(doc):
        if len(figures) >= max_figures:
            break

        # Strategy A: Automatic Vector Detection
        # cluster_drawings() groups nearby vector lines into bounding boxes
        drawing_rects = page.cluster_drawings(tolerance=10)

        for i, rect in enumerate(drawing_rects):
            if len(figures) >= max_figures:
                break

            # Filter out tiny elements (page numbers, lines)
            if rect.width < 100 or rect.height < 100:
                continue

            # High-resolution render (zoom = 3x for crisp output)
            zoom_matrix = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=zoom_matrix, clip=rect)

            # Convert to base64
            img_bytes = pix.tobytes("png")
            img_base64 = base64.b64encode(img_bytes).decode("utf-8")

            figures.append({
                "page": page_index + 1,
                "imageBase64": img_base64,
                "dimensions": {
                    "width": int(rect.width * zoom),
                    "height": int(rect.height * zoom)
                },
                "bounds": {
                    "x0": rect.x0,
                    "y0": rect.y0,
                    "x1": rect.x1,
                    "y1": rect.y1
                }
            })

        # Strategy B: Caption Search (fallback if cluster_drawings finds nothing)
        if not drawing_rects:
            for caption in ["Figure", "Fig."]:
                text_instances = page.search_for(caption)
                for inst_rect in text_instances:
                    if len(figures) >= max_figures:
                        break

                    # Figure is typically above the caption
                    figure_rect = fitz.Rect(
                        50,                          # Left margin
                        max(0, inst_rect.y0 - 300),  # Above caption
                        page.rect.width - 50,        # Right margin
                        inst_rect.y0                 # Top of caption
                    )

                    zoom_matrix = fitz.Matrix(zoom, zoom)
                    pix = page.get_pixmap(matrix=zoom_matrix, clip=figure_rect)

                    img_bytes = pix.tobytes("png")
                    img_base64 = base64.b64encode(img_bytes).decode("utf-8")

                    figures.append({
                        "page": page_index + 1,
                        "imageBase64": img_base64,
                        "dimensions": {
                            "width": int(figure_rect.width * zoom),
                            "height": int(figure_rect.height * zoom)
                        },
                        "captionHint": caption
                    })

    doc.close()
    return figures


# FastAPI endpoint (or Cloud Function)
from fastapi import FastAPI, UploadFile
app = FastAPI()

@app.post("/extract-figures")
async def extract_figures_endpoint(file: UploadFile, max_figures: int = 10):
    pdf_bytes = await file.read()
    figures = extract_figures(pdf_bytes, max_figures)
    return {"success": True, "figures": figures}
```

**Node.js Tool Wrapper:**

```typescript
// src/lib/agent/tools/figure-extract.ts

import { ToolDefinition } from "../core/types";

const FIGURE_SERVICE_URL = process.env.FIGURE_EXTRACT_SERVICE_URL;

export const figureExtractTool: ToolDefinition = {
  name: "figure_extract",
  description: "Extract figures and charts from the PDF using vector clustering. Returns high-resolution images.",
  parameters: {
    type: "object",
    properties: {
      maxFigures: {
        type: "number",
        description: "Maximum number of figures to extract. Default: 10",
        default: 10,
      },
    },
  },

  execute: async ({ maxFigures = 10 }, context) => {
    if (!context.pdfBuffer) {
      return { success: false, error: "No PDF loaded. Use pdf_fetch first." };
    }

    try {
      // Call Python service
      const formData = new FormData();
      formData.append("file", new Blob([context.pdfBuffer]), "paper.pdf");
      formData.append("max_figures", String(maxFigures));

      const response = await fetch(`${FIGURE_SERVICE_URL}/extract-figures`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Figure service error: ${response.status}`);
      }

      const result = await response.json();

      return {
        success: true,
        figures: result.figures,
        message: `Extracted ${result.figures.length} figures using vector clustering`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Figure extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};
```

**Deployment Options:**
1. **Cloud Run service** - Separate Python container for figure extraction
2. **Cloud Function** - Serverless Python function
3. **Subprocess** - Call Python script directly (simpler, same container)

---

## 6. API Design

### 6.1 Endpoints

```
POST /api/paper/analyze
  Body: { url: string }
  Response: SSE stream of progress events

POST /api/paper/save-whim
  Body: { analysis: PaperAnalysis }
  Response: { whimId: string }
```

### 6.2 Async Analysis with Progress Tracking

Analysis runs asynchronously, allowing users to switch tabs during processing.

**Job-based Architecture:**

```typescript
// POST /api/paper/analyze returns immediately with jobId
// Client polls or uses SSE to track progress

interface AnalysisJob {
  id: string;
  userId: string;
  status: "pending" | "running" | "complete" | "error";
  phase: "extraction" | "analysis" | "synthesis";
  progress: number;  // 0-100
  result?: PaperAnalysis;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Job stored in memory (or Redis for multi-instance)
// Survives tab switches - user can return to see results
```

**SSE Progress Events:**

```typescript
type ProgressEvent =
  | { phase: "extraction"; stage: string; progress: number; message: string }
  | { phase: "analysis"; stage: string; progress: number; thought?: string; action?: string }
  | { phase: "synthesis"; stage: string; progress: number; message: string }
  | { phase: "complete"; result: PaperAnalysis }
  | { phase: "error"; error: string };

// Example stream:
// data: {"phase":"extraction","stage":"fetching","progress":10,"message":"Downloading PDF..."}
// data: {"phase":"extraction","stage":"parsing","progress":30,"message":"Extracting text..."}
// data: {"phase":"analysis","stage":"reasoning","progress":50,"thought":"This is a methods paper..."}
// data: {"phase":"analysis","stage":"tool_call","progress":60,"action":"text_extract(section='methods')"}
// data: {"phase":"synthesis","stage":"formatting","progress":90,"message":"Generating summary..."}
// data: {"phase":"complete","result":{...}}
```

**UI Behavior:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Analyzing: "Attention Is All You Need"                          │
│                                                                  │
│  [████████████████░░░░░░░░░░░░░░░░░░░░░░] 45%                   │
│                                                                  │
│  Phase: Analysis                                                 │
│  🤔 "This is a methods paper introducing a new architecture..." │
│  🔧 Calling: text_extract(section="methods")                     │
│                                                                  │
│  ℹ️ You can switch tabs - we'll notify you when done            │
└─────────────────────────────────────────────────────────────────┘
```

- User can navigate away; analysis continues in background
- Browser notification when complete (if permitted)
- Job results cached for retrieval on return

---

## 7. Benefits of Agentic Architecture

| Aspect | Linear Pipeline | Workflow Agent |
|--------|-----------------|----------------|
| **Adaptability** | Fixed analysis | Adapts to paper type |
| **Depth** | Uniform coverage | Deep on important sections |
| **Tools** | Single-purpose | Reusable across agents |
| **Extensibility** | Change prompt | Add new tools/skills |
| **Observability** | Stage progress | Reasoning visible |
| **Follow-ups** | Not supported | Future: interactive Q&A |

---

## 8. Implementation Phases

### Phase 1: Core Tools (Current Sprint)
- [x] Existing MVP (linear pipeline)
- [ ] Implement `pdf_fetch` tool
- [ ] Implement `text_extract` tool
- [ ] Implement `figure_extract` tool
- [ ] Tool tests

### Phase 2: Agent Integration
- [ ] Paper reader agent config
- [ ] Skill prompts for paper analysis
- [ ] 3-phase workflow orchestration
- [ ] SSE progress with agent reasoning

### Phase 3: Polish & Testing
- [ ] Error handling improvements
- [ ] Performance optimization
- [ ] E2E tests for agent workflow
- [ ] UI updates for agent progress

### Phase 4: Advanced Features
- [ ] Interactive follow-up questions
- [ ] Multi-paper comparison
- [ ] Memory integration (save key papers)
- [ ] More input sources (ACL, OpenReview)

---

## 9. Security Considerations

1. **URL Validation**: Only allow HTTP(S) URLs
2. **SSRF Prevention**: Block private/internal IP ranges
3. **File Validation**: Check PDF magic bytes (`%PDF-`)
4. **Size Limits**: 50MB max for PDFs
5. **Rate Limiting**: 10 analyses per day per user
6. **No Persistent Storage**: Process PDFs in memory only
7. **Sanitize Output**: Clean AI output before display

---

## 10. Decisions & Open Questions

### Decided

| Question | Decision | Notes |
|----------|----------|-------|
| Figure Extraction | **PyMuPDF (fitz)** | `cluster_drawings()` for vector detection |
| Async Processing | **Job-based with SSE** | User can switch tabs |
| Architecture | **Workflow Agent (3 phases)** | Extraction → ReAct → Synthesis |

### Open Questions

1. **PyMuPDF Deployment**
   - Cloud Run service vs Cloud Function vs subprocess?
   - Latency vs cost tradeoffs

2. **Section Detection**
   - Regex-based detection is fragile
   - Consider ML-based section classifier later

3. **Agent Iteration Limits**
   - How many ReAct loops are enough?
   - Balance thoroughness vs latency (suggest: max 10)

4. **Caching Strategy**
   - Cache PDF buffers during session?
   - Cache extracted text for re-analysis?

---

**Created**: December 1, 2025
**Updated**: December 3, 2025
**Status**: Approved Architecture - Ready for Implementation
