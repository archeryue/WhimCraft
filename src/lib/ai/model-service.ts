import { ProviderFactory } from '@/lib/providers/provider-factory';
import { AIMessage } from '@/types/ai-providers';
import { GEMINI_MODELS, ModelTier } from '@/config/models';

/**
 * Centralized AI Model Service
 * Encapsulates all model invocations to keep them maintainable
 */

/**
 * Generate a concise title for a conversation using AI
 */
export async function generateTitle(messages: AIMessage[]): Promise<string> {
  try {
    // Use Gemini Flash Lite for cost-effective title generation
    const provider = ProviderFactory.createDefaultProvider(GEMINI_MODELS[ModelTier.LITE]);

    // Build a summary of the conversation
    const conversationSummary = messages
      .slice(0, 6) // Take first 6 messages for context
      .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.slice(0, 200)}`)
      .join('\n');

    const systemPrompt = `Analyze this conversation and generate a short, concise title (4-5 words maximum).
The title should capture the main topic. Be brief and direct.
Use title case. Do not use quotes, articles (a, an, the), or special formatting.

Conversation:
${conversationSummary}

Title:`;

    const result = await provider.generateResponse(
      [{ role: 'user', content: conversationSummary }],
      systemPrompt,
      0.3 // Low temperature for consistent titles
    );

    let title = result.content.trim();

    // Clean up the title
    title = title.replace(/^["']|["']$/g, ''); // Remove quotes
    title = title.replace(/^Title:\s*/i, ''); // Remove "Title:" prefix
    title = title.slice(0, 100); // Max 100 chars

    // Fallback if title generation fails
    if (!title || title.length < 3) {
      const firstUserMessage = messages.find(m => m.role === 'user');
      if (firstUserMessage) {
        title = firstUserMessage.content.slice(0, 50).trim();
        if (firstUserMessage.content.length > 50) {
          title += '...';
        }
      } else {
        title = 'Untitled Whim';
      }
    }

    return title;
  } catch (error) {
    console.error('Error generating title:', error);

    // Fallback: Use first user message
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (firstUserMessage) {
      let title = firstUserMessage.content.slice(0, 50).trim();
      if (firstUserMessage.content.length > 50) {
        title += '...';
      }
      return title;
    }

    return 'Untitled Whim';
  }
}

/**
 * Generate an article from a conversation using AI
 * Rewrites the Q&A format into a cohesive article
 */
export async function generateArticle(messages: AIMessage[]): Promise<string> {
  try {
    // Use Main model (Gemini 2.5 Flash) for high-quality article generation
    const provider = ProviderFactory.createDefaultProvider(GEMINI_MODELS[ModelTier.MAIN]);

    // Build conversation context
    const conversationText = messages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const systemPrompt = `You are an expert writer who specializes in transforming conversations into well-structured articles.

Your task is to analyze the conversation below and rewrite it as a cohesive, well-organized article.

Guidelines:
- Extract the key insights, information, and conclusions from the conversation
- Structure the content logically with clear sections
- Use markdown formatting (headings, lists, bold, italic, code blocks, etc.)
- Maintain the original language (English, Chinese, or mixed)
- Write in a clear, engaging style suitable for documentation or blog posts
- Synthesize Q&A exchanges into flowing prose rather than preserving the chat format
- Preserve important details, examples, and technical information
- Use appropriate headings to organize the content (##, ###)
- If code examples were discussed, include them in proper code blocks

Do NOT:
- Add a title (it will be generated separately)
- Include meta-commentary about the conversation itself
- Add greetings or sign-offs
- Reference "the user" or "the assistant" - write as a standalone article

Conversation:
${conversationText}

Article:`;

    const result = await provider.generateResponse(
      [{ role: 'user', content: 'Please write the article.' }],
      systemPrompt,
      0.7 // Balanced temperature for creative but coherent writing
    );

    return result.content.trim();
  } catch (error) {
    console.error('Error generating article:', error);
    throw new Error('Failed to generate article from conversation');
  }
}
