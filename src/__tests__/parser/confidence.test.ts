import { defaultConfidenceEngine } from '../../core/parser/confidence';

describe('ConfidenceEngine Module', () => {
  it('computes weighted overall confidence when all components are high', () => {
    const evalRes = defaultConfidenceEngine.evaluate({
      amountConfidence: 0.99,
      transactionConfidence: 0.95,
      merchantConfidence: 0.90,
      categoryConfidence: 0.85,
      accountConfidence: 0.92,
    });

    expect(evalRes.overall).toBeGreaterThanOrEqual(0.85);
    expect(evalRes.requiresConfirmation).toBe(false);
    expect(evalRes.breakdown.amount).toBe(0.99);
  });

  it('triggers requiresConfirmation = true when overall score is below threshold', () => {
    const lowEval = defaultConfidenceEngine.evaluate({
      amountConfidence: 0.60,
      transactionConfidence: 0.50,
      merchantConfidence: 0.20,
      categoryConfidence: 0.30,
      accountConfidence: 0.10,
    });

    expect(lowEval.overall).toBeLessThan(0.75);
    expect(lowEval.requiresConfirmation).toBe(true);
  });
});
