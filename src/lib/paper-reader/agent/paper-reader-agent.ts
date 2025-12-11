/**
 * Paper Reader Agent
 *
 * A dedicated agent for analyzing academic papers. Uses a 3-phase workflow:
 * 1. Extraction - Fetch PDF, extract text and figures
 * 2. Analysis - Intelligently analyze with figure importance judging
 * 3. Synthesis - Generate structured output
 *
 * This agent is separate from the main chat agent and focuses specifically
 * on paper analysis tasks.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { ModelTier, GEMINI_MODELS } from '@/config/models';
import { paperReaderSkill } from '@/lib/skills/paper-reader-skill';
import { SkillOutput, SkillFigure } from '@/lib/skills/types';
import { ToolContext } from '@/types/agent';

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
 * Progress event types for streaming
 */
export type ProgressPhase = 'extraction' | 'analysis' | 'synthesis' | 'complete' | 'error';

export interface ProgressEvent {
  phase: ProgressPhase;
  stage: string;
  progress: number; // 0-100
  message: string;
  thought?: string;
  action?: string;
}

/**
 * Paper analysis result
 */
export interface PaperAnalysisResult {
  success: boolean;
  metadata: {
    title?: string;
    authors?: string[];
    sourceUrl: string;
    analyzedAt: string;
  };
  analysis: {
    summary: string;
    problemStatement?: string;
    keyContributions: string[];
    methodology?: string;
    results?: string;
    limitations?: string;
    futureWork?: string;
    keyTakeaways: string[];
  };
  figures: Array<{
    id: string;
    page: number;
    imageBase64: string;
    caption?: string;
    importance: number;
    importanceReason?: string;
    type?: string;
  }>;
  error?: string;
}

/**
 * Paper Reader Agent Configuration
 */
export const PAPER_READER_CONFIG = {
  name: 'paper-reader',
  description: 'Analyzes academic papers with intelligent figure selection',
  modelTier: ModelTier.IMAGE, // Use vision model for figure analysis
  maxIterations: 1, // Single skill execution (skill handles internal iterations)
};

/**
 * Paper Reader Agent
 *
 * Orchestrates the 3-phase paper analysis workflow using PaperReaderSkill.
 */
export class PaperReaderAgent {
  private onProgress?: (event: ProgressEvent) => void;

  /**
   * Set progress callback for streaming updates
   */
  setProgressCallback(callback: (event: ProgressEvent) => void): void {
    this.onProgress = callback;
  }

  /**
   * Emit a progress event
   */
  private emitProgress(event: ProgressEvent): void {
    if (this.onProgress) {
      this.onProgress(event);
    }
  }

  /**
   * Analyze a paper from URL
   */
  async analyze(
    url: string,
    userQuery?: string,
    userId?: string
  ): Promise<PaperAnalysisResult> {
    const startTime = Date.now();
    const query = userQuery || 'Analyze this paper and explain its main contributions.';

    try {
      // Create context for skill execution
      const context: ToolContext = {
        userId: userId || 'paper-reader-agent',
        conversationId: `paper-${Date.now()}`,
        requestId: `analysis-${Date.now()}`,
      };

      // Set up progress callback to relay skill progress to agent progress
      paperReaderSkill.setProgressCallback((progress, message) => {
        // Map skill progress to phases
        let phase: ProgressPhase = 'analysis';
        if (progress <= 30) {
          phase = 'extraction';
        } else if (progress >= 80) {
          phase = 'synthesis';
        }

        this.emitProgress({
          phase,
          stage: 'skill_execution',
          progress,
          message,
        });
      });

      // Execute PaperReaderSkill (handles extraction + analysis)
      const skillResult = await paperReaderSkill.execute(
        {
          query,
          params: { url },
        },
        context
      );

      if (!skillResult.success) {
        throw new Error(skillResult.error || 'Skill execution failed');
      }

      const result = await this.synthesizeResult(url, query, skillResult);

      const duration = Date.now() - startTime;
      console.log(`[PaperReaderAgent] Analysis complete in ${(duration / 1000).toFixed(1)}s`);

      this.emitProgress({
        phase: 'complete',
        stage: 'done',
        progress: 100,
        message: 'Analysis complete!',
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[PaperReaderAgent] Error:', errorMessage);

      this.emitProgress({
        phase: 'error',
        stage: 'failed',
        progress: 0,
        message: errorMessage,
      });

      return {
        success: false,
        metadata: {
          sourceUrl: url,
          analyzedAt: new Date().toISOString(),
        },
        analysis: {
          summary: '',
          keyContributions: [],
          keyTakeaways: [],
        },
        figures: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Synthesize final result from skill output
   */
  private async synthesizeResult(
    url: string,
    query: string,
    skillResult: SkillOutput
  ): Promise<PaperAnalysisResult> {
    // Extract sections from skill result
    const sections = skillResult.sections || [];
    const sectionMap: Record<string, string> = {};
    for (const section of sections) {
      sectionMap[section.title.toLowerCase()] = section.content;
    }

    // Generate enhanced analysis if summary is short
    let analysis: PaperAnalysisResult['analysis'] = {
      summary: skillResult.summary || '',
      problemStatement: sectionMap['problem'] || sectionMap['problem statement'],
      keyContributions: this.extractListItems(sectionMap['key findings'] || sectionMap['contributions'] || ''),
      methodology: sectionMap['methodology'] || sectionMap['methods'],
      results: sectionMap['results'] || sectionMap['findings'],
      limitations: sectionMap['limitations'],
      futureWork: sectionMap['future work'],
      keyTakeaways: this.extractListItems(sectionMap['key takeaways'] || sectionMap['takeaways'] || ''),
    };

    // If we don't have key contributions, generate them from summary
    if (analysis.keyContributions.length === 0 && analysis.summary) {
      analysis = await this.enhanceAnalysis(query, skillResult.summary || '', analysis);
    }

    // Transform figures
    const figures = (skillResult.figures || []).map((fig: SkillFigure) => ({
      id: fig.id,
      page: fig.page || 0,
      imageBase64: fig.imageBase64,
      caption: fig.caption,
      importance: fig.importance || 0,
      importanceReason: fig.importanceReason,
      type: fig.type,
    }));

    return {
      success: true,
      metadata: {
        title: skillResult.metadata?.title,
        sourceUrl: url,
        analyzedAt: new Date().toISOString(),
      },
      analysis,
      figures,
    };
  }

  /**
   * Extract list items from text
   */
  private extractListItems(text: string): string[] {
    if (!text) return [];

    // Try to split by numbered items or bullet points
    const items = text
      .split(/(?:\n|^)(?:\d+\.\s*|\-\s*|\*\s*|•\s*)/)
      .map(s => s.trim())
      .filter(s => s.length > 10);

    if (items.length > 0) return items;

    // Fallback: split by sentences
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 20)
      .slice(0, 5);
  }

  /**
   * Enhance analysis with LLM if needed
   */
  private async enhanceAnalysis(
    query: string,
    summary: string,
    analysis: PaperAnalysisResult['analysis']
  ): Promise<PaperAnalysisResult['analysis']> {
    try {
      const genai = getGenaiClient();
      const model = genai.getGenerativeModel({ model: GEMINI_MODELS[ModelTier.LITE] });

      const prompt = `Based on this paper summary and analysis context, extract key information.

USER QUESTION: ${query}

SUMMARY: ${summary}

Please provide:
1. 3-5 key contributions (specific, concrete points)
2. 2-3 key takeaways (actionable insights)

Format as JSON:
{
  "keyContributions": ["contribution1", "contribution2", ...],
  "keyTakeaways": ["takeaway1", "takeaway2", ...]
}

Return ONLY the JSON.`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();

      // Extract JSON
      let jsonStr = responseText;
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const enhanced = JSON.parse(jsonStr);

      return {
        ...analysis,
        keyContributions: enhanced.keyContributions || analysis.keyContributions,
        keyTakeaways: enhanced.keyTakeaways || analysis.keyTakeaways,
      };
    } catch {
      // Return original analysis on error
      return analysis;
    }
  }
}

// Export singleton instance
export const paperReaderAgent = new PaperReaderAgent();
