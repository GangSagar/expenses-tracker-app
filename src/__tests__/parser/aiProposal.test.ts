import {
  mayRunAIForContext,
  validateAIExtractionProposal,
} from '../../core/parser/ai/AIExtractionProposal';

describe('local AI proposal boundary', () => {
  it('accepts bounded field evidence and supplies model identity', () => {
    const result = validateAIExtractionProposal({
      amount: { value: 245.5, confidence: 0.7, source: 'local_model' },
      currency: { value: 'inr', confidence: 0.7, source: 'local_model' },
      transactionType: { value: 'debit', confidence: 0.6, source: 'local_model' },
      conflicts: [],
    }, 'fixture-model', '1');

    expect(result?.amount?.value).toBe(245.5);
    expect(result?.currency?.value).toBe('INR');
    expect(result?.modelId).toBe('fixture-model');
  });

  it.each([
    { amount: { value: Number.NaN, confidence: 1, source: 'local_model' } },
    { amount: { value: -1, confidence: 1, source: 'local_model' } },
    { amount: { value: 12, confidence: 1.1, source: 'local_model' } },
    { currency: { value: 'XYZ', confidence: 0.8, source: 'local_model' } },
    { unexpected: 'field' },
  ])('rejects invalid or unsupported output', invalid => {
    expect(validateAIExtractionProposal(invalid, 'fixture-model', '1')).toBeNull();
  });

  it('allows only foreground and historical contexts to use a model', () => {
    expect(mayRunAIForContext('foreground_interaction')).toBe(true);
    expect(mayRunAIForContext('historical_import')).toBe(true);
    expect(mayRunAIForContext('live_background')).toBe(false);
    expect(mayRunAIForContext('unknown')).toBe(false);
  });
});
