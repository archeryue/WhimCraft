/**
 * Paper Analysis API Route
 *
 * POST /api/paper/analyze
 * Accepts a paper URL and returns analysis via SSE streaming.
 * Uses the Paper Reader Agent with intelligent figure selection.
 */

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { paperReaderAgent, type ProgressEvent } from "@/lib/paper-reader/agent";
import { AnalysisProgress, PaperAnalysis } from "@/lib/paper-reader/types";

// Simple in-memory rate limiting for MVP
const userAnalysisCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_PER_DAY = 10;

/**
 * Check rate limit for user
 */
function checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const userData = userAnalysisCounts.get(userId);

  // Reset if day has passed
  if (!userData || now > userData.resetAt) {
    userAnalysisCounts.set(userId, {
      count: 0,
      resetAt: now + dayMs,
    });
    return { allowed: true, remaining: RATE_LIMIT_PER_DAY };
  }

  if (userData.count >= RATE_LIMIT_PER_DAY) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: RATE_LIMIT_PER_DAY - userData.count };
}

/**
 * Increment rate limit count for user
 */
function incrementRateLimit(userId: string): void {
  const userData = userAnalysisCounts.get(userId);
  if (userData) {
    userData.count += 1;
  }
}

/**
 * POST /api/paper/analyze
 * Analyze a paper from URL with SSE progress streaming
 */
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
        message: `You've reached the daily limit of ${RATE_LIMIT_PER_DAY} paper analyses. Please try again tomorrow.`,
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Parse request body
  let url: string;
  try {
    const body = await req.json();
    url = body.url;
    if (!url || typeof url !== "string") {
      throw new Error("URL is required");
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
      // Helper to send progress events (checks if stream is still open)
      const sendProgress = (progress: AnalysisProgress) => {
        if (streamClosed) return;
        try {
          const line = `data: ${JSON.stringify(progress)}\n\n`;
          controller.enqueue(encoder.encode(line));
        } catch {
          // Stream might be closed, ignore
          streamClosed = true;
        }
      };

      // Map agent progress events to SSE progress format
      const mapStage = (phase: ProgressEvent["phase"]): AnalysisProgress["stage"] => {
        switch (phase) {
          case "extraction": return "fetching";
          case "analysis": return "analyzing";
          case "synthesis": return "formatting";
          case "complete": return "complete";
          case "error": return "error";
          default: return "analyzing";
        }
      };

      try {
        // Set up progress callback for the agent
        paperReaderAgent.setProgressCallback((event: ProgressEvent) => {
          sendProgress({
            stage: mapStage(event.phase),
            progress: event.progress,
            message: event.message,
          });
        });

        // Execute the Paper Reader Agent
        const result = await paperReaderAgent.analyze(url, undefined, userId);

        if (!result.success) {
          throw new Error(result.error || "Analysis failed");
        }

        // Transform agent result to PaperAnalysis format
        const analysis: PaperAnalysis = {
          metadata: {
            title: result.metadata.title,
            sourceUrl: result.metadata.sourceUrl,
            analyzedAt: result.metadata.analyzedAt,
          },
          analysis: {
            summary: result.analysis.summary,
            problemStatement: result.analysis.problemStatement,
            keyContributions: result.analysis.keyContributions,
            methodology: result.analysis.methodology,
            results: result.analysis.results,
            limitations: result.analysis.limitations,
            futureWork: result.analysis.futureWork,
            keyTakeaways: result.analysis.keyTakeaways,
          },
          figures: result.figures,
        };

        // Increment rate limit after successful analysis
        incrementRateLimit(userId);

        // Send final completion event with result
        sendProgress({
          stage: "complete",
          progress: 100,
          message: `Analysis complete. ${remaining - 1} analyses remaining today.`,
          result: analysis,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";

        console.error("[Paper Analysis] Error:", errorMessage);

        sendProgress({
          stage: "error",
          progress: 0,
          message: errorMessage,
          error: errorMessage,
        });
      } finally {
        streamClosed = true;
        controller.close();
      }
    },
    cancel() {
      streamClosed = true;
      console.log("[Paper Analysis] Stream cancelled by client");
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
