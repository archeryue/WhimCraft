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
