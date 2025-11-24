import { AIMessage } from '@/types/ai-providers';
import { generateJSON } from '@tiptap/html/server';
import StarterKit from '@tiptap/starter-kit';
import { marked } from 'marked';
import { JSONContent } from '@tiptap/core';
import { generateTitle, generateArticle } from '@/lib/ai/model-service';

// Configure marked options
marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * Convert a conversation to markdown format
 */
export function conversationToMarkdown(messages: AIMessage[]): string {
  let markdown = '';

  for (const message of messages) {
    const role = message.role === 'user' ? 'User' : 'AI';
    markdown += `## ${role}\n\n`;
    markdown += `${message.content}\n\n`;
    markdown += `---\n\n`;
  }

  return markdown.trim();
}

/**
 * Generate a concise title for a conversation using AI
 * @deprecated Use generateTitle from @/lib/ai/model-service instead
 */
export async function generateConversationTitle(messages: AIMessage[]): Promise<string> {
  return generateTitle(messages);
}

/**
 * Convert a conversation to TipTap JSON blocks format
 * This parses markdown content into structured blocks
 */
export function conversationToBlocks(messages: AIMessage[]): JSONContent {
  // Build markdown first
  const markdown = conversationToMarkdown(messages);

  // Convert markdown to HTML
  const html = marked.parse(markdown) as string;

  // Parse HTML to TipTap JSON using StarterKit extensions
  const json = generateJSON(html, [StarterKit]);

  return json;
}

/**
 * Convert conversation to whim (markdown + title)
 * @deprecated Use convertConversationToWhimBlocks instead for new whims
 */
export async function convertConversationToWhim(messages: AIMessage[]): Promise<{
  title: string;
  content: string;
}> {
  const [title, content] = await Promise.all([
    generateConversationTitle(messages),
    Promise.resolve(conversationToMarkdown(messages))
  ]);

  return { title, content };
}

/**
 * Convert conversation to whim with JSON blocks (new format)
 * Preserves the Q&A chat format
 */
export async function convertConversationToWhimBlocks(messages: AIMessage[]): Promise<{
  title: string;
  blocks: JSONContent;
}> {
  const [title, blocks] = await Promise.all([
    generateConversationTitle(messages),
    Promise.resolve(conversationToBlocks(messages))
  ]);

  return { title, blocks };
}

/**
 * Convert conversation to article-style whim using AI
 * Rewrites the conversation as a cohesive article instead of preserving Q&A format
 */
export async function convertConversationToArticleBlocks(messages: AIMessage[]): Promise<{
  title: string;
  blocks: JSONContent;
}> {
  // Generate both title and article content in parallel
  const [title, articleMarkdown] = await Promise.all([
    generateTitle(messages),
    generateArticle(messages)
  ]);

  // Convert article markdown to HTML
  const html = marked.parse(articleMarkdown) as string;

  // Parse HTML to TipTap JSON using StarterKit extensions
  const blocks = generateJSON(html, [StarterKit]);

  return { title, blocks };
}
