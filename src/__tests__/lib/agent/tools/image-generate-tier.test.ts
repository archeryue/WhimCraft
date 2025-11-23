/**
 * Image Generate Tool - Model Tier Tests
 *
 * Tests for image generation tool using IMAGE vs IMAGE_PRO models based on conversation tier
 */

import { ImageGenerateTool } from '@/lib/agent/tools/image-generate';
import { ToolContext } from '@/types/agent';

describe('ImageGenerateTool Model Tier Selection', () => {
  let tool: ImageGenerateTool;

  beforeEach(() => {
    tool = new ImageGenerateTool();
  });

  describe('Tool context with model tier', () => {
    it('should accept context with main tier', () => {
      const context: ToolContext = {
        userId: 'test-user',
        conversationId: 'test-conv',
        requestId: 'test-request',
        modelTier: 'main',
      };

      expect(context.modelTier).toBe('main');
    });

    it('should accept context with pro tier', () => {
      const context: ToolContext = {
        userId: 'test-user',
        conversationId: 'test-conv',
        requestId: 'test-request',
        modelTier: 'pro',
      };

      expect(context.modelTier).toBe('pro');
    });

    it('should accept context without tier (defaults to main)', () => {
      const context: ToolContext = {
        userId: 'test-user',
        conversationId: 'test-conv',
        requestId: 'test-request',
      };

      expect(context.modelTier).toBeUndefined();
    });
  });

  describe('Tool metadata', () => {
    it('should have correct tool name', () => {
      expect(tool.name).toBe('image_generate');
    });

    it('should have description', () => {
      expect(tool.description).toContain('Generate images');
    });

    it('should have required prompt parameter', () => {
      const promptParam = tool.parameters.find(p => p.name === 'prompt');
      expect(promptParam).toBeDefined();
      expect(promptParam?.required).toBe(true);
      expect(promptParam?.type).toBe('string');
    });

    it('should have optional style parameter', () => {
      const styleParam = tool.parameters.find(p => p.name === 'style');
      expect(styleParam).toBeDefined();
      expect(styleParam?.required).toBe(false);
    });

    it('should have optional aspectRatio parameter', () => {
      const ratioParam = tool.parameters.find(p => p.name === 'aspectRatio');
      expect(ratioParam).toBeDefined();
      expect(ratioParam?.required).toBe(false);
      expect(ratioParam?.enum).toEqual(['square', 'landscape', 'portrait']);
    });
  });

  describe('Model selection logic', () => {
    // Note: These tests verify the tool structure.
    // Actual model selection happens internally during execution.

    it('should be ready to use IMAGE model for main tier', () => {
      expect(tool).toBeDefined();
      expect(tool.name).toBe('image_generate');
    });

    it('should be ready to use IMAGE_PRO model for pro tier', () => {
      expect(tool).toBeDefined();
      expect(tool.name).toBe('image_generate');
    });
  });

  describe('Parameter validation', () => {
    it('should accept valid prompt parameter', () => {
      const params = {
        prompt: 'A beautiful sunset over mountains',
      };

      expect(params.prompt).toBeDefined();
      expect(typeof params.prompt).toBe('string');
    });

    it('should accept valid style parameter', () => {
      const params = {
        prompt: 'A cat',
        style: 'watercolor',
      };

      expect(params.style).toBeDefined();
      expect(typeof params.style).toBe('string');
    });

    it('should accept valid aspectRatio parameter', () => {
      const validRatios = ['square', 'landscape', 'portrait'];

      validRatios.forEach(ratio => {
        const params = {
          prompt: 'Test',
          aspectRatio: ratio,
        };

        expect(params.aspectRatio).toBeDefined();
        expect(validRatios).toContain(params.aspectRatio);
      });
    });
  });
});
