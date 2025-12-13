/**
 * Repo Analysis API Route
 *
 * POST /api/repo/analyze
 * Accepts a GitHub URL and returns analysis via SSE streaming.
 * Uses the Repo Reader Agent with 4-phase deterministic exploration.
 */

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { repoReaderAgent, type RepoProgressEvent } from '@/lib/repo-reader/agent';
import { isValidGitHubUrl } from '@/lib/repo-reader/url-parser';

// Progress event type for SSE streaming
interface RepoAnalysisProgress {
  stage: 'reconnaissance' | 'entry_points' | 'exploration' | 'synthesis' | 'complete' | 'error';
  progress: number;
  message: string;
  detail?: string;
  filesExplored?: number;
  tokensUsed?: number;
  result?: unknown;
  error?: string;
}

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
 * POST /api/repo/analyze
 * Analyze a GitHub repository from URL with SSE progress streaming
 */
export async function POST(req: NextRequest) {
  // Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userId = session.user.id;

  // Rate limit check
  const { allowed, remaining } = checkRateLimit(userId);
  if (!allowed) {
    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        message: `You've reached the daily limit of ${RATE_LIMIT_PER_DAY} repository analyses. Please try again tomorrow.`,
      }),
      {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Parse request body
  let url: string;
  try {
    const body = await req.json();
    url = body.url;
    if (!url || typeof url !== 'string') {
      throw new Error('URL is required');
    }

    // Validate GitHub URL
    if (!isValidGitHubUrl(url)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid GitHub URL',
          message: 'Please provide a valid GitHub repository URL (e.g., https://github.com/owner/repo)',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  let streamClosed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Helper to send progress events (checks if stream is still open)
      const sendProgress = (progress: RepoAnalysisProgress) => {
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
        // Set up progress callback for the agent
        repoReaderAgent.setProgressCallback((event: RepoProgressEvent) => {
          sendProgress({
            stage: event.phase,
            progress: event.progress,
            message: event.message,
            detail: event.detail,
            filesExplored: event.filesExplored,
            tokensUsed: event.tokensUsed,
          });
        });

        // Execute the Repo Reader Agent
        const result = await repoReaderAgent.analyze(url, userId);

        if (!result.success) {
          throw new Error(result.error || 'Analysis failed');
        }

        // Increment rate limit after successful analysis
        incrementRateLimit(userId);

        // Send final completion event with result
        sendProgress({
          stage: 'complete',
          progress: 100,
          message: `Analysis complete. ${remaining - 1} analyses remaining today.`,
          result: {
            metadata: result.metadata,
            analysis: result.analysis,
            sections: result.sections,
          },
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        console.error('[Repo Analysis] Error:', errorMessage);

        sendProgress({
          stage: 'error',
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
      console.log('[Repo Analysis] Stream cancelled by client');
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
