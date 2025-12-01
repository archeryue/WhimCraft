import { trimHistory } from '@/lib/providers/history-utils';

describe('trimHistory', () => {
  describe('basic functionality', () => {
    it('should return empty array when given empty array', () => {
      const result = trimHistory([], 10);
      expect(result).toEqual([]);
    });

    it('should return all messages when limit exceeds array length', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ];
      const result = trimHistory(messages, 100);
      expect(result).toEqual(messages);
    });

    it('should limit messages to specified count', () => {
      const messages = [
        { role: 'user', content: '1' },
        { role: 'assistant', content: '2' },
        { role: 'user', content: '3' },
        { role: 'assistant', content: '4' },
        { role: 'user', content: '5' },
      ];
      const result = trimHistory(messages, 3);
      expect(result).toHaveLength(3);
      expect(result[0].content).toBe('3');
      expect(result[2].content).toBe('5');
    });
  });

  describe('ensuring history starts with user', () => {
    it('should keep messages when already starting with user', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ];
      const result = trimHistory(messages, 10);
      expect(result).toEqual(messages);
    });

    it('should remove leading assistant message', () => {
      const messages = [
        { role: 'assistant', content: 'Previous response' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ];
      const result = trimHistory(messages, 10);
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('user');
      expect(result[0].content).toBe('Hello');
    });

    it('should remove multiple leading assistant messages', () => {
      const messages = [
        { role: 'assistant', content: 'Response 1' },
        { role: 'assistant', content: 'Response 2' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ];
      const result = trimHistory(messages, 10);
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('user');
    });

    it('should remove leading system messages', () => {
      const messages = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ];
      const result = trimHistory(messages, 10);
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('user');
    });

    it('should return empty array if all messages are non-user', () => {
      const messages = [
        { role: 'assistant', content: 'Response 1' },
        { role: 'assistant', content: 'Response 2' },
      ];
      const result = trimHistory(messages, 10);
      expect(result).toEqual([]);
    });
  });

  describe('combined limit and user-start behavior', () => {
    it('should slice first then remove leading non-user messages', () => {
      // This is the key bug scenario: slice results in assistant-first
      const messages = [
        { role: 'user', content: '1' },
        { role: 'assistant', content: '2' },
        { role: 'user', content: '3' },
        { role: 'assistant', content: '4' },  // <- limit=2 starts here
        { role: 'user', content: '5' },
      ];
      // With limit=2, we get ['4', '5'] which starts with assistant
      // After trimming, we should get just ['5']
      const result = trimHistory(messages, 2);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
      expect(result[0].content).toBe('5');
    });

    it('should handle limit that exactly starts at user message', () => {
      const messages = [
        { role: 'user', content: '1' },
        { role: 'assistant', content: '2' },
        { role: 'user', content: '3' },       // <- limit=3 starts here
        { role: 'assistant', content: '4' },
        { role: 'user', content: '5' },
      ];
      const result = trimHistory(messages, 3);
      expect(result).toHaveLength(3);
      expect(result[0].role).toBe('user');
      expect(result[0].content).toBe('3');
    });

    it('should handle deep conversation scenario (the original bug)', () => {
      // Simulate a long conversation where limit=10 starts at assistant
      const messages: { role: string; content: string }[] = [];
      for (let i = 1; i <= 20; i++) {
        messages.push({
          role: i % 2 === 1 ? 'user' : 'assistant',
          content: `Message ${i}`,
        });
      }
      // Messages 1-20: user, assistant, user, assistant, ...
      // Last 10: messages 11-20 (user, assistant, user, assistant, ...)
      // Message 11 is user (odd), so it should start correctly
      const result = trimHistory(messages, 10);
      expect(result).toHaveLength(10);
      expect(result[0].role).toBe('user');
    });

    it('should handle conversation where limit starts at assistant (odd count)', () => {
      // 11 messages: user starts, so positions 1,3,5,7,9,11 are user
      // Last 10 would be messages 2-11, starting with assistant (position 2)
      const messages: { role: string; content: string }[] = [];
      for (let i = 1; i <= 11; i++) {
        messages.push({
          role: i % 2 === 1 ? 'user' : 'assistant',
          content: `Message ${i}`,
        });
      }
      // Last 10: messages 2-11 (assistant, user, assistant, user, ...)
      // Should trim leading assistant, resulting in 9 messages starting at user
      const result = trimHistory(messages, 10);
      expect(result[0].role).toBe('user');
      expect(result[0].content).toBe('Message 3');
      expect(result).toHaveLength(9);
    });
  });

  describe('edge cases', () => {
    it('should handle limit of 0', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
      ];
      const result = trimHistory(messages, 0);
      expect(result).toEqual([]);
    });

    it('should handle limit of 1 with user message', () => {
      const messages = [
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'Hello' },
      ];
      const result = trimHistory(messages, 1);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
    });

    it('should handle limit of 1 with assistant message (returns empty)', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ];
      const result = trimHistory(messages, 1);
      // Last 1 is assistant, which gets removed
      expect(result).toEqual([]);
    });

    it('should preserve message properties', () => {
      const messages = [
        { role: 'user', content: 'Hello', timestamp: 123, extra: 'data' },
        { role: 'assistant', content: 'Hi', timestamp: 456 },
      ];
      const result = trimHistory(messages, 10);
      expect(result[0]).toEqual(messages[0]);
      expect(result[1]).toEqual(messages[1]);
    });

    it('should not mutate original array', () => {
      const messages = [
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'Hello' },
      ];
      const original = [...messages];
      trimHistory(messages, 10);
      expect(messages).toEqual(original);
    });
  });
});
