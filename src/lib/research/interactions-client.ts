/**
 * Gemini Interactions API Client for Deep Research
 *
 * This client wraps the Gemini Interactions API which is used exclusively
 * for Deep Research. It does NOT use the standard generate_content endpoint.
 *
 * Key features:
 * - Streaming support with SSE
 * - Reconnection capability via lastEventId
 * - Polling fallback for status checks
 */

import { GEMINI_MODELS, ModelTier } from "@/config/models";
import { InteractionEvent, InteractionResult } from "./types";

const INTERACTIONS_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/interactions";

export class InteractionsClient {
  private apiKey: string;

  constructor() {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) {
      throw new Error(
        "GEMINI_API_KEY or GOOGLE_API_KEY environment variable is required"
      );
    }
    this.apiKey = key;
  }

  /**
   * Start a research interaction with streaming
   *
   * @param query - The research query/topic
   * @yields InteractionEvent - SSE events from the API
   */
  async *startResearch(query: string): AsyncGenerator<InteractionEvent> {
    const response = await fetch(INTERACTIONS_API_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify({
        input: query,
        agent: GEMINI_MODELS[ModelTier.RESEARCH],
        background: true,
        stream: true,
        agent_config: {
          type: "deep-research",
          thinking_summaries: "auto",
        },
      }),
    });

    if (!response.ok) {
      let errorText = "";
      try {
        errorText = await response.text();
        // Try to parse as JSON for better error messages
        const errorJson = JSON.parse(errorText);
        errorText = errorJson.error?.message || errorJson.message || errorText;
      } catch {
        // Keep raw text if not JSON
      }
      console.error("[InteractionsClient] API error response:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new Error(
        `Interactions API error: ${response.status} - ${errorText}`
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body from Interactions API");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6)) as InteractionEvent;
              yield event;
            } catch {
              // Ignore parse errors for malformed events
              console.warn("[InteractionsClient] Failed to parse SSE event");
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Poll for interaction status (fallback if streaming fails)
   *
   * @param interactionId - The interaction ID to check
   * @returns InteractionResult - Current status and outputs
   */
  async getInteraction(interactionId: string): Promise<InteractionResult> {
    const response = await fetch(
      `${INTERACTIONS_API_BASE}/${interactionId}`,
      {
        headers: {
          "x-goog-api-key": this.apiKey,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to get interaction: ${response.status} - ${errorText}`
      );
    }

    return response.json();
  }

  /**
   * Resume streaming from last event (for reconnection after disconnect)
   *
   * @param interactionId - The interaction ID to resume
   * @param lastEventId - The last event ID received
   * @yields InteractionEvent - SSE events from the resumed stream
   */
  async *resumeStream(
    interactionId: string,
    lastEventId: string
  ): AsyncGenerator<InteractionEvent> {
    const url = `${INTERACTIONS_API_BASE}/${interactionId}?stream=true&last_event_id=${lastEventId}`;
    const response = await fetch(url, {
      headers: {
        "x-goog-api-key": this.apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to resume stream: ${response.status} - ${errorText}`
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body from resume endpoint");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6)) as InteractionEvent;
              yield event;
            } catch {
              // Ignore parse errors
              console.warn("[InteractionsClient] Failed to parse resumed SSE event");
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
