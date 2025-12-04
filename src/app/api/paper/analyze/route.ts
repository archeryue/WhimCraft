/**
 * Paper Analysis API Route
 *
 * POST /api/paper/analyze
 * Accepts a paper URL and returns analysis via SSE streaming.
 */

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveUrl } from "@/lib/paper-reader/url-resolver";
import { fetchPdf } from "@/lib/paper-reader/pdf-fetcher";
import { parsePdf } from "@/lib/paper-reader/pdf-parser";
import { analyzePaper } from "@/lib/paper-reader/analyzer";
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
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  let streamClosed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      streamController = controller;

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

      try {
        const startTime = Date.now();
        const logTiming = (stage: string) => {
          console.log(`[Paper Analysis] ${stage}: ${Date.now() - startTime}ms`);
        };

        // Stage 1: Validating URL
        sendProgress({
          stage: "validating",
          progress: 5,
          message: "Validating paper URL...",
        });

        const resolved = await resolveUrl(url);
        logTiming("URL resolved");

        sendProgress({
          stage: "validating",
          progress: 10,
          message: `Detected ${resolved.type} paper`,
        });

        // Stage 2: Fetching PDF
        sendProgress({
          stage: "fetching",
          progress: 15,
          message: "Downloading PDF...",
        });

        const fetchResult = await fetchPdf(resolved.pdfUrl);
        logTiming("PDF fetched");

        sendProgress({
          stage: "fetching",
          progress: 30,
          message: `Downloaded ${(fetchResult.contentLength / 1024).toFixed(0)} KB`,
        });

        // Stage 3: Parsing PDF
        sendProgress({
          stage: "parsing",
          progress: 35,
          message: "Extracting text from PDF...",
        });

        const parsed = await parsePdf(fetchResult.buffer);
        logTiming("PDF parsed");
        console.log(`[Paper Analysis] Text length: ${parsed.text.length} chars`);

        sendProgress({
          stage: "parsing",
          progress: 45,
          message: `Extracted ${parsed.pageCount} pages`,
        });

        // Stage 4: AI Analysis
        sendProgress({
          stage: "analyzing",
          progress: 50,
          message: "Analyzing paper with AI...",
        });

        // This is the slow part - update progress periodically
        let analysis: PaperAnalysis;
        try {
          // Send a progress update while waiting
          const analysisPromise = analyzePaper(parsed, resolved);

          // Update progress while waiting
          const progressInterval = setInterval(() => {
            sendProgress({
              stage: "analyzing",
              progress: Math.min(90, 50 + Math.random() * 30),
              message: "AI is reading and analyzing the paper...",
            });
          }, 3000);

          analysis = await analysisPromise;
          clearInterval(progressInterval);
          logTiming("AI analysis complete");
        } catch (error) {
          throw new Error(
            `Analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }

        sendProgress({
          stage: "analyzing",
          progress: 95,
          message: "Analysis complete",
        });

        // Stage 5: Complete
        sendProgress({
          stage: "complete",
          progress: 100,
          message: "Paper analysis complete!",
          result: analysis,
        });

        // Increment rate limit after successful analysis
        incrementRateLimit(userId);

        // Add remaining count info
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
