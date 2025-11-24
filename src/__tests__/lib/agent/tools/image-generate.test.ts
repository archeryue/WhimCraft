/**
 * Tests for ImageGenerateTool with AI Prompt Enhancement
 */

import { ImageGenerateTool } from '@/lib/agent/tools/image-generate';
import { promptEnhancer } from '@/lib/image/prompt-enhancer';
import { ProviderFactory } from '@/lib/providers/provider-factory';

// Mock the dependencies
jest.mock('@/lib/image/prompt-enhancer');
jest.mock('@/lib/providers/provider-factory');

describe('ImageGenerateTool', () => {
  let tool: ImageGenerateTool;
  let mockEnhance: jest.MockedFunction<typeof promptEnhancer.enhance>;
  let mockGenerateResponse: jest.Mock;
  let defaultContext: any;

  beforeEach(() => {
    tool = new ImageGenerateTool();

    // Default context for tests
    defaultContext = {
      userId: 'test-user',
      conversationId: 'test-conv',
      requestId: 'test-req',
    };

    // Mock prompt enhancer
    mockEnhance = promptEnhancer.enhance as jest.MockedFunction<typeof promptEnhancer.enhance>;

    // Mock provider
    mockGenerateResponse = jest.fn();
    (ProviderFactory.createDefaultProvider as jest.Mock).mockReturnValue({
      generateResponse: mockGenerateResponse,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Prompt Enhancement Integration', () => {
    it('should enhance basic prompt with AI', async () => {
      // Setup
      mockEnhance.mockResolvedValue({
        originalPrompt: 'a cat',
        enhancedPrompt: 'A fluffy orange cat, photorealistic style, warm lighting, detailed fur texture',
        enhancements: ['photorealistic style', 'warm lighting', 'detailed fur texture'],
      });

      mockGenerateResponse.mockResolvedValue({
        content: 'generated image data',
        usage: { totalTokens: 100 },
      });

      // Execute
      const result = await tool.execute({ prompt: 'a cat' }, defaultContext);

      // Verify enhancement was called
      expect(mockEnhance).toHaveBeenCalledWith('a cat', false);

      // Verify enhanced prompt was used for generation
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('fluffy orange cat'),
          }),
        ]),
        expect.any(String),
        0.8,
        undefined
      );

      // Verify success
      expect(result.success).toBe(true);
    });

    it('should add style to enhanced prompt when provided', async () => {
      // Setup
      mockEnhance.mockResolvedValue({
        originalPrompt: 'a sunset',
        enhancedPrompt: 'A beautiful sunset over mountains, vibrant colors',
        enhancements: ['vibrant colors'],
      });

      mockGenerateResponse.mockResolvedValue({
        content: 'generated image data',
        usage: { totalTokens: 100 },
      });

      // Execute with style parameter
      await tool.execute(
        {
          prompt: 'a sunset',
          style: 'watercolor',
        },
        defaultContext
      );

      // Verify style was appended to enhanced prompt
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('watercolor style'),
          }),
        ]),
        expect.any(String),
        0.8,
        undefined
      );
    });

    it('should add aspect ratio hints to enhanced prompt', async () => {
      // Setup
      mockEnhance.mockResolvedValue({
        originalPrompt: 'a landscape',
        enhancedPrompt: 'A scenic mountain landscape',
        enhancements: [],
      });

      mockGenerateResponse.mockResolvedValue({
        content: 'generated image data',
        usage: { totalTokens: 100 },
      });

      // Execute with landscape aspect ratio
      await tool.execute(
        {
          prompt: 'a landscape',
          aspectRatio: 'landscape',
        },
        defaultContext
      );

      // Verify aspect ratio hint was added
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('wide landscape composition'),
          }),
        ]),
        expect.any(String),
        0.8,
        undefined
      );
    });

    it('should handle portrait aspect ratio', async () => {
      // Setup
      mockEnhance.mockResolvedValue({
        originalPrompt: 'a person',
        enhancedPrompt: 'A person standing tall',
        enhancements: [],
      });

      mockGenerateResponse.mockResolvedValue({
        content: 'generated image data',
        usage: { totalTokens: 100 },
      });

      // Execute with portrait aspect ratio
      await tool.execute(
        {
          prompt: 'a person',
          aspectRatio: 'portrait',
        },
        defaultContext
      );

      // Verify portrait composition was added
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('vertical portrait composition'),
          }),
        ]),
        expect.any(String),
        0.8,
        undefined
      );
    });

    it('should default to square composition when no aspect ratio specified', async () => {
      // Setup
      mockEnhance.mockResolvedValue({
        originalPrompt: 'a circle',
        enhancedPrompt: 'A perfect circle',
        enhancements: [],
      });

      mockGenerateResponse.mockResolvedValue({
        content: 'generated image data',
        usage: { totalTokens: 100 },
      });

      // Execute without aspect ratio
      await tool.execute(
        {
          prompt: 'a circle',
        },
        defaultContext
      );

      // Verify square composition was added
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('square composition'),
          }),
        ]),
        expect.any(String),
        0.8,
        undefined
      );
    });
  });

  describe('Fallback Handling', () => {
    it('should use original prompt if enhancement fails', async () => {
      // Setup - enhancement returns original on failure
      mockEnhance.mockResolvedValue({
        originalPrompt: 'a dog',
        enhancedPrompt: 'a dog', // Same as original (fallback behavior)
        enhancements: [],
      });

      mockGenerateResponse.mockResolvedValue({
        content: 'generated image data',
        usage: { totalTokens: 100 },
      });

      // Execute
      const result = await tool.execute({ prompt: 'a dog' }, defaultContext);

      // Verify it still works
      expect(result.success).toBe(true);
      expect(mockGenerateResponse).toHaveBeenCalled();
    });

    it('should return error if image generation fails', async () => {
      // Setup
      mockEnhance.mockResolvedValue({
        originalPrompt: 'test',
        enhancedPrompt: 'Enhanced test prompt',
        enhancements: [],
      });

      mockGenerateResponse.mockRejectedValue(new Error('Generation API failed'));

      // Execute
      const result = await tool.execute({ prompt: 'test' }, defaultContext);

      // Verify error handling
      expect(result.success).toBe(false);
      expect(result.error).toContain('Image generation failed');
    });
  });

  describe('Tool Metadata', () => {
    it('should have correct tool name', () => {
      expect(tool.name).toBe('image_generate');
    });

    it('should have description', () => {
      expect(tool.description).toBeTruthy();
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

    it('should have optional aspectRatio parameter with enum', () => {
      const aspectParam = tool.parameters.find(p => p.name === 'aspectRatio');
      expect(aspectParam).toBeDefined();
      expect(aspectParam?.required).toBe(false);
      expect(aspectParam?.enum).toEqual(['square', 'landscape', 'portrait']);
    });
  });

  describe('Image-to-Image Mode', () => {
    it('should detect reference images from context', async () => {
      // Setup context with image files
      const mockFiles = [
        {
          id: 'img1',
          name: 'photo.jpg',
          type: 'image',
          mimeType: 'image/jpeg',
          size: 1024,
          data: 'base64data',
        },
      ];

      const context = {
        userId: 'test-user',
        conversationId: 'test-conv',
        requestId: 'test-req',
        files: mockFiles as any,
      };

      mockEnhance.mockResolvedValue({
        originalPrompt: 'make it artistic',
        enhancedPrompt: 'Transform into artistic style with bold colors',
        enhancements: ['artistic style', 'bold colors'],
      });

      mockGenerateResponse.mockResolvedValue({
        content: 'generated image data',
        usage: { totalTokens: 100 },
      });

      // Execute
      const result = await tool.execute({ prompt: 'make it artistic' }, context);

      // Verify enhancement was called with hasReferenceImages = true
      expect(mockEnhance).toHaveBeenCalledWith('make it artistic', true);

      // Verify reference images were passed to provider
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.any(Array),
        expect.stringContaining('image-to-image'),
        0.8,
        mockFiles
      );

      // Verify result contains image-to-image metadata
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        hasReferenceImages: true,
        referenceImageCount: 1,
      });
    });

    it('should filter only image files from context', async () => {
      // Setup context with mixed file types
      const mockFiles = [
        {
          id: 'img1',
          name: 'photo.jpg',
          type: 'image',
          mimeType: 'image/jpeg',
          size: 1024,
          data: 'base64data',
        },
        {
          id: 'pdf1',
          name: 'document.pdf',
          type: 'pdf',
          mimeType: 'application/pdf',
          size: 2048,
          data: 'base64data',
        },
      ];

      const context = {
        userId: 'test-user',
        conversationId: 'test-conv',
        requestId: 'test-req',
        files: mockFiles as any,
      };

      mockEnhance.mockResolvedValue({
        originalPrompt: 'style transfer',
        enhancedPrompt: 'Apply style transfer',
        enhancements: [],
      });

      mockGenerateResponse.mockResolvedValue({
        content: 'generated image data',
        usage: { totalTokens: 100 },
      });

      // Execute
      const result = await tool.execute({ prompt: 'style transfer' }, context);

      // Verify only image file was passed (PDF filtered out)
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        0.8,
        [mockFiles[0]]
      );

      // Verify count
      expect(result.data).toMatchObject({
        referenceImageCount: 1,
      });
    });

    it('should work with multiple reference images', async () => {
      // Setup context with multiple images
      const mockFiles = [
        {
          id: 'img1',
          name: 'photo1.jpg',
          type: 'image',
          mimeType: 'image/jpeg',
          size: 1024,
          data: 'base64data1',
        },
        {
          id: 'img2',
          name: 'photo2.png',
          type: 'image',
          mimeType: 'image/png',
          size: 2048,
          data: 'base64data2',
        },
      ];

      const context = {
        userId: 'test-user',
        conversationId: 'test-conv',
        requestId: 'test-req',
        files: mockFiles as any,
      };

      mockEnhance.mockResolvedValue({
        originalPrompt: 'combine these',
        enhancedPrompt: 'Combine these images creatively',
        enhancements: [],
      });

      mockGenerateResponse.mockResolvedValue({
        content: 'generated image data',
        usage: { totalTokens: 100 },
      });

      // Execute
      const result = await tool.execute({ prompt: 'combine these' }, context);

      // Verify both images were passed
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        0.8,
        mockFiles
      );

      expect(result.data).toMatchObject({
        referenceImageCount: 2,
      });
    });

    it('should not add aspect ratio hints in image-to-image mode', async () => {
      // Setup context with image file
      const mockFiles = [
        {
          id: 'img1',
          name: 'photo.jpg',
          type: 'image',
          mimeType: 'image/jpeg',
          size: 1024,
          data: 'base64data',
        },
      ];

      const context = {
        userId: 'test-user',
        conversationId: 'test-conv',
        requestId: 'test-req',
        files: mockFiles as any,
      };

      mockEnhance.mockResolvedValue({
        originalPrompt: 'edit this',
        enhancedPrompt: 'Edit with enhancements',
        enhancements: [],
      });

      mockGenerateResponse.mockResolvedValue({
        content: 'generated image data',
        usage: { totalTokens: 100 },
      });

      // Execute with aspect ratio parameter
      await tool.execute(
        {
          prompt: 'edit this',
          aspectRatio: 'landscape',
        },
        context
      );

      // Verify aspect ratio hint was NOT added (image-to-image mode)
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.not.stringContaining('landscape composition'),
          }),
        ]),
        expect.any(String),
        0.8,
        mockFiles
      );
    });

    it('should use text-to-image mode when no images in context', async () => {
      // Setup context without files
      const context = {
        userId: 'test-user',
        conversationId: 'test-conv',
        requestId: 'test-req',
        files: undefined,
      };

      mockEnhance.mockResolvedValue({
        originalPrompt: 'a dog',
        enhancedPrompt: 'A fluffy dog',
        enhancements: [],
      });

      mockGenerateResponse.mockResolvedValue({
        content: 'generated image data',
        usage: { totalTokens: 100 },
      });

      // Execute
      const result = await tool.execute({ prompt: 'a dog' }, context);

      // Verify enhancement was called with hasReferenceImages = false
      expect(mockEnhance).toHaveBeenCalledWith('a dog', false);

      // Verify no files were passed to provider
      expect(mockGenerateResponse).toHaveBeenCalledWith(
        expect.any(Array),
        expect.not.stringContaining('image-to-image'),
        0.8,
        undefined
      );

      // Verify result metadata
      expect(result.data).toMatchObject({
        hasReferenceImages: false,
        referenceImageCount: 0,
      });
    });
  });
});
