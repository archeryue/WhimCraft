/**
 * Image Generate Tool
 *
 * Generates images using Gemini's native image generation capabilities.
 * Uses AI-powered prompt enhancement to improve image quality.
 */

import { ToolParameter, ToolResult } from '@/types/agent';
import { BaseTool, successResult, errorResult } from './base';
import { ProviderFactory } from '@/lib/providers/provider-factory';
import { GEMINI_MODELS, ModelTier } from '@/config/models';
import { promptEnhancer } from '@/lib/image/prompt-enhancer';

export class ImageGenerateTool extends BaseTool {
  name = 'image_generate';

  description = `Generate images based on text descriptions using AI, with optional reference images for image-to-image generation. Use this when the user asks you to create, draw, generate, or visualize images. Returns the generated image as base64 data.

Guidelines:
- Provide detailed, descriptive prompts for better results
- Specify style, colors, composition when relevant
- Reference images: If the user has uploaded images, they will be automatically used as reference for image-to-image generation (style transfer, modifications, variations, etc.)
- Note: Cannot generate images of real people or copyrighted characters

Image-to-Image Use Cases:
- Style transfer: "Make this photo look like a Van Gogh painting"
- Variations: "Generate similar versions of this image"
- Modifications: "Change the background to a sunset"
- Edits: "Remove the background" or "Add a hat to the person"`;

  parameters: ToolParameter[] = [
    {
      name: 'prompt',
      type: 'string',
      description: 'Detailed description of the image to generate',
      required: true,
    },
    {
      name: 'style',
      type: 'string',
      description: 'Art style (e.g., "photorealistic", "cartoon", "watercolor", "oil painting")',
      required: false,
    },
    {
      name: 'aspectRatio',
      type: 'string',
      description: 'Aspect ratio: "square", "landscape", "portrait". Defaults to "square".',
      required: false,
      enum: ['square', 'landscape', 'portrait'],
    },
  ];

  protected async run(params: Record<string, unknown>): Promise<ToolResult> {
    const prompt = params.prompt as string;
    const style = params.style as string | undefined;
    const aspectRatio = (params.aspectRatio as string) || 'square';

    try {
      // Check if there are reference images from uploaded files
      const referenceImages = this.context?.files?.filter(
        (file) => file.type === 'image'
      );
      const hasReferenceImages = !!(referenceImages && referenceImages.length > 0);

      if (hasReferenceImages) {
        console.log(
          `[ImageGenerateTool] Image-to-image mode: ${referenceImages!.length} reference image(s)`
        );
      }

      // Step 1: AI-powered prompt enhancement using Gemini Flash Lite
      console.log('[ImageGenerateTool] Enhancing prompt with AI...');
      const enhancementResult = await promptEnhancer.enhance(
        prompt,
        hasReferenceImages
      );

      let enhancedPrompt = enhancementResult.enhancedPrompt;

      console.log('[ImageGenerateTool] Prompt enhancement complete:', {
        original: enhancementResult.originalPrompt,
        enhanced: enhancementResult.enhancedPrompt,
        enhancements: enhancementResult.enhancements,
        hasReferenceImages,
      });

      // Step 2: Add style if user specified one
      if (style) {
        enhancedPrompt = `${enhancedPrompt}, in ${style} style`;
      }

      // Step 3: Add aspect ratio hint (only for text-to-image, not for image-to-image)
      if (!hasReferenceImages) {
        switch (aspectRatio) {
          case 'landscape':
            enhancedPrompt += ', wide landscape composition';
            break;
          case 'portrait':
            enhancedPrompt += ', vertical portrait composition';
            break;
          default:
            enhancedPrompt += ', square composition';
        }
      }

      // Get the IMAGE tier provider (use IMAGE_PRO if conversation is in PRO mode)
      const modelTier =
        this.context?.modelTier === 'pro'
          ? ModelTier.IMAGE_PRO
          : ModelTier.IMAGE;
      const provider = ProviderFactory.createDefaultProvider(
        GEMINI_MODELS[modelTier]
      );

      // Build system prompt based on mode
      const systemPrompt = hasReferenceImages
        ? `You are an image generation model with image-to-image capabilities. The user has provided reference image(s). Generate a new image based on the user's description and the reference image(s). You can perform style transfer, variations, modifications, or edits based on the reference.`
        : `You are an image generation model. Generate an image based on the user's description. Return the image directly.`;

      // Pass reference images to the provider if available
      const response = await provider.generateResponse(
        [{ role: 'user', content: enhancedPrompt }],
        systemPrompt,
        0.8,
        referenceImages
      );

      // Return result with metadata
      return successResult(
        {
          generatedContent: response.content,
          prompt: enhancedPrompt,
          originalPrompt: prompt,
          style,
          aspectRatio,
          hasReferenceImages,
          referenceImageCount: referenceImages?.length || 0,
          message: hasReferenceImages
            ? `Image-to-image generation using ${referenceImages!.length} reference image(s)`
            : 'Text-to-image generation',
        },
        {
          executionTime: 0,
          tokensUsed: response.usage?.totalTokens || 0,
        }
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Image generation failed';
      return errorResult(`Image generation failed: ${message}`);
    }
  }
}

// Export singleton instance
export const imageGenerateTool = new ImageGenerateTool();
