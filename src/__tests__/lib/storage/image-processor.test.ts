/**
 * Tests for Image Processor
 *
 * Tests the image processing utility functions.
 * Complex processing functions are tested via E2E tests.
 */

import { isValidImageType } from "@/lib/storage/image-processor";

describe("Image Processor", () => {
  describe("isValidImageType", () => {
    it("should accept valid JPEG MIME type", () => {
      expect(isValidImageType("image/jpeg")).toBe(true);
    });

    it("should accept valid PNG MIME type", () => {
      expect(isValidImageType("image/png")).toBe(true);
    });

    it("should accept valid GIF MIME type", () => {
      expect(isValidImageType("image/gif")).toBe(true);
    });

    it("should accept valid WebP MIME type", () => {
      expect(isValidImageType("image/webp")).toBe(true);
    });

    it("should reject invalid MIME types", () => {
      expect(isValidImageType("image/bmp")).toBe(false);
      expect(isValidImageType("image/tiff")).toBe(false);
      expect(isValidImageType("application/pdf")).toBe(false);
      expect(isValidImageType("text/plain")).toBe(false);
      expect(isValidImageType("")).toBe(false);
    });

    it("should reject MIME types with charset", () => {
      expect(isValidImageType("image/jpeg;charset=utf-8")).toBe(false);
    });

    it("should be case sensitive", () => {
      expect(isValidImageType("IMAGE/JPEG")).toBe(false);
      expect(isValidImageType("Image/Png")).toBe(false);
    });

    it("should reject partial matches", () => {
      expect(isValidImageType("image/jpegx")).toBe(false);
      expect(isValidImageType("ximage/jpeg")).toBe(false);
    });
  });
});
