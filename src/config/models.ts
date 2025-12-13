/**
 * Model Tiering Configuration
 *
 * This configuration implements a flexible tiering strategy:
 * - Tier 1 (Main): Gemini 2.5 Flash for user-facing chat
 * - Tier 2 (Image): Gemini 2.5 Flash Image for image generation
 * - Tier 3 (Lite): Gemini 2.5 Flash-Lite for background processing
 * - Tier 4 (PRO): Gemini 3.0 Pro for advanced reasoning (opt-in)
 * - Tier 5 (Image PRO): Gemini 3.0 Pro Image for high-quality image generation (opt-in)
 * - Tier 6 (Reader): Gemini 2.5 Flash for document analysis (upgradeable to 2.5 Pro)
 * - Tier 7 (Research): Deep Research agent for comprehensive research reports
 *
 * Pricing (per 1M tokens):
 * - 2.5 Flash: $0.30 input / $2.50 output
 * - 2.5 Flash Image: $0.30 input / $2.50 output
 * - 2.5 Flash-Lite: $0.10 input / $0.40 output
 * - 3.0 Pro: $2.00 input / $12.00 output (≤200K context)
 * - 3.0 Pro Image: $2.00 text input / $0.134 per image output
 * - Deep Research: $2.00 input (uses Interactions API)
 *
 * Benefits:
 * - Cost-optimized defaults for daily use
 * - Advanced reasoning available on-demand
 * - Long-context document analysis with READER tier
 * - Same knowledge cutoff (January 2025) across all tiers
 */

export enum ModelTier {
  MAIN = "main",           // User-facing conversations
  IMAGE = "image",         // Image generation
  LITE = "lite",          // Background processing
  PRO = "pro",            // Advanced reasoning (opt-in)
  IMAGE_PRO = "image_pro", // High-quality image generation (opt-in)
  READER = "reader",       // Long-context document analysis (Paper Reader)
  RESEARCH = "research",   // Deep Research agent for comprehensive reports
}

export const GEMINI_MODELS = {
  [ModelTier.MAIN]: "gemini-2.5-flash",
  [ModelTier.IMAGE]: "gemini-2.5-flash-image",
  [ModelTier.LITE]: "gemini-2.5-flash-lite",
  [ModelTier.PRO]: "gemini-3-pro-preview",
  [ModelTier.IMAGE_PRO]: "gemini-3-pro-image-preview",
  [ModelTier.READER]: "gemini-2.5-flash",  // TODO: Consider gemini-2.5-pro for higher quality
  [ModelTier.RESEARCH]: "deep-research-pro-preview-12-2025",  // Uses Interactions API
} as const;

export const MODEL_CONFIGS = {
  [ModelTier.MAIN]: {
    model: GEMINI_MODELS[ModelTier.MAIN],
    description: "Primary model for user conversations",
    contextWindow: 1048576,        // 1M tokens
    maxOutputTokens: 65536,        // 65K tokens
    knowledgeCutoff: "January 2025",
    pricing: {
      input: 0.30,   // per 1M tokens
      output: 2.50,  // per 1M tokens
    },
  },
  [ModelTier.IMAGE]: {
    model: GEMINI_MODELS[ModelTier.IMAGE],
    description: "Specialized model for image generation",
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    knowledgeCutoff: "January 2025",
    pricing: {
      input: 0.30,
      output: 2.50,
    },
  },
  [ModelTier.LITE]: {
    model: GEMINI_MODELS[ModelTier.LITE],
    description: "Cost-optimized model for background tasks",
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    knowledgeCutoff: "January 2025",
    pricing: {
      input: 0.10,   // Updated to current pricing
      output: 0.40,  // Updated to current pricing
    },
  },
  [ModelTier.PRO]: {
    model: GEMINI_MODELS[ModelTier.PRO],
    description: "Advanced reasoning model for complex queries",
    contextWindow: 1048576,        // 1M tokens
    maxOutputTokens: 64000,        // 64K tokens
    knowledgeCutoff: "January 2025",
    status: "preview" as const,
    pricing: {
      input: 2.00,   // per 1M tokens (≤200K context)
      output: 12.00, // per 1M tokens
    },
  },
  [ModelTier.IMAGE_PRO]: {
    model: GEMINI_MODELS[ModelTier.IMAGE_PRO],
    description: "High-quality image generation with 4K support",
    contextWindow: 65536,          // 65K tokens
    maxOutputTokens: 32768,        // 32K tokens
    knowledgeCutoff: "January 2025",
    status: "preview" as const,
    pricing: {
      input: 2.00,      // text input per 1M tokens
      output: 0.134,    // per 1K/2K image output
      image4K: 0.24,    // per 4K image output
    },
  },
  [ModelTier.READER]: {
    model: GEMINI_MODELS[ModelTier.READER],
    description: "Document analysis (uses 2.5 Flash, upgradeable to 2.5 Pro)",
    contextWindow: 1048576,        // 1M tokens
    maxOutputTokens: 65536,        // 65K tokens
    knowledgeCutoff: "January 2025",
    pricing: {
      input: 0.30,   // per 1M tokens (2.5 Flash pricing)
      output: 2.50,  // per 1M tokens
    },
  },
  [ModelTier.RESEARCH]: {
    model: GEMINI_MODELS[ModelTier.RESEARCH],
    description: "Deep Research agent for comprehensive research reports",
    contextWindow: 1048576,        // 1M tokens
    maxOutputTokens: 65536,        // 65K tokens
    knowledgeCutoff: "January 2025",
    status: "preview" as const,
    note: "Uses Interactions API, not generate_content. Long-running (up to 60 min).",
    pricing: {
      input: 2.00,   // per 1M tokens
      output: 12.00, // per 1M tokens (estimated, report-based)
    },
  },
} as const;

/**
 * Get the appropriate model for a specific task
 */
export function getModelForTask(task: "chat" | "image" | "memory" | "analysis" | "document"): string {
  switch (task) {
    case "chat":
      return GEMINI_MODELS[ModelTier.MAIN];
    case "image":
      return GEMINI_MODELS[ModelTier.IMAGE];
    case "memory":
    case "analysis":
      return GEMINI_MODELS[ModelTier.LITE];
    case "document":
      return GEMINI_MODELS[ModelTier.READER];
    default:
      return GEMINI_MODELS[ModelTier.MAIN];
  }
}

/**
 * Get model tier from model name
 */
export function getModelTier(modelName: string): ModelTier {
  if (modelName.includes("deep-research")) return ModelTier.RESEARCH;
  if (modelName.includes("3-pro-image")) return ModelTier.IMAGE_PRO;
  if (modelName.includes("3-pro")) return ModelTier.PRO;
  if (modelName.includes("lite")) return ModelTier.LITE;
  if (modelName.includes("image")) return ModelTier.IMAGE;
  // READER tier uses same model as MAIN, distinguish by usage context
  return ModelTier.MAIN;
}

/**
 * Get the appropriate model for a conversation based on tier preference and task
 */
export function getModelForConversation(
  task: "chat" | "image" | "memory" | "analysis",
  conversationTier?: "main" | "pro"
): string {
  // Background tasks always use LITE (cost optimization)
  if (task === "memory" || task === "analysis") {
    return GEMINI_MODELS[ModelTier.LITE];
  }

  // Image generation respects conversation tier
  if (task === "image") {
    return conversationTier === "pro"
      ? GEMINI_MODELS[ModelTier.IMAGE_PRO]
      : GEMINI_MODELS[ModelTier.IMAGE];
  }

  // Chat respects conversation tier
  return conversationTier === "pro"
    ? GEMINI_MODELS[ModelTier.PRO]
    : GEMINI_MODELS[ModelTier.MAIN];
}
