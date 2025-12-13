/**
 * Deep Research API Route - Start
 *
 * POST /api/research/start
 * Starts a research query and streams progress via SSE.
 *
 * Uses the Gemini Interactions API (not generate_content).
 */

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { InteractionsClient } from "@/lib/research/interactions-client";
import { ResearchProgress, ResearchResult } from "@/lib/research/types";
import { extractCitationsFromReport } from "@/lib/research/whim-converter";

// Rate limiting - conservative due to cost ($2/M tokens)
const userResearchCounts = new Map<
  string,
  { count: number; resetAt: number }
>();
const RATE_LIMIT_PER_DAY = 5;

function checkRateLimit(userId: string): {
  allowed: boolean;
  remaining: number;
} {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const userData = userResearchCounts.get(userId);
  if (!userData || now > userData.resetAt) {
    userResearchCounts.set(userId, { count: 0, resetAt: now + dayMs });
    return { allowed: true, remaining: RATE_LIMIT_PER_DAY };
  }

  if (userData.count >= RATE_LIMIT_PER_DAY) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: RATE_LIMIT_PER_DAY - userData.count };
}

function incrementRateLimit(userId: string): void {
  const userData = userResearchCounts.get(userId);
  if (userData) userData.count += 1;
}

export async function POST(req: NextRequest) {
  // Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;

  // Rate limit check
  const { allowed, remaining } = checkRateLimit(userId);
  if (!allowed) {
    return new Response(
      JSON.stringify({
        error: "Rate limit exceeded",
        message: `Daily limit of ${RATE_LIMIT_PER_DAY} research queries reached. Try again tomorrow.`,
      }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  // Parse request
  let query: string;
  try {
    const body = await req.json();
    query = body.query?.trim();
    if (!query || query.length < 10) {
      return new Response(
        JSON.stringify({
          error: "Query must be at least 10 characters",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  let streamClosed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendProgress = (progress: ResearchProgress) => {
        if (streamClosed) return;
        try {
          const line = `data: ${JSON.stringify(progress)}\n\n`;
          controller.enqueue(encoder.encode(line));
        } catch {
          streamClosed = true;
        }
      };

      const sendResult = (result: ResearchResult) => {
        if (streamClosed) return;
        try {
          const line = `data: ${JSON.stringify({ result })}\n\n`;
          controller.enqueue(encoder.encode(line));
        } catch {
          streamClosed = true;
        }
      };

      const startTime = Date.now();
      let interactionId = "";
      let lastEventId = "";
      let accumulatedText = "";
      let latestThought = "";

      try {
        const client = new InteractionsClient();

        sendProgress({
          stage: "starting",
          progress: 5,
          message: "Initiating deep research...",
        });

        for await (const event of client.startResearch(query)) {
          if (streamClosed) break;

          // Track for reconnection
          if (event.event_id) lastEventId = event.event_id;

          switch (event.event_type) {
            case "interaction.start":
              interactionId = event.interaction?.id || "";
              sendProgress({
                stage: "researching",
                progress: 10,
                message:
                  "Research started. This may take 10-20 minutes...",
                interactionId,
              });
              break;

            case "content.delta":
              if (event.delta?.type === "thought_summary") {
                latestThought = event.delta.text;
                sendProgress({
                  stage: "thinking",
                  progress: Math.min(30 + Math.random() * 40, 70),
                  message: "Processing research...",
                  thoughtSummary: latestThought,
                  interactionId,
                  lastEventId,
                });
              } else if (event.delta?.type === "text") {
                accumulatedText += event.delta.text;
                sendProgress({
                  stage: "writing",
                  progress: Math.min(
                    70 + (accumulatedText.length / 10000) * 25,
                    95
                  ),
                  message: "Generating report...",
                  partialReport: accumulatedText,
                  interactionId,
                  lastEventId,
                });
              }
              break;

            case "interaction.complete":
              incrementRateLimit(userId);
              const durationMs = Date.now() - startTime;

              // Try to get citations from the final result
              let citations = [];
              try {
                const result = await client.getInteraction(interactionId);
                const output = result.outputs?.[0];
                citations = output?.citations || [];
                if (citations.length === 0 && output?.text) {
                  // Fallback: extract citations from report text
                  citations = extractCitationsFromReport(output.text);
                }
                if (output?.text) {
                  accumulatedText = output.text;
                }
              } catch (e) {
                console.warn(
                  "[Research API] Failed to get final result:",
                  e
                );
                // Use accumulated text and extract citations as fallback
                citations = extractCitationsFromReport(accumulatedText);
              }

              sendProgress({
                stage: "complete",
                progress: 100,
                message: `Research complete. ${remaining - 1} queries remaining today.`,
                partialReport: accumulatedText,
                interactionId,
              });

              // Send final result
              const finalResult: ResearchResult = {
                success: true,
                query,
                report: accumulatedText,
                citations,
                metadata: {
                  interactionId,
                  completedAt: new Date().toISOString(),
                  durationMs,
                },
              };
              sendResult(finalResult);
              break;

            case "error":
              const errMsg = typeof event.error === 'object'
                ? JSON.stringify(event.error)
                : (event.error || "Research failed");
              throw new Error(errMsg);
          }
        }
      } catch (error) {
        let errorMessage = "Unknown error";
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (typeof error === 'object' && error !== null) {
          errorMessage = JSON.stringify(error);
        } else if (typeof error === 'string') {
          errorMessage = error;
        }
        console.error("[Research API] Error:", errorMessage);

        sendProgress({
          stage: "error",
          progress: 0,
          message: errorMessage,
          error: errorMessage,
          interactionId,
          lastEventId,
        });
      } finally {
        streamClosed = true;
        controller.close();
      }
    },
    cancel() {
      streamClosed = true;
      console.log("[Research API] Stream cancelled by client");
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
