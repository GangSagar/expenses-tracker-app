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

  it('detects duplicate via direct reference ID match', () => {
    const recent = [makeExpense({ referenceId: 'UPI999888' })];
    const result = isDuplicate(
      { amount: 200, merchant: 'Different Merchant', transactionType: 'debit', referenceId: 'UPI999888' },
      recent,
    );
    expect(result).toBe(true);
  });

  it('detects duplicate via reference ID cross-message search', () => {
    const recent = [makeExpense({ referenceId: 'UPI111222' })];
    const result = isDuplicate(
      { amount: 200, merchant: 'SBI', transactionType: 'debit', rawMessage: 'UPI111222 paid to friend' },
      recent,
    );
    expect(result).toBe(true);
  });

  it('detects cross-bank duplicate via shared 6-to-12 digit numeric transaction token', () => {
    const recent = [makeExpense({ 
      bank: 'BOB', 
      amount: 500, 
      transactionType: 'credit', 
      rawMessage: 'Your BOB A/C XX1234 credited with INR 500.00. UPI Ref: 213456789012' 
    })];
    const result = isDuplicate(
      { 
        amount: 500, 
        merchant: 'SBI', 
        transactionType: 'credit', 
        rawMessage: 'SBI A/C XX5678 debited/transferred INR 500.00. Ref: 213456789012' 
      },
      recent,
    );
    expect(result).toBe(true);
  });
});
