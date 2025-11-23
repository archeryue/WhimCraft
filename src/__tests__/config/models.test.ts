/**
 * Model Configuration Tests
 *
 * Tests for the model tiering system including PRO mode
 */

import {
  ModelTier,
  GEMINI_MODELS,
  MODEL_CONFIGS,
  getModelForTask,
  getModelForConversation,
  getModelTier,
} from '@/config/models';

describe('Model Configuration', () => {
  describe('GEMINI_MODELS', () => {
    it('should define all model tiers', () => {
      expect(GEMINI_MODELS[ModelTier.MAIN]).toBe('gemini-2.5-flash');
      expect(GEMINI_MODELS[ModelTier.IMAGE]).toBe('gemini-2.5-flash-image');
      expect(GEMINI_MODELS[ModelTier.LITE]).toBe('gemini-2.5-flash-lite');
      expect(GEMINI_MODELS[ModelTier.PRO]).toBe('gemini-3-pro-preview');
      expect(GEMINI_MODELS[ModelTier.IMAGE_PRO]).toBe('gemini-3-pro-image-preview');
    });
  });

  describe('MODEL_CONFIGS', () => {
    it('should have correct pricing for MAIN tier', () => {
      expect(MODEL_CONFIGS[ModelTier.MAIN].pricing).toEqual({
        input: 0.30,
        output: 2.50,
      });
    });

    it('should have correct pricing for PRO tier', () => {
      expect(MODEL_CONFIGS[ModelTier.PRO].pricing).toEqual({
        input: 2.00,
        output: 12.00,
      });
    });

    it('should have correct pricing for IMAGE_PRO tier', () => {
      expect(MODEL_CONFIGS[ModelTier.IMAGE_PRO].pricing).toEqual({
        input: 2.00,
        output: 0.134,
        image4K: 0.24,
      });
    });

    it('should have correct pricing for LITE tier', () => {
      expect(MODEL_CONFIGS[ModelTier.LITE].pricing).toEqual({
        input: 0.10,
        output: 0.40,
      });
    });

    it('should mark PRO models as preview status', () => {
      expect(MODEL_CONFIGS[ModelTier.PRO].status).toBe('preview');
      expect(MODEL_CONFIGS[ModelTier.IMAGE_PRO].status).toBe('preview');
    });
  });

  describe('getModelForTask', () => {
    it('should return MAIN model for chat task', () => {
      expect(getModelForTask('chat')).toBe('gemini-2.5-flash');
    });

    it('should return IMAGE model for image task', () => {
      expect(getModelForTask('image')).toBe('gemini-2.5-flash-image');
    });

    it('should return LITE model for memory task', () => {
      expect(getModelForTask('memory')).toBe('gemini-2.5-flash-lite');
    });

    it('should return LITE model for analysis task', () => {
      expect(getModelForTask('analysis')).toBe('gemini-2.5-flash-lite');
    });
  });

  describe('getModelForConversation', () => {
    describe('with main tier', () => {
      it('should return MAIN model for chat', () => {
        expect(getModelForConversation('chat', 'main')).toBe('gemini-2.5-flash');
      });

      it('should return IMAGE model for image generation', () => {
        expect(getModelForConversation('image', 'main')).toBe('gemini-2.5-flash-image');
      });

      it('should return LITE model for memory (ignores tier)', () => {
        expect(getModelForConversation('memory', 'main')).toBe('gemini-2.5-flash-lite');
      });

      it('should return LITE model for analysis (ignores tier)', () => {
        expect(getModelForConversation('analysis', 'main')).toBe('gemini-2.5-flash-lite');
      });
    });

    describe('with pro tier', () => {
      it('should return PRO model for chat', () => {
        expect(getModelForConversation('chat', 'pro')).toBe('gemini-3-pro-preview');
      });

      it('should return IMAGE_PRO model for image generation', () => {
        expect(getModelForConversation('image', 'pro')).toBe('gemini-3-pro-image-preview');
      });

      it('should return LITE model for memory (ignores tier)', () => {
        expect(getModelForConversation('memory', 'pro')).toBe('gemini-2.5-flash-lite');
      });

      it('should return LITE model for analysis (ignores tier)', () => {
        expect(getModelForConversation('analysis', 'pro')).toBe('gemini-2.5-flash-lite');
      });
    });

    describe('without tier (defaults to main)', () => {
      it('should default to MAIN model for chat', () => {
        expect(getModelForConversation('chat')).toBe('gemini-2.5-flash');
      });

      it('should default to IMAGE model for image', () => {
        expect(getModelForConversation('image')).toBe('gemini-2.5-flash-image');
      });
    });
  });

  describe('getModelTier', () => {
    it('should identify PRO model', () => {
      expect(getModelTier('gemini-3-pro-preview')).toBe(ModelTier.PRO);
    });

    it('should identify IMAGE_PRO model', () => {
      expect(getModelTier('gemini-3-pro-image-preview')).toBe(ModelTier.IMAGE_PRO);
    });

    it('should identify LITE model', () => {
      expect(getModelTier('gemini-2.5-flash-lite')).toBe(ModelTier.LITE);
    });

    it('should identify IMAGE model', () => {
      expect(getModelTier('gemini-2.5-flash-image')).toBe(ModelTier.IMAGE);
    });

    it('should default to MAIN for flash model', () => {
      expect(getModelTier('gemini-2.5-flash')).toBe(ModelTier.MAIN);
    });

    it('should default to MAIN for unknown model', () => {
      expect(getModelTier('unknown-model')).toBe(ModelTier.MAIN);
    });
  });

  describe('Cost comparison', () => {
    it('PRO tier should be more expensive than MAIN', () => {
      const mainInput = MODEL_CONFIGS[ModelTier.MAIN].pricing.input;
      const mainOutput = MODEL_CONFIGS[ModelTier.MAIN].pricing.output;
      const proInput = MODEL_CONFIGS[ModelTier.PRO].pricing.input;
      const proOutput = MODEL_CONFIGS[ModelTier.PRO].pricing.output;

      expect(proInput).toBeGreaterThan(mainInput);
      expect(proOutput).toBeGreaterThan(mainOutput);
    });

    it('LITE tier should be cheapest', () => {
      const liteInput = MODEL_CONFIGS[ModelTier.LITE].pricing.input;
      const liteOutput = MODEL_CONFIGS[ModelTier.LITE].pricing.output;
      const mainInput = MODEL_CONFIGS[ModelTier.MAIN].pricing.input;
      const mainOutput = MODEL_CONFIGS[ModelTier.MAIN].pricing.output;

      expect(liteInput).toBeLessThan(mainInput);
      expect(liteOutput).toBeLessThan(mainOutput);
    });
  });
});
