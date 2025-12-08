import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

// Lazy initialization to avoid build-time errors
let s3Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (s3Client) return s3Client;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials not configured");
  }

  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return s3Client;
}

export interface UploadResult {
  key: string;
  url: string;
  size: number;
}

/**
 * Upload a file to R2
 */
export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<UploadResult> {
  const client = getR2Client();
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!bucket || !publicUrl) {
    throw new Error("R2 bucket or public URL not configured");
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return {
    key,
    url: `${publicUrl}/${key}`,
    size: buffer.length,
  };
}

/**
 * Delete a file from R2
 */
export async function deleteFromR2(key: string): Promise<void> {
  const client = getR2Client();
  const bucket = process.env.R2_BUCKET_NAME;

  if (!bucket) {
    throw new Error("R2 bucket not configured");
  }

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}

/**
 * Generate a unique key for an image
 */
export function generateImageKey(
  userId: string,
  source: "chat" | "whim" | "ai-generated",
  extension: string = "webp"
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${userId}/${source}/${timestamp}-${random}.${extension}`;
}

/**
 * Result of persisting AI-generated images
 */
export interface PersistImageResult {
  content: string;
  imageUrls: string[];
}

/**
 * Extract base64 images from markdown, upload to R2, and replace with URLs
 *
 * Finds patterns like: ![Generated Image](data:image/png;base64,...)
 * Uploads to R2 and replaces with: ![Generated Image](https://r2-url/...)
 */
export async function persistGeneratedImages(
  content: string,
  userId: string
): Promise<PersistImageResult> {
  const imageUrls: string[] = [];

  // Match markdown images with base64 data
  const imageRegex = /!\[([^\]]*)\]\(data:(image\/([^;]+));base64,([A-Za-z0-9+/=\s]+?)\)/g;

  // Find all matches first
  const matches: Array<{
    fullMatch: string;
    altText: string;
    mimeType: string;
    extension: string;
    base64Data: string;
  }> = [];

  let match;
  while ((match = imageRegex.exec(content)) !== null) {
    matches.push({
      fullMatch: match[0],
      altText: match[1],
      mimeType: match[2],
      extension: match[3] || 'png',
      base64Data: match[4].replace(/\s/g, ''), // Remove any whitespace
    });
  }

  if (matches.length === 0) {
    return { content, imageUrls };
  }

  // Process each match
  let modifiedContent = content;

  for (const img of matches) {
    try {
      // Convert base64 to buffer
      const buffer = Buffer.from(img.base64Data, 'base64');

      // Generate key and upload
      const key = generateImageKey(userId, 'ai-generated', img.extension);
      const result = await uploadToR2(buffer, key, img.mimeType);

      // Replace base64 with URL in content
      const newMarkdown = `![${img.altText}](${result.url})`;
      modifiedContent = modifiedContent.replace(img.fullMatch, newMarkdown);

      imageUrls.push(result.url);

      console.log(`[R2] Persisted AI-generated image: ${key} (${buffer.length} bytes)`);
    } catch (error) {
      console.error('[R2] Failed to persist AI-generated image:', error);
      // Keep original base64 on failure (will be stripped later)
    }
  }

  return { content: modifiedContent, imageUrls };
}
