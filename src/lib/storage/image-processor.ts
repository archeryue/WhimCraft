import sharp from "sharp";

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  size: number;
  format: "webp";
}

export interface ProcessOptions {
  maxDimension?: number; // Max width or height (default: 2000)
  quality?: number; // WebP quality 1-100 (default: 80)
}

const DEFAULT_OPTIONS: Required<ProcessOptions> = {
  maxDimension: 2000,
  quality: 80,
};

/**
 * Process an image: resize if needed and convert to WebP
 */
export async function processImage(
  input: Buffer,
  options: ProcessOptions = {}
): Promise<ProcessedImage> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Get original metadata
  const metadata = await sharp(input).metadata();
  const originalWidth = metadata.width || 0;
  const originalHeight = metadata.height || 0;

  // Calculate new dimensions if resize needed
  let width: number | undefined;
  let height: number | undefined;

  if (originalWidth > opts.maxDimension || originalHeight > opts.maxDimension) {
    if (originalWidth > originalHeight) {
      width = opts.maxDimension;
      height = Math.round((originalHeight / originalWidth) * opts.maxDimension);
    } else {
      height = opts.maxDimension;
      width = Math.round((originalWidth / originalHeight) * opts.maxDimension);
    }
  } else {
    width = originalWidth;
    height = originalHeight;
  }

  // Process image
  const buffer = await sharp(input)
    .resize(width, height, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: opts.quality })
    .toBuffer();

  return {
    buffer,
    width: width || originalWidth,
    height: height || originalHeight,
    size: buffer.length,
    format: "webp",
  };
}

/**
 * Generate a thumbnail from an image
 */
export async function generateThumbnail(
  input: Buffer,
  maxDimension: number = 400
): Promise<ProcessedImage> {
  return processImage(input, {
    maxDimension,
    quality: 70,
  });
}

/**
 * Process a base64 image string
 */
export async function processBase64Image(
  base64Data: string,
  options: ProcessOptions = {}
): Promise<ProcessedImage> {
  // Remove data URL prefix if present
  const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Clean, "base64");
  return processImage(buffer, options);
}

/**
 * Validate image MIME type
 */
export function isValidImageType(mimeType: string): boolean {
  const validTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  return validTypes.includes(mimeType);
}

/**
 * Get image dimensions from buffer
 */
export async function getImageDimensions(
  input: Buffer
): Promise<{ width: number; height: number }> {
  const metadata = await sharp(input).metadata();
  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
  };
}
