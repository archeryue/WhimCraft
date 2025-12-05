/**
 * Save Paper Analysis as Whim API Route
 *
 * POST /api/paper/save-whim
 * Converts paper analysis to Whim format and saves it.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/firebase-admin";
import { analysisToWhimData } from "@/lib/paper-reader/whim-converter";
import { PaperAnalysis } from "@/lib/paper-reader/types";

export async function POST(req: NextRequest) {
  // Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const analysis: PaperAnalysis = body.analysis;

    if (!analysis || !analysis.metadata || !analysis.analysis) {
      return NextResponse.json(
        { error: "Invalid analysis data" },
        { status: 400 }
      );
    }

    // Convert to whim data
    const whimData = analysisToWhimData(analysis);

    // Save to Firestore
    const now = new Date().toISOString();
    const whimRef = await db.collection("whims").add({
      userId: session.user.id,
      title: whimData.title,
      blocks: whimData.blocks,
      metadata: whimData.metadata,
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
    console.error("[Save Whim] Error:", error);
    return NextResponse.json(
      { error: "Failed to save whim" },
      { status: 500 }
    );
  }
}
