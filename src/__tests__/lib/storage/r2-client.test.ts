/**
 * Tests for R2 Storage Client
 *
 * Tests the key generation and utility functions.
 * Upload/delete operations are tested via E2E tests.
 */

import { generateImageKey } from "@/lib/storage/r2-client";

describe("R2 Storage Client", () => {
  describe("generateImageKey", () => {
    it("should generate key with correct format", () => {
      const key = generateImageKey("user123", "chat");

      expect(key).toMatch(/^user123\/chat\/\d+-[a-z0-9]+\.webp$/);
    });

    it("should include userId in key", () => {
      const key = generateImageKey("myuser", "chat");

      expect(key.startsWith("myuser/")).toBe(true);
    });

    it("should include source in key", () => {
      const chatKey = generateImageKey("user", "chat");
      const whimKey = generateImageKey("user", "whim");
      const aiKey = generateImageKey("user", "ai-generated");

      expect(chatKey).toContain("/chat/");
      expect(whimKey).toContain("/whim/");
      expect(aiKey).toContain("/ai-generated/");
    });

    it("should use webp extension by default", () => {
      const key = generateImageKey("user", "chat");

      expect(key.endsWith(".webp")).toBe(true);
    });

    it("should allow custom extension", () => {
      const key = generateImageKey("user", "chat", "jpg");

      expect(key.endsWith(".jpg")).toBe(true);
    });

    it("should generate unique keys", () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) {
        keys.add(generateImageKey("user", "chat"));
      }

      // All 100 keys should be unique
      expect(keys.size).toBe(100);
    });

    it("should include timestamp for chronological sorting", () => {
      const before = Date.now();
      const key = generateImageKey("user", "chat");
      const after = Date.now();

      // Extract timestamp from key
      const match = key.match(/\/(\d+)-/);
      expect(match).toBeTruthy();

      const timestamp = parseInt(match![1], 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it("should generate valid path segments", () => {
      const key = generateImageKey("user-123", "chat");

      // Split by / and check each segment
      const segments = key.split("/");
      expect(segments).toHaveLength(3);
      expect(segments[0]).toBe("user-123");
      expect(segments[1]).toBe("chat");
      expect(segments[2]).toMatch(/^\d+-[a-z0-9]+\.webp$/);
    });

    it("should handle different userId formats", () => {
      const keys = [
        generateImageKey("simple", "chat"),
        generateImageKey("user-with-dashes", "chat"),
        generateImageKey("user_with_underscores", "chat"),
        generateImageKey("user123numbers", "chat"),
      ];

      keys.forEach(key => {
        expect(key).toMatch(/^[a-zA-Z0-9_-]+\/chat\/\d+-[a-z0-9]+\.webp$/);
      });
    });
  });
});
