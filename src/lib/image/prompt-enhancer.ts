import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_MODELS, ModelTier } from "@/config/models";

/**
 * Image Prompt Enhancer
 *
 * Uses Gemini Flash Lite to enhance user's image generation prompts
 * by adding detail, style, lighting, and composition guidance.
 *
 * Cost: ~$0.000002 per enhancement (Flash Lite is very cheap)
 */

export interface PromptEnhancementResult {
  originalPrompt: string;
  enhancedPrompt: string;
  enhancements: string[];  // List of what was added
}

const ENHANCEMENT_SYSTEM_PROMPT_TEXT_TO_IMAGE = `You are an expert image generation prompt engineer. Your job is to take a user's brief image description and enhance it into a detailed, high-quality prompt for image generation models.

**Your Task:**
1. Analyze the user's input to understand their intent
2. Expand it with relevant details about:
   - Art style (photorealistic, digital art, oil painting, etc.)
   - Lighting (warm/cool, dramatic, soft, studio, natural, etc.)
   - Composition (rule of thirds, centered, dynamic, etc.)
   - Quality markers (4K, detailed, professional, etc.)
   - Textures and materials (if relevant)
   - Mood and atmosphere

**Guidelines:**
- Keep the core subject from the user's input
- Add 2-5 descriptive enhancements (don't overdo it)
- Use professional photography/art terminology
- Be specific but concise
- Avoid vague terms like "nice" or "good"
- Don't add watermarks or text elements

**Output Format:**
Return ONLY a JSON object with this exact structure:
{
  "enhancedPrompt": "The detailed, enhanced prompt here",
  "enhancements": ["Enhancement 1", "Enhancement 2", ...]
}

**Example:**
Input: "a cat playing piano"
Output:
{
  "enhancedPrompt": "A fluffy orange tabby cat sitting at a grand piano, paws on the keys, warm studio lighting, photorealistic style, detailed fur texture, elegant composition, shallow depth of field, professional photography",
  "enhancements": [
    "Added specific breed details (tabby)",
    "Specified grand piano",
    "Added warm studio lighting",
    "Specified photorealistic style",
    "Added texture details (fur)",
    "Added composition guidance (elegant, shallow DoF)"
  ]
}`;

const ENHANCEMENT_SYSTEM_PROMPT_IMAGE_TO_IMAGE = `You are an expert image-to-image prompt engineer. The user has provided reference image(s) and wants to transform or modify them. Your job is to take their brief instruction and enhance it into a clear, actionable prompt.

**Your Task:**
1. Analyze the user's instruction to understand what transformation they want
2. Enhance it with specific guidance about:
   - What to preserve from the reference image
   - What to change or transform
   - Style transfer instructions (if applicable)
   - Specific modifications or edits
   - Quality markers for the transformation

**Guidelines for Image-to-Image:**
- Focus on transformation instructions rather than generating from scratch
- Be clear about what elements to keep vs. change
- For style transfer: specify the target style clearly
- For modifications: be specific about what to add/remove/change
- For variations: specify how to vary while maintaining essence
- Keep instructions concise and actionable

**Output Format:**
Return ONLY a JSON object with this exact structure:
{
  "enhancedPrompt": "The detailed transformation instructions here",
  "enhancements": ["Enhancement 1", "Enhancement 2", ...]
}

**Examples:**
Input: "make it look like a Van Gogh painting"
Output:
{
  "enhancedPrompt": "Transform this image into Van Gogh's post-impressionist style with bold, swirling brushstrokes, vibrant colors, and expressive texture. Maintain the composition and main subject while applying Van Gogh's characteristic thick impasto technique and emotional color palette",
  "enhancements": [
    "Specified post-impressionist style",
    "Added brushstroke details (swirling, bold)",
    "Emphasized color vibrancy",
    "Noted impasto technique",
    "Specified to maintain composition"
  ]
}

Input: "change the background to a sunset"
Output:
{
  "enhancedPrompt": "Keep the main subject exactly as is, but replace the background with a dramatic sunset scene featuring warm orange and pink hues, soft golden hour lighting, and subtle clouds. Ensure proper lighting adjustment on the subject to match the sunset ambiance",
  "enhancements": [
    "Specified to preserve main subject",
    "Added sunset color details (orange, pink)",
    "Mentioned golden hour lighting",
    "Added atmospheric details (clouds)",
    "Noted lighting consistency requirement"
  ]
}`;

class PromptEnhancer {
  private genAI: GoogleGenerativeAI | null = null;

  private getGenAI(): GoogleGenerativeAI {
    if (!this.genAI) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not set");
      }
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
    return this.genAI;
  }

  /**
   * Enhance an image generation prompt
   *
   * @param userPrompt - The user's original prompt
   * @param hasReferenceImages - Whether reference images are provided (for image-to-image)
   * @returns Enhanced prompt with details
   */
  async enhance(
    userPrompt: string,
    hasReferenceImages: boolean = false
  ): Promise<PromptEnhancementResult> {
    try {
      // Use Flash Lite for cost efficiency (~50 tokens * $0.00004/1K = $0.000002)
      const genAI = this.getGenAI();
      const model = genAI.getGenerativeModel({
        model: GEMINI_MODELS[ModelTier.LITE],
      });

      // Choose system prompt based on mode
      const systemPrompt = hasReferenceImages
        ? ENHANCEMENT_SYSTEM_PROMPT_IMAGE_TO_IMAGE
        : ENHANCEMENT_SYSTEM_PROMPT_TEXT_TO_IMAGE;

      const promptType = hasReferenceImages
        ? 'image transformation instruction'
        : 'image request';
      const prompt = `User's ${promptType}: "${userPrompt}"

Enhance this into a detailed ${hasReferenceImages ? 'transformation' : 'image generation'} prompt following the guidelines above.`;

      console.log(
        `[PromptEnhancer] Enhancing ${hasReferenceImages ? 'image-to-image' : 'text-to-image'} prompt: "${userPrompt}"`
      );

      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        systemInstruction: systemPrompt,
        generationConfig: {
          temperature: 0.7, // Some creativity, but not too wild
          maxOutputTokens: 300, // Keep it concise
        },
      });

      const response = result.response;
      const text = response.text();

      console.log(`[PromptEnhancer] Raw response: ${text}`);

      // Parse JSON response
      let parsedResponse;
      try {
        // Try to extract JSON if it's wrapped in markdown code blocks
        const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/```\n?([\s\S]*?)\n?```/) || [null, text];
        const jsonText = jsonMatch[1] || text;
        parsedResponse = JSON.parse(jsonText.trim());
      } catch (parseError) {
        console.error('[PromptEnhancer] Failed to parse JSON, using fallback:', parseError);
        // Fallback: Return enhanced text as-is
        return {
          originalPrompt: userPrompt,
          enhancedPrompt: text.trim(),
          enhancements: ['AI-generated enhancement'],
        };
      }

      const enhancedPrompt = parsedResponse.enhancedPrompt || text.trim();
      const enhancements = parsedResponse.enhancements || [];

      console.log(`[PromptEnhancer] Enhanced: "${enhancedPrompt}"`);
      console.log(`[PromptEnhancer] Enhancements: ${enhancements.join(', ')}`);

      return {
        originalPrompt: userPrompt,
        enhancedPrompt,
        enhancements,
      };
    } catch (error) {
      console.error('[PromptEnhancer] Enhancement failed:', error);

      // Fallback: Return original prompt if enhancement fails
      return {
        originalPrompt: userPrompt,
        enhancedPrompt: userPrompt,
        enhancements: [],
      };
    }
  }
}

// Export singleton instance
export const promptEnhancer = new PromptEnhancer();
