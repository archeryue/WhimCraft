/**
 * Save Repo Analysis as Whim API Route
 *
 * POST /api/repo/save-whim
 * Converts repo analysis to Whim format and saves it.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { analysisToWhimData } from "@/lib/repo-reader/whim-converter";

interface RepoAnalysisData {
  metadata: {
    name: string;
    owner: string;
    fullName: string;
    description: string;
    url: string;
    stars: number;
    forks: number;
    language: string;
    license?: string;
    defaultBranch: string;
    lastPush: string;
    analyzedAt: string;
  };
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
}

export async function POST(req: NextRequest) {
  // Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const analysis: RepoAnalysisData = body.analysis;

    if (!analysis || !analysis.metadata || !analysis.analysis) {
      return NextResponse.json(
        { error: "Invalid analysis data" },
        { status: 400 }
      );
    }

    // Convert to whim data
    const whimData = analysisToWhimData(analysis);

    // Filter out undefined values from metadata (Firestore doesn't accept undefined)
    const cleanMetadata: Record<string, unknown> = {};
    if (whimData.metadata) {
      for (const [key, value] of Object.entries(whimData.metadata)) {
        if (value !== undefined) {
          cleanMetadata[key] = value;
        }
      }
    }

    // Save to Firestore
    const now = Timestamp.now();
    const whimRef = await db.collection("whims").add({
      userId: session.user.id,
      title: whimData.title,
      blocks: whimData.blocks,
      metadata: cleanMetadata,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({
      whim: {
        id: whimRef.id,
        title: whimData.title,
      },
    });
  } catch (error) {
    console.error("[Save Repo Whim] Error:", error);
    return NextResponse.json(
      { error: "Failed to save whim" },
      { status: 500 }
    );
  }
}
