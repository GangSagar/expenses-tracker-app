import { calculateConfidence } from '../core/confidence/score';
import { ParsedTransaction } from '../types/expense';
import { ClassificationResult } from '../core/classifier/classify';

function makeParsed(
  overrides: Partial<ParsedTransaction> = {},
): ParsedTransaction {
  return {
    amount: overrides.amount !== undefined ? overrides.amount : 500,
    merchant: overrides.merchant !== undefined ? overrides.merchant : 'Amazon',
    alias: overrides.alias !== undefined ? overrides.alias : 'Amazon',
    transactionType: overrides.transactionType || 'debit',
    paymentMode: overrides.paymentMode || 'upi',
    account: overrides.account || '1234',
    rawMessage: overrides.rawMessage || 'Rs.500 paid to Swiggy via UPI from A/c XX1234',
    source: overrides.source || 'sms',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('calculateConfidence', () => {
  it('gives high confidence for complete extraction', () => {
    const parsed = makeParsed();
    const classification: ClassificationResult = {
      category: 'Food & Dining',
      matchedVia: 'keyword',
    };
    const score = calculateConfidence(parsed, classification);
    expect(score).toBeGreaterThanOrEqual(0.8);
  });

  it('gives medium confidence when merchant is missing', () => {
    const parsed = makeParsed({ merchant: null });
    const classification: ClassificationResult = {
      category: 'Other',
      matchedVia: 'default',
    };
    const score = calculateConfidence(parsed, classification);
    expect(score).toBeGreaterThanOrEqual(0.4);
    expect(score).toBeLessThan(0.8);
  });

  it('gives low confidence when amount is missing', () => {
    const parsed = makeParsed({ amount: null });
    const classification: ClassificationResult = {
      category: 'Other',
      matchedVia: 'default',
    };
    const score = calculateConfidence(parsed, classification);
    expect(score).toBeLessThan(0.5);
  });

  it('penalizes multiple amounts in message', () => {
    const parsed = makeParsed({
      rawMessage: 'Rs.500 debited, available balance Rs.10000',
    });
    const classification: ClassificationResult = {
      category: 'Food & Dining',
      matchedVia: 'keyword',
    };
    const score = calculateConfidence(parsed, classification);
    expect(score).toBeLessThan(1.0);
  });

  it('penalizes very short messages', () => {
    const parsed = makeParsed({ rawMessage: 'Rs.500 paid' });
    const classification: ClassificationResult = {
      category: 'Other',
      matchedVia: 'default',
    };
    const score = calculateConfidence(parsed, classification);
    // Short message penalty applied
    expect(score).toBeLessThan(1.0);
  });
});
