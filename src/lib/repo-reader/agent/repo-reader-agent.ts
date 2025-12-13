/**
 * Repo Reader Agent
 *
 * A dedicated agent for analyzing GitHub repositories. Uses a 4-phase workflow:
 * 1. Reconnaissance - Fetch metadata, tree, detect project type
 * 2. Entry Point Analysis - Find entry points, extract imports
 * 3. Module Exploration - BFS through import graph
 * 4. Synthesis - Generate architecture document
 *
 * This agent is separate from the main chat agent and focuses specifically
 * on repository analysis tasks.
 */

import { repoReaderSkill } from '@/lib/skills/repo-reader-skill';
import { SkillOutput } from '@/lib/skills/types';
import { ToolContext } from '@/types/agent';
import { RepoProgress, RepoProgressStage, RepoAnalysis, RepoMetadata } from '../types';

/**
 * Progress event types for streaming
 */
export type RepoProgressPhase =
  | 'reconnaissance'
  | 'entry_points'
  | 'exploration'
  | 'synthesis'
  | 'complete'
  | 'error';

export interface RepoProgressEvent {
  phase: RepoProgressPhase;
  stage: RepoProgressStage;
  progress: number; // 0-100
  message: string;
  detail?: string;
  filesExplored?: number;
  tokensUsed?: number;
}

/**
 * Repository analysis result
 */
export interface RepoAnalysisResult {
  success: boolean;
  metadata: RepoMetadata & { analyzedAt: string };
  analysis: {
    overview: string;
    techStack: {
      language: string;
      framework?: string;
      buildTool?: string;
      dependencies: string[];
    };
    architecture: string;
    modules: Array<{
      path: string;
      name: string;
      description: string;
      keyFiles: Array<{
        path: string;
        url: string;
        description: string;
      }>;
    }>;
    dataFlow?: string;
    entryPoints: Array<{
      type: string;
      file: string;
      url: string;
      description: string;
    }>;
    setupInstructions: string;
    codePatterns: string[];
    learningPoints: string[];
  };
  sections: Array<{
    title: string;
    content: string;
    type: string;
  }>;
  error?: string;
}

/**
 * Repo Reader Agent Configuration
 */
export const REPO_READER_CONFIG = {
  name: 'repo-reader',
  description: 'Analyzes GitHub repositories and generates architecture documents',
  maxIterations: 1, // Single skill execution (skill handles internal phases)
};

/**
 * Repo Reader Agent
 *
 * Orchestrates the 4-phase repository analysis workflow using RepoReaderSkill.
 */
export class RepoReaderAgent {
  private onProgress?: (event: RepoProgressEvent) => void;

  /**
   * Set progress callback for streaming updates
   */
  setProgressCallback(callback: (event: RepoProgressEvent) => void): void {
    this.onProgress = callback;
  }

  /**
   * Emit a progress event
   */
  private emitProgress(event: RepoProgressEvent): void {
    if (this.onProgress) {
      this.onProgress(event);
    }
  }

  /**
   * Map skill progress to agent phase
   */
  private mapProgressToPhase(progress: number): RepoProgressPhase {
    if (progress <= 20) return 'reconnaissance';
    if (progress <= 40) return 'entry_points';
    if (progress <= 70) return 'exploration';
    if (progress < 100) return 'synthesis';
    return 'complete';
  }

  /**
   * Map progress to stage
   */
  private mapProgressToStage(progress: number): RepoProgressStage {
    if (progress <= 5) return 'fetching_metadata';
    if (progress <= 12) return 'fetching_tree';
    if (progress <= 15) return 'detecting_project_type';
    if (progress <= 20) return 'fetching_config_files';
    if (progress <= 28) return 'detecting_entry_points';
    if (progress <= 35) return 'fetching_entry_points';
    if (progress <= 40) return 'building_import_graph';
    if (progress <= 70) return 'exploring_modules';
    if (progress < 100) return 'generating_analysis';
    return 'complete';
  }

  /**
   * Analyze a GitHub repository from URL
   */
  async analyze(url: string, userId?: string): Promise<RepoAnalysisResult> {
    const startTime = Date.now();

    try {
      // Create context for skill execution
      const context: ToolContext = {
        userId: userId || 'repo-reader-agent',
        conversationId: `repo-${Date.now()}`,
        requestId: `analysis-${Date.now()}`,
      };

      // Set up progress callback to relay skill progress to agent progress
      repoReaderSkill.setProgressCallback((progress, message) => {
        const phase = this.mapProgressToPhase(progress);
        const stage = this.mapProgressToStage(progress);

        this.emitProgress({
          phase,
          stage,
          progress,
          message,
        });
      });

      // Execute RepoReaderSkill (handles all 4 phases)
      const skillResult = await repoReaderSkill.execute(
        {
          query: 'Analyze this repository',
          params: { url },
        },
        context
      );

      if (!skillResult.success) {
        throw new Error(skillResult.error || 'Skill execution failed');
      }

      const result = this.transformResult(url, skillResult);

      const duration = Date.now() - startTime;
      console.log(`[RepoReaderAgent] Analysis complete in ${(duration / 1000).toFixed(1)}s`);

      // Cast metadata to include filesExplored (repo-specific)
      const metadata = skillResult.metadata as {
        filesExplored?: number;
        tokensUsed?: number;
      } | undefined;

      this.emitProgress({
        phase: 'complete',
        stage: 'complete',
        progress: 100,
        message: 'Analysis complete!',
        filesExplored: metadata?.filesExplored,
        tokensUsed: metadata?.tokensUsed,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[RepoReaderAgent] Error:', errorMessage);

      this.emitProgress({
        phase: 'error',
        stage: 'error',
        progress: 0,
        message: errorMessage,
      });

      return {
        success: false,
        metadata: {
          name: '',
          owner: '',
          fullName: '',
          description: '',
          url,
          stars: 0,
          forks: 0,
          language: '',
          defaultBranch: '',
          lastPush: '',
          analyzedAt: new Date().toISOString(),
        },
        analysis: {
          overview: '',
          techStack: { language: '', dependencies: [] },
          architecture: '',
          modules: [],
          entryPoints: [],
          setupInstructions: '',
          codePatterns: [],
          learningPoints: [],
        },
        sections: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Transform skill output to agent result
   */
  private transformResult(url: string, skillResult: SkillOutput): RepoAnalysisResult {
    const data = skillResult.data as {
      url: string;
      metadata: RepoMetadata & { analyzedAt: string };
      analysis: RepoAnalysisResult['analysis'];
    };

    return {
      success: true,
      metadata: data.metadata,
      analysis: data.analysis,
      sections: skillResult.sections || [],
    };
  }
}

// Export singleton instance
export const repoReaderAgent = new RepoReaderAgent();
