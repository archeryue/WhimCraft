import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { uploadToR2, generateImageKey } from "@/lib/storage/r2-client";
import {
  processImage,
  generateThumbnail,
  isValidImageType,
} from "@/lib/storage/image-processor";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const source = (formData.get("source") as string) || "chat";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!isValidImageType(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed." },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    // Convert to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Process image (resize + convert to WebP)
    const processed = await processImage(buffer);

    // Generate thumbnail
    const thumbnail = await generateThumbnail(buffer);

    // Generate unique keys
    const validSource = ["chat", "whim", "ai-generated"].includes(source)
      ? (source as "chat" | "whim" | "ai-generated")
      : "chat";

    const imageKey = generateImageKey(session.user.id, validSource);
    const thumbnailKey = imageKey.replace(".webp", "-thumb.webp");

    // Upload to R2
    const [imageResult, thumbnailResult] = await Promise.all([
      uploadToR2(processed.buffer, imageKey, "image/webp"),
      uploadToR2(thumbnail.buffer, thumbnailKey, "image/webp"),
    ]);

    return NextResponse.json({
      success: true,
      url: imageResult.url,
      thumbnailUrl: thumbnailResult.url,
      key: imageResult.key,
      thumbnailKey: thumbnailResult.key,
      width: processed.width,
      height: processed.height,
      size: processed.size,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}
