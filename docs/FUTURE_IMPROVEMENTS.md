# Future Improvements

This document tracks planned enhancements and known issues that need improvement.

---

## Completed Features

### ✅ Per-Conversation PRO Model Toggle (Completed: Nov 22, 2025)

**Status**: IMPLEMENTED using Gemini 3.0 Pro and Gemini 3.0 Pro Image

**Implementation Summary**:
- Added `model_tier` field to Conversation schema ('main' | 'pro')
- Created floating ProModeToggle component at top-right corner
- PRO mode uses Gemini 3.0 Pro for chat and Gemini 3.0 Pro Image for image generation
- Per-conversation persistence in Firestore via PATCH endpoint
- Visual indicators: Purple gradient button when PRO ON, outline when OFF
- Confirmation dialog when enabling (with cost warning), no confirmation when disabling
- Immediate UI feedback before conversation exists (using pendingModelTier state)
- Automatic model selection based on conversation tier in agent system

**Files Created**:
- `src/components/chat/ProModeToggle.tsx` - Floating PRO toggle component with dialog
- `src/components/ui/dialog.tsx` - Radix UI dialog component
- `tests/pro-mode.spec.ts` - 19 comprehensive E2E tests
- `src/__tests__/config/models.test.ts` - Model tier unit tests
- `src/__tests__/lib/agent/model-tier.test.ts` - Agent model tier tests
- `src/__tests__/lib/agent/tools/image-generate-tier.test.ts` - Image tier tests

**Files Modified**:
- `src/config/models.ts` - Added PRO and IMAGE_PRO tiers
- `src/types/index.ts` - Added model_tier to Conversation types
- `src/types/agent.ts` - Added modelTier to AgentConfig and ToolContext
- `src/app/chat/page.tsx` - Integration with floating toggle and Firestore persistence
- `src/app/api/chat/route.ts` - Pass model tier to agent
- `src/app/api/conversations/route.ts` - Accept model_tier in POST
- `src/app/api/conversations/[id]/route.ts` - PATCH endpoint for updating tier
- `src/lib/agent/core/agent.ts` - Model selection based on tier
- `src/lib/agent/tools/image-generate.ts` - Use IMAGE_PRO when in PRO mode
- `src/components/chat/ChatTopBar.tsx` - Removed PRO toggle (kept for other functionality)
- `playwright.config.ts` - Updated to reuse existing server

**Testing**:
- 19 E2E tests (all passing, ~3.2 min total runtime)
  - 3 critical bug prevention tests (would have caught original bug)
  - 6 UI and dialog tests
  - 3 visual indicator tests
  - 2 accessibility tests
  - 2 state management tests
  - 2 edge case tests
- 3 unit tests for model tier logic
- Fast UI-only tests (~10s per test, no real API calls)

**Pricing**:
- Default (main): $0.075/$0.30 per 1M tokens (Gemini 2.5 Flash)
- PRO mode: $2.00/$12.00 per 1M tokens (Gemini 3.0 Pro)
- IMAGE (main): $0.000002 per image (Gemini 2.5 Flash Image, 2K)
- IMAGE_PRO: $0.000134 per image (Gemini 3.0 Pro Image, 4K support)

---

## High Priority

_(No high priority items at this time)_

---

## Medium Priority

### 1. Image-to-Image Generation

**Description**: Enable users to upload one or more images and use them as reference/basis for generating new images. This includes image editing, style transfer, variations, and modifications.

**Current Behavior**:
- Image generation only accepts text prompts
- Users cannot upload reference images
- No image editing or modification capabilities
- File upload exists but not connected to image generation

**Proposed Feature**:
```
User uploads image(s) + Text prompt → Image Generation Tool → Modified/New Image
```

**Use Cases**:
1. **Style Transfer**: Upload a photo, ask to make it look like a painting
2. **Image Editing**: Upload image, ask to change specific elements
3. **Variations**: Upload image, generate similar variations
4. **Background Removal/Replacement**: Upload image, modify background
5. **Object Addition/Removal**: Upload image, add or remove objects
6. **Image Enhancement**: Upscale, colorize, restore old photos

**Example Interactions**:
- "Make this photo look like a Van Gogh painting" + [user photo]
- "Remove the background from this image" + [product photo]
- "Change the sunset to a sunrise" + [landscape photo]
- "Generate 3 variations of this design" + [logo image]

**Technical Requirements**:
1. Extend `image_generate` tool to accept image files as parameter
2. Pass uploaded images to Gemini IMAGE model via multimodal API
3. Update prompt enhancer to handle image-based prompts
4. Ensure base64 images are NOT included in conversation history (already implemented)
5. Add UI indicator for image-to-image vs text-to-image mode

**Implementation Plan**:
1. Add `referenceImages` parameter to image-generate tool
2. Modify `ToolParameter` type to support file attachments
3. Update agent to pass files to tools via ToolContext
4. Enhance prompt builder to include image descriptions
5. Test with various image formats (PNG, JPEG, WebP)

**Files to Modify**:
- `src/lib/agent/tools/image-generate.ts` - Add image file parameters
- `src/types/agent.ts` - Extend ToolParameter for file support
- `src/lib/agent/core/agent.ts` - Pass files to tools
- `src/lib/image/prompt-enhancer.ts` - Handle image-based prompts
- `src/components/chat/ChatInput.tsx` - UI for image upload workflow

**Estimated Effort**: 4-6 hours

**Cost Impact**: Similar to text-to-image (~$0.000002 per generation)

---

## Low Priority

### 1. Notion-like Whim Editing Experience - Phase 2 Enhancements

**Description**: Add advanced Notion-like features to the TipTap editor. Phase 1 (LaTeX, code highlighting, tables, images) is already complete.

**Current State**:
- ✅ TipTap WYSIWYG editor implemented
- ✅ LaTeX math support (inline and block)
- ✅ Syntax-highlighted code blocks
- ✅ Table creation and editing
- ✅ Image support
- ✅ Basic formatting (bold, italic, headings, lists)

**Phase 2 Enhancements** (Nice-to-have):
1. **Slash Commands**
   - Type `/` to insert blocks (heading, list, code, table, etc.)
   - Searchable command palette

2. **Drag & Drop Blocks**
   - Reorder paragraphs, headings, lists by dragging
   - Visual drop indicators

3. **Video Embedding**
   - Support YouTube, Vimeo URLs
   - Responsive embeds

4. **Enhanced Code Blocks**
   - Line numbers
   - Copy button
   - Language badge

**Benefits**:
- Enhanced user experience with Notion-like polish
- Faster content organization with drag & drop
- Quick formatting with slash commands

**Estimated Effort**: 4-6 hours

**Cost Impact**: None (all client-side)

**Priority Rationale**:
This is LOW PRIORITY because Phase 1 already provides core functionality. These are polish features that can be added later.

---

### 2. Stream Resilience: Server-Side Buffering + Resume

**Description**: Make chat streaming resilient to tab switches and network interruptions by implementing server-side buffering with client-side resume capability.

**Issue**: When users switch browser tabs during AI response generation, the HTTP stream may disconnect (especially on Chrome/Safari), losing the partial response.

**Solution**: Server buffers all chunks with TTL. Client can resume from last received chunk if connection drops.

**Design Document**: See [STREAM_RESILIENCE_DESIGN.md](./STREAM_RESILIENCE_DESIGN.md) for detailed architecture, implementation plan, and edge cases.

**Estimated Effort**: 8-12 hours

**Benefits**: Resilient to tab switches, network hiccups, better mobile experience, professional-grade reliability.

**Priority Rationale**: LOW - Workaround exists (don't switch tabs), affects edge case, but would significantly improve UX when implemented.

---

**Last Updated**: November 22, 2025
**Maintained By**: Archer & Claude Code
