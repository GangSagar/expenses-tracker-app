import { isDuplicate } from '../core/dedup/duplicateCheck';
import { Expense } from '../types/expense';

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 1,
    amount: 200,
    merchant: 'Swiggy',
    category: 'Food & Dining',
    confidence: 0.9,
    timestamp: Date.now() - 60000, // 1 minute ago
    source: 'sms',
    rawMessage: 'Rs.200 paid to Swiggy',
    transactionType: 'debit',
    paymentMode: 'upi',
    isDuplicate: false,
    ...overrides,
  };
}

describe('isDuplicate', () => {
  it('detects duplicate within 5-minute window', () => {
    const recent = [makeExpense()];
    const result = isDuplicate(
      { amount: 200, merchant: 'Swiggy', transactionType: 'debit' },
      recent,
    );
    expect(result).toBe(true);
  });

  it('does not flag different amounts as duplicate', () => {
    const recent = [makeExpense({ amount: 300 })];
    const result = isDuplicate(
      { amount: 200, merchant: 'Swiggy', transactionType: 'debit' },
      recent,
    );
    expect(result).toBe(false);
  });

  it('does not flag different merchants as duplicate', () => {
    const recent = [makeExpense({ merchant: 'Zomato' })];
    const result = isDuplicate(
      { amount: 200, merchant: 'Swiggy', transactionType: 'debit' },
      recent,
    );
    expect(result).toBe(false);
  });

  it('does not flag old transactions as duplicate', () => {
    const recent = [makeExpense({ timestamp: Date.now() - 10 * 60 * 1000 })]; // 10 min ago
    const result = isDuplicate(
      { amount: 200, merchant: 'Swiggy', transactionType: 'debit' },
      recent,
    );
    expect(result).toBe(false);
  });

  it('does not flag credit vs debit as duplicate', () => {
    const recent = [makeExpense({ transactionType: 'credit' })];
    const result = isDuplicate(
      { amount: 200, merchant: 'Swiggy', transactionType: 'debit' },
      recent,
    );
    expect(result).toBe(false);
  });
});
