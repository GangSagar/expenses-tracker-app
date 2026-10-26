import { AIResolver, AICache } from '../../core/parser/ai';
import { configManager } from '../../core/parser/config';

describe('AIResolver & AICache Module', () => {
  it('does NOT invoke AI when confidence is high and merchant is resolved', () => {
    configManager.setConfig({ enableAI: true });
    const resolver = new AIResolver();

    const shouldCall = resolver.shouldInvoke('Swiggy', 'Food & Dining', 0.95);
    expect(shouldCall).toBe(false);
  });

  it('invokes AI when merchant is unknown or category is Other', () => {
    configManager.setConfig({ enableAI: true });
    const resolver = new AIResolver();

    expect(resolver.shouldInvoke('Unknown', 'Other', 0.50)).toBe(true);
    expect(resolver.shouldInvoke('XYZ Merchant', 'Other', 0.90)).toBe(true);
  });

  it('caches AI responses to avoid redundant calls', async () => {
    const cache = new AICache();
    const resolver = new AIResolver(cache);

    let handlerCalls = 0;
    resolver.setInferenceHandler(async (_rawMsg, _merch) => {
      handlerCalls++;
      return {
        merchant: 'Resolved Merchant',
        category: 'Food & Dining',
        confidence: 0.95,
        timestamp: Date.now(),
      };
    });

    const res1 = await resolver.resolve('Sample bank SMS message', 'CANDIDATE');
    expect(handlerCalls).toBe(1);
    expect(res1?.merchant).toBe('Resolved Merchant');

    // Second call with same message and merchant should be served from cache
    const res2 = await resolver.resolve('Sample bank SMS message', 'CANDIDATE');
    expect(handlerCalls).toBe(1);
    expect(res2?.merchant).toBe('Resolved Merchant');
  });
});
