/**
 * Base Skill Class
 *
 * Abstract base class for all skills. Provides common utilities
 * and enforces the skill interface.
 */

import { ToolContext } from '@/types/agent';
import { ModelTier } from '@/config/models';
import { Skill, SkillInput, SkillOutput, SkillContext } from './types';

/**
 * Progress callback for skill execution
 */
export type SkillProgressCallback = (progress: number, message: string) => void;

/**
 * Abstract base class for skills
 */
export abstract class BaseSkill implements Skill {
  abstract id: string;
  abstract name: string;
  abstract description: string;
  abstract requiredTools: string[];
  abstract modelTier?: ModelTier;

  protected context!: SkillContext;
  protected startTime: number = 0;
  protected onProgress?: SkillProgressCallback;

  /**
   * Set progress callback for streaming updates
   */
  setProgressCallback(callback: SkillProgressCallback): void {
    this.onProgress = callback;
  }

  /**
   * Emit progress update
   */
  protected emitProgress(progress: number, message: string): void {
    if (this.onProgress) {
      this.onProgress(progress, message);
    }
  }

  /**
   * Execute the skill with timing and error handling
   */
  async execute(input: SkillInput, context: ToolContext): Promise<SkillOutput> {
    this.context = context as SkillContext;
    this.startTime = Date.now();

    try {
      const result = await this.run(input);

      // Add execution metadata
      result.metadata = {
        ...result.metadata,
        durationMs: Date.now() - this.startTime,
      };

      return result;
    } catch (error) {
      console.error(`[Skill:${this.id}] Error:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown skill error',
        metadata: {
          durationMs: Date.now() - this.startTime,
        },
      };
    }
  }

  /**
   * Implement this method with the actual skill logic
   */
  protected abstract run(input: SkillInput): Promise<SkillOutput>;

  /**
   * Helper to create a successful output
   */
  protected successOutput(
    data: unknown,
    summary?: string,
    metadata?: Partial<SkillOutput['metadata']>
  ): SkillOutput {
    return {
      success: true,
      data,
      summary,
      metadata,
    };
  }

  /**
   * Helper to create an error output
   */
  protected errorOutput(error: string): SkillOutput {
    return {
      success: false,
      error,
    };
  }

  /**
   * Get user ID from context
   */
  protected get userId(): string {
    return this.context.userId;
  }

  /**
   * Get conversation ID from context
   */
  protected get conversationId(): string {
    return this.context.conversationId;
  }
}
