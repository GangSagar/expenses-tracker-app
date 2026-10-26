import { ParserOrchestrator } from '../../core/parser/orchestrator/ParserOrchestrator';
import { configManager } from '../../core/parser/config';
import { AIExtractionEngine } from '../../core/parser/ai/AIExtractionProposal';

describe('parser local AI orchestration', () => {
  it('preserves deterministic amount on conflict and never raises global confidence', async () => {
    const original = configManager.getConfig();
    configManager.setConfig({ aiConfidenceThreshold: 1 });
    const engine: AIExtractionEngine = {
      propose: async () => ({
        amount: { value: 999, confidence: 1, source: 'local_model' },
        transactionType: { value: 'credit', confidence: 1, source: 'local_model' },
        conflicts: [],
        modelId: 'test-model',
        modelVersion: '1',
      }),
    };
    const orchestrator = new ParserOrchestrator({
      aiExtractionEngine: engine,
      isLocalAIEnabled: () => true,
    });

    try {
      const result = await orchestrator.parseAsync(
        'Your HDFC Bank account XX1234 is debited by INR 500.00 at UNKNOWN STORE',
        'JD-HDFCBK',
        'sms',
        'foreground_interaction',
      );
      expect(result).not.toBeNull();
      expect(result?.amount).toBe(500);
      expect(result?.transactionType).toBe('debit');
      expect(result?.confidence).toBeLessThan(1);
      expect(result?.requiresConfirmation).toBe(true);
      expect(result?.aiProposal?.conflicts).toContain('amount');
      expect(result?.fieldEvidence?.amount?.source).toBe('deterministic');
    } finally {
      configManager.setConfig(original);
    }
  });

  it('does not invoke the model for live or unknown context', async () => {
    const engine: AIExtractionEngine = { propose: jest.fn(async () => null) };
    const orchestrator = new ParserOrchestrator({
      aiExtractionEngine: engine,
      isLocalAIEnabled: () => true,
    });
    const message = 'Your HDFC Bank account XX1234 is debited by INR 500.00 at UNKNOWN STORE';
    await orchestrator.parseAsync(message, 'JD-HDFCBK', 'sms', 'live_background');
    await orchestrator.parseAsync(message, 'JD-HDFCBK', 'sms', 'unknown');
    expect(engine.propose).not.toHaveBeenCalled();
  });
});
