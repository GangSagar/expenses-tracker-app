import { addDedupCandidate, createDedupCache, DEDUP_WINDOW_MS, findDuplicate } from '../core/dedup';
import { DedupRecord } from '../core/dedup/duplicateCheck';
import { Expense } from '../types/expense';

const timestamp = 1_700_000_000_000;

function makeExpense(overrides: Partial<Expense> = {}): DedupRecord {
  return {
    id: 1,
    amount: 200,
    merchant: 'Swiggy',
    timestamp,
    source: 'sms',
    rawMessage: 'Rs. 200 paid to Swiggy',
    transactionType: 'debit',
    isInvalid: false,
    isDuplicate: false,
    ...overrides,
  };
}

function candidate(overrides: Partial<Expense> = {}) {
  return {
    amount: 200,
    merchant: 'Swiggy',
    timestamp,
    source: 'notification' as const,
    rawMessage: 'Rs. 200 paid to Swiggy',
    transactionType: 'debit' as const,
    ...overrides,
  };
}

describe('shared duplicate policy', () => {
  it('matches a normalized reference ID across all history and sources', () => {
    const result = findDuplicate(
      candidate({ referenceId: '  UPI-999  ', merchant: 'Different', timestamp: timestamp + 20 * DEDUP_WINDOW_MS }),
      [makeExpense({ referenceId: 'upi-999' })],
    );
    expect(result).toMatchObject({ kind: 'definite', reason: 'reference_id', existingTransactionId: 1 });
  });

  it('matches an exact normalized message only when amount, type, and shared time window agree', () => {
    expect(findDuplicate(
      candidate({ rawMessage: '  RS. 200  PAID TO SWIGGY  ', timestamp: timestamp + DEDUP_WINDOW_MS }),
      [makeExpense()],
    )).toMatchObject({ kind: 'definite', reason: 'exact_message' });
    expect(findDuplicate(
      candidate({ timestamp: timestamp + DEDUP_WINDOW_MS + 1 }), [makeExpense()],
    )).toBeNull();
    expect(findDuplicate(
      candidate({ transactionType: 'credit' }), [makeExpense()],
    )).toBeNull();
  });

  it('returns weak merchant/amount/time similarity for confirmation instead of blocking', () => {
    expect(findDuplicate(
      candidate({ rawMessage: 'New notification body' }), [makeExpense()],
    )).toMatchObject({ kind: 'possible', reason: 'amount_merchant_time' });
    expect(findDuplicate(
      candidate({ amount: 201, rawMessage: 'New notification body' }), [makeExpense()],
    )).toBeNull();
    expect(findDuplicate(
      candidate({ merchant: 'Another shop', rawMessage: 'New notification body' }), [makeExpense()],
    )).toBeNull();
  });

  it('does not confuse legitimate same-merchant purchases outside the window', () => {
    expect(findDuplicate(
      candidate({ timestamp: timestamp + DEDUP_WINDOW_MS + 1 }), [makeExpense()],
    )).toBeNull();
  });

  it('ignores invalidated and already-duplicate rows', () => {
    expect(findDuplicate(candidate(), [
      makeExpense({ isInvalid: true }),
      makeExpense({ id: 2, isDuplicate: true }),
    ])).toBeNull();
  });

  it('indexes references and timestamps consistently as rows are added', () => {
    const cache = createDedupCache([makeExpense({ rawMessage: 'old' })]);
    addDedupCandidate(cache, candidate({ referenceId: 'NEW-REF', rawMessage: 'different' }));

    expect(findDuplicate(candidate({ referenceId: ' new-ref ', timestamp: timestamp + 100 }), cache))
      .toMatchObject({ kind: 'definite', reason: 'reference_id' });
  });
});
