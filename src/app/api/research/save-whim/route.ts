/**
 * Deep Research API Route - Save Whim
 *
 * POST /api/research/save-whim
 * Saves a research result as a Whim.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { researchToWhimData } from "@/lib/research/whim-converter";
import { ResearchResult } from "@/lib/research/types";

export async function POST(req: NextRequest) {
  // Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const result: ResearchResult = body.result;

    if (!result || !result.report) {
      return NextResponse.json(
        { error: "Invalid research data" },
        { status: 400 }
      );
    }

    // Convert to Whim format
    const whimData = researchToWhimData(result);

    // Save to Firestore
    const now = Timestamp.now();
    const whimRef = await db.collection("whims").add({
      userId: session.user.id,
      title: whimData.title,
      blocks: whimData.blocks,
      metadata: whimData.metadata,
      createdAt: now,
      updatedAt: now,
    });

    console.log(
      `[Research Save Whim] Created whim ${whimRef.id} for user ${session.user.id}`
    );

    return NextResponse.json({
      whim: {
        id: whimRef.id,
        title: whimData.title,
      },
    });
  } catch (error) {
    console.error("[Research Save Whim] Error:", error);
    return NextResponse.json(
      { error: "Failed to save whim" },
      { status: 500 }
    );
  }
}
