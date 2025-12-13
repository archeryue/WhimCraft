/**
 * Deep Research Types
 *
 * Type definitions for the Gemini Deep Research integration.
 * Uses the Interactions API (not generate_content).
 */

/**
 * Research progress stages
 */
export type ResearchStage =
  | "starting"
  | "researching"
  | "thinking"
  | "writing"
  | "complete"
  | "error";

/**
 * Progress update sent via SSE during research
 */
export interface ResearchProgress {
  stage: ResearchStage;
  progress: number; // 0-100
  message: string;
  thoughtSummary?: string; // Latest AI thinking summary
  partialReport?: string; // Accumulated report text
  interactionId?: string; // For reconnection
  lastEventId?: string; // For reconnection
  error?: string;
}

/**
 * Citation from research sources
 */
export interface ResearchCitation {
  url: string;
  title?: string;
}

/**
 * Final research result
 */
export interface ResearchResult {
  success: boolean;
  query: string;
  report: string;
  citations: ResearchCitation[];
  metadata: {
    interactionId: string;
    completedAt: string;
    durationMs: number;
  };
  error?: string;
}

/**
 * Data structure for saving research as a Whim
 */
export interface ResearchWhimData {
  title: string;
  blocks: unknown; // TipTap JSONContent
  metadata: {
    type: "research";
    query: string;
    citationCount: number;
    completedAt: string;
  };
}

/**
 * Interactions API event types
 */
export type InteractionEventType =
  | "interaction.start"
  | "content.delta"
  | "interaction.complete"
  | "error";

/**
 * Interaction event from Gemini Interactions API
 */
export interface InteractionEvent {
  event_type: InteractionEventType;
  event_id?: string;
  interaction?: {
    id: string;
    status: "in_progress" | "completed" | "failed";
  };
  delta?: {
    type: "text" | "thought_summary";
    text: string;
  };
  error?: string;
}

/**
 * Interaction result from polling endpoint
 */
export interface InteractionResult {
  id: string;
  status: "in_progress" | "completed" | "failed";
  outputs?: Array<{
    text: string;
    citations?: ResearchCitation[];
  }>;
  error?: string;
}

/**
 * Request body for starting research
 */
export interface StartResearchRequest {
  query: string;
}

/**
 * Request body for saving research as whim
 */
export interface SaveResearchWhimRequest {
  result: ResearchResult;
}
