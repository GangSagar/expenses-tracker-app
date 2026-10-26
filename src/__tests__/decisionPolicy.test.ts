import { TransactionDecisionInput } from '../core/transactions/contracts';
import { decideTransaction } from '../core/transactions/decisionPolicy';

const candidate = {
  amount: 500,
  merchant: 'Cafe',
  category: 'Food & Dining' as const,
  confidence: 0.8,
  timestamp: 1,
  source: 'sms' as const,
  rawMessage: 'INR 500 debited at Cafe',
  transactionType: 'debit' as const,
};

function input(overrides: Partial<TransactionDecisionInput> = {}): TransactionDecisionInput {
  return {
    candidate,
    parser: {
      confidence: 0.9,
      requiresConfirmation: false,
      parserVersion: 'test',
      confidenceBreakdown: {
        amount: 0.9,
        transactionType: 0.9,
        merchant: 0.9,
        category: 0.9,
        account: 0.9,
        overall: 0.9,
      },
    },
    classifier: { category: 'Food & Dining', matchedVia: 'keyword', confidence: 0.8 },
    rejectionSignals: [],
    ...overrides,
  };
}

describe('decideTransaction', () => {
  it('auto-saves only at the legacy high-confidence boundary when parser is confident', () => {
    expect(decideTransaction(input()).kind).toBe('auto_save');
    expect(decideTransaction(input({
      classifier: { category: 'Food & Dining', matchedVia: 'keyword', confidence: 0.799 },
    }))).toMatchObject({ kind: 'review', reason: 'medium_confidence' });
  });

  it('rejects below the legacy low-confidence boundary', () => {
    expect(decideTransaction(input({
      classifier: { category: 'Other', matchedVia: 'default', confidence: 0.499 },
    }))).toMatchObject({ kind: 'reject', reason: 'low_confidence' });
  });

  it('uses parser confirmation as a mandatory review signal', () => {
    expect(decideTransaction(input({
      parser: {
        ...input().parser!,
        confidence: 0.74,
        requiresConfirmation: true,
      },
    }))).toMatchObject({ kind: 'review', reason: 'parser_requires_confirmation' });
  });

  it('rejects parser confidence below the minimum even if the legacy score is high', () => {
    expect(decideTransaction(input({
      parser: { ...input().parser!, confidence: 0.499 },
    }))).toMatchObject({ kind: 'reject', reason: 'low_confidence' });
  });

  it('returns typed rejections in deterministic precedence order', () => {
    expect(decideTransaction(input({
      candidate: null,
      parser: null,
      classifier: null,
      rejectionSignals: ['spam', 'non_transactional_sender'],
    }))).toMatchObject({ kind: 'reject', reason: 'non_transactional_sender' });
  });

  it('keeps the policy decision separate from persistence status', () => {
    const decision = decideTransaction(input());
    expect(decision.kind).toBe('auto_save');
    expect(decision).not.toHaveProperty('status', 'saved');
    expect(decision.evidence).toMatchObject({
      policyVersion: '1.0.0',
      parserVersion: 'test',
      parserConfidence: 0.9,
      classifierConfidence: 0.8,
    });
  });
});
