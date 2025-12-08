/**
 * Save Paper Analysis as Whim API Route
 *
 * POST /api/paper/save-whim
 * Converts paper analysis to Whim format and saves it.
 * Uploads paper figures to R2 for persistence.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/firebase-admin";
import { analysisToWhimData, PersistedFigure } from "@/lib/paper-reader/whim-converter";
import { PaperAnalysis } from "@/lib/paper-reader/types";
import { uploadPaperFigure } from "@/lib/storage/r2-client";

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

    // Upload figures to R2 if present
    let persistedFigures: PersistedFigure[] = [];
    if (analysis.figures && analysis.figures.length > 0) {
      console.log(`[Save Whim] Uploading ${analysis.figures.length} figures to R2...`);

      // Only upload high-importance figures (importance >= 0.6)
      const importantFigures = analysis.figures.filter(f => f.importance >= 0.6);
      console.log(`[Save Whim] ${importantFigures.length} figures meet importance threshold`);

      for (const figure of importantFigures) {
        try {
          const url = await uploadPaperFigure(
            figure.imageBase64,
            session.user.id,
            figure.id
          );
          persistedFigures.push({
            id: figure.id,
            url,
            caption: figure.caption,
            importance: figure.importance,
            importanceReason: figure.importanceReason,
          });
        } catch (error) {
          console.error(`[Save Whim] Failed to upload figure ${figure.id}:`, error);
          // Continue with other figures
        }
      }
      console.log(`[Save Whim] Successfully uploaded ${persistedFigures.length} figures`);
    }

    // Convert to whim data (with persisted figures)
    const whimData = analysisToWhimData(analysis, persistedFigures);

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
