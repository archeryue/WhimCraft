/**
 * Paper Reader Skill
 *
 * A high-level skill that orchestrates paper reading workflow:
 * 1. Fetch PDF from URL
 * 2. Extract text content
 * 3. Extract figures
 * 4. Analyze figures with vision model - check quality & judge importance
 * 5. Analyze paper content
 * 6. Return structured analysis with only important figures
 */

import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { ModelTier, GEMINI_MODELS } from '@/config/models';
import { ToolContext } from '@/types/agent';
import { BaseSkill } from './base-skill';
import { SkillInput, SkillOutput, SkillFigure, SkillSection, SkillContext } from './types';
import { PdfFetchTool, PdfToolContext } from '@/lib/agent/tools/pdf-fetch';
import { TextExtractTool } from '@/lib/agent/tools/text-extract';
import { FigureExtractTool, ExtractedFigure } from '@/lib/agent/tools/figure-extract';
import { resolveUrl } from '@/lib/paper-reader/url-resolver';

// Lazy-initialized Gemini client
let genaiClient: GoogleGenerativeAI | null = null;

function getGenaiClient(): GoogleGenerativeAI {
  if (!genaiClient) {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY environment variable is required');
    }
    genaiClient = new GoogleGenerativeAI(apiKey);
  }
  return genaiClient;
}

/**
 * Result of analyzing a single figure
 */
interface FigureAnalysis {
  isValidFigure: boolean;
  figureType: 'chart' | 'diagram' | 'graph' | 'table' | 'illustration' | 'photo' | 'text_block' | 'unknown';
  description: string;
  importanceScore: number;
  importanceReason: string;
  keyInsights: string[];
}

/**
 * Paper Reader Skill Implementation
 */
export class PaperReaderSkill extends BaseSkill {
  id = 'paper-reader';
  name = 'Paper Reader';
  description = 'Read and analyze academic papers, extracting key insights and important figures';
  requiredTools = ['pdf_fetch', 'text_extract', 'figure_extract'];
  modelTier = ModelTier.IMAGE; // Use vision model for figure analysis

  // Tools
  private pdfFetchTool = new PdfFetchTool();
  private textExtractTool = new TextExtractTool();
  private figureExtractTool = new FigureExtractTool();

  /**
   * Main execution logic
   */
  protected async run(input: SkillInput): Promise<SkillOutput> {
    const { query, params } = input;
    const url = params?.url as string;

    if (!url) {
      return this.errorOutput('Paper URL is required');
    }

    console.log(`[PaperReaderSkill] Starting analysis for: ${url}`);
    console.log(`[PaperReaderSkill] User query: ${query}`);

    // Resolve URL to get actual PDF URL (handles arXiv abstract URLs, etc.)
    let pdfUrl: string;
    let paperTitle: string | undefined;
    let arxivId: string | undefined;
    try {
      const resolved = await resolveUrl(url);
      pdfUrl = resolved.pdfUrl;
      paperTitle = resolved.metadata?.title;
      arxivId = resolved.metadata?.arxivId;
      console.log(`[PaperReaderSkill] Resolved PDF URL: ${pdfUrl}`);
      console.log(`[PaperReaderSkill] Paper title: ${paperTitle || 'Not found'}`);
    } catch (error) {
      return this.errorOutput(`Failed to resolve URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Create extended context for PDF tools
    const pdfContext: PdfToolContext = {
      ...this.context,
      conversationId: this.context.conversationId,
      userId: this.context.userId,
      requestId: `skill-${Date.now()}`,
    };

    // Step 1: Fetch PDF
    console.log('[PaperReaderSkill] Step 1: Fetching PDF...');
    const fetchResult = await this.pdfFetchTool.execute({ url: pdfUrl }, pdfContext);
    if (!fetchResult.success) {
      return this.errorOutput(`Failed to fetch PDF: ${fetchResult.error}`);
    }
    console.log('[PaperReaderSkill] PDF fetched successfully');

    // IMPORTANT: Make a copy of the buffer before any tool consumes it
    // Some tools (text_extract) consume the ArrayBuffer, making it detached
    const originalBuffer = pdfContext.pdfBuffer;
    let bufferCopy: ArrayBuffer | undefined;
    if (originalBuffer) {
      bufferCopy = originalBuffer.slice(0);
      console.log(`[PaperReaderSkill] Buffer size: ${originalBuffer.byteLength} bytes`);
    }

    // Step 2: Extract figures FIRST (before text_extract consumes the buffer)
    console.log('[PaperReaderSkill] Step 2: Extracting figures...');
    const figureResult = await this.figureExtractTool.execute(
      { maxFigures: 10 },
      pdfContext
    );
    console.log('[PaperReaderSkill] Figure extract result:', figureResult.success, figureResult.error);

    // Step 3: Extract text (restore buffer if needed)
    console.log('[PaperReaderSkill] Step 3: Extracting text...');
    // Restore buffer from copy if it was consumed
    if (bufferCopy && (!pdfContext.pdfBuffer || pdfContext.pdfBuffer.byteLength === 0)) {
      pdfContext.pdfBuffer = bufferCopy;
    }
    const textResult = await this.textExtractTool.execute(
      { sections: ['abstract', 'introduction', 'methods', 'results', 'conclusion'] },
      pdfContext
    );
    const textContent = textResult.success
      ? (textResult.data as { text?: string })?.text || ''
      : '';
    console.log(`[PaperReaderSkill] Extracted ${textContent.length} chars of text`);

    let rawFigures: ExtractedFigure[] = [];
    if (figureResult.success) {
      const figureData = figureResult.data as { figures: ExtractedFigure[] };
      rawFigures = figureData.figures || [];
    }
    console.log(`[PaperReaderSkill] Extracted ${rawFigures.length} candidate figures`);

    // Step 4: Analyze figures with vision model
    console.log('[PaperReaderSkill] Step 4: Analyzing figures with vision model...');
    const analyzedFigures = await this.analyzeFigures(rawFigures, query, textContent);
    console.log(`[PaperReaderSkill] ${analyzedFigures.length} figures passed analysis`);

    // Step 5: Select key figures based on importance
    const keyFigures = this.selectKeyFigures(analyzedFigures, query, 3);
    console.log(`[PaperReaderSkill] Selected ${keyFigures.length} key figures`);

    // Step 6: Generate paper analysis (with retry for JSON parse failures)
    let analysis: { summary: string; sections: SkillSection[] } | null = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[PaperReaderSkill] Step 5: Generating paper analysis (attempt ${attempt}/${maxAttempts})...`);
      analysis = await this.analyzePaper(textContent, query, keyFigures);
      if (analysis) {
        console.log('[PaperReaderSkill] Paper analysis generated successfully');
        break;
      }
      console.log(`[PaperReaderSkill] Attempt ${attempt} failed (JSON parse error), ${attempt < maxAttempts ? 'retrying...' : 'using fallback'}`);
    }

    // Fallback if all attempts fail
    if (!analysis) {
      analysis = {
        summary: 'Paper analysis completed. Please refer to the extracted figures and text for details.',
        sections: [],
      };
    }

    return {
      success: true,
      data: {
        url,
        query,
        title: paperTitle,
        arxivId,
        textLength: textContent.length,
        totalFigures: rawFigures.length,
        selectedFigures: keyFigures.length,
      },
      summary: analysis.summary,
      sections: analysis.sections,
      figures: keyFigures,
      metadata: {
        toolsInvoked: this.requiredTools,
        title: paperTitle,
        arxivId,
      },
    };
  }

  /**
   * Analyze each figure using vision model
   * Checks if it's a valid figure and judges importance
   */
  private async analyzeFigures(
    figures: ExtractedFigure[],
    userQuery: string,
    paperContext: string
  ): Promise<SkillFigure[]> {
    const analyzedFigures: SkillFigure[] = [];
    const genai = getGenaiClient();
    const model = genai.getGenerativeModel({ model: GEMINI_MODELS[ModelTier.IMAGE] });

    // Get paper abstract for context (first 1000 chars)
    const abstractContext = paperContext.substring(0, 1000);

    for (let i = 0; i < figures.length; i++) {
      const fig = figures[i];
      console.log(`[PaperReaderSkill] Analyzing figure ${i + 1}/${figures.length}...`);

      try {
        const analysis = await this.analyzeSingleFigure(
          model,
          fig.imageBase64,
          userQuery,
          abstractContext,
          i + 1
        );

        // Skip if not a valid figure (e.g., text block)
        if (!analysis.isValidFigure) {
          console.log(`[PaperReaderSkill] Figure ${i + 1}: REJECTED (${analysis.figureType})`);
          continue;
        }

        console.log(
          `[PaperReaderSkill] Figure ${i + 1}: ${analysis.figureType}, ` +
          `importance=${analysis.importanceScore}/100`
        );

        analyzedFigures.push({
          id: `fig-${i + 1}`,
          page: fig.page,
          imageBase64: fig.imageBase64,
          dimensions: fig.dimensions,
          caption: analysis.description,
          importance: analysis.importanceScore,
          importanceReason: analysis.importanceReason,
          type: analysis.figureType as SkillFigure['type'],
        });
      } catch (error) {
        console.error(`[PaperReaderSkill] Error analyzing figure ${i + 1}:`, error);
        // Include figure without analysis on error
        analyzedFigures.push({
          id: `fig-${i + 1}`,
          page: fig.page,
          imageBase64: fig.imageBase64,
          dimensions: fig.dimensions,
          importance: 50, // Default middle importance
          type: 'unknown',
        });
      }
    }

    return analyzedFigures;
  }

  /**
   * Analyze a single figure using vision model
   */
  private async analyzeSingleFigure(
    model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
    imageBase64: string,
    userQuery: string,
    paperContext: string,
    figureIndex: number
  ): Promise<FigureAnalysis> {
    const imagePart: Part = {
      inlineData: {
        mimeType: 'image/png',
        data: imageBase64,
      },
    };

    const prompt = `Analyze this figure extracted from an academic paper.

PAPER CONTEXT (abstract):
${paperContext}

USER'S QUESTION:
${userQuery}

Please analyze Figure ${figureIndex} and respond in this EXACT JSON format:
{
  "isValidFigure": true/false,
  "figureType": "chart|diagram|graph|table|illustration|photo|text_block|unknown",
  "description": "Brief description of what this figure shows (1-2 sentences)",
  "importanceScore": 0-100,
  "importanceReason": "Why this figure is or isn't important for the user's question",
  "keyInsights": ["insight1", "insight2"]
}

IMPORTANT RULES:
1. Set isValidFigure=false if this is primarily text (paragraphs, code blocks, formulas without visuals)
2. importanceScore should be HIGH (70-100) if the figure directly answers the user's question
3. importanceScore should be MEDIUM (40-69) if the figure provides useful context
4. importanceScore should be LOW (0-39) if the figure is not relevant to the question
5. Be strict about text_block classification - if more than 50% is text, it's not a valid figure

Return ONLY the JSON, no other text.`;

    const result = await model.generateContent([imagePart, prompt]);
    const responseText = result.response.text().trim();

    // Parse JSON response
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = responseText;
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const analysis = JSON.parse(jsonStr) as FigureAnalysis;
      return analysis;
    } catch {
      console.error('[PaperReaderSkill] Failed to parse figure analysis:', responseText);
      // Return default analysis on parse error
      return {
        isValidFigure: true,
        figureType: 'unknown',
        description: 'Unable to analyze figure',
        importanceScore: 50,
        importanceReason: 'Analysis failed',
        keyInsights: [],
      };
    }
  }

  /**
   * Select the most important figures
   */
  private selectKeyFigures(
    figures: SkillFigure[],
    _userQuery: string,
    maxFigures: number = 3
  ): SkillFigure[] {
    // Sort by importance score descending
    const sorted = [...figures].sort((a, b) => (b.importance || 0) - (a.importance || 0));

    // Take top N figures with importance > 40
    return sorted
      .filter(f => (f.importance || 0) >= 40)
      .slice(0, maxFigures);
  }

  /**
   * Analyze paper content and generate structured analysis
   */
  private async analyzePaper(
    textContent: string,
    userQuery: string,
    keyFigures: SkillFigure[]
  ): Promise<{ summary: string; sections: SkillSection[] } | null> {
    const genai = getGenaiClient();
    const model = genai.getGenerativeModel({ model: GEMINI_MODELS[ModelTier.LITE] });

    // Prepare figure descriptions for context
    const figureDescriptions = keyFigures
      .map((f, i) => `Figure ${i + 1}: ${f.caption || 'No description'}`)
      .join('\n');

    const prompt = `Analyze this academic paper and answer the user's question.

USER'S QUESTION:
${userQuery}

PAPER TEXT (excerpt):
${textContent.substring(0, 15000)}

KEY FIGURES IDENTIFIED:
${figureDescriptions || 'No key figures identified'}

Please provide a comprehensive analysis with ALL of the following sections (these are REQUIRED):

1. **Summary**: A concise summary answering the user's question (2-3 sentences)
2. **Key Findings**: The main contributions and findings of this paper (bullet points or list)
3. **Methodology**: How the research was conducted, what techniques/methods were used
4. **Limitations**: Any limitations, caveats, or areas for improvement mentioned

Format your response as JSON with EXACTLY these section titles:
{
  "summary": "2-3 sentence summary...",
  "sections": [
    {"title": "Key Findings", "content": "• Finding 1\\n• Finding 2\\n• Finding 3...", "type": "text"},
    {"title": "Methodology", "content": "Description of methods used...", "type": "text"},
    {"title": "Limitations", "content": "Any limitations mentioned...", "type": "text"}
  ]
}

IMPORTANT: All sections are REQUIRED. Return ONLY the JSON.`;

    try {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();

      // Extract JSON
      let jsonStr = responseText;
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const analysis = JSON.parse(jsonStr);
      return {
        summary: analysis.summary || 'Analysis complete',
        sections: analysis.sections || [],
      };
    } catch (error) {
      console.error('[PaperReaderSkill] Paper analysis attempt failed:', error);
      // Return null to signal retry is needed
      return null;
    }
  }
}

// Export singleton instance
export const paperReaderSkill = new PaperReaderSkill();
