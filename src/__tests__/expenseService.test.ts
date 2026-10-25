import { processTransaction, saveExpense } from '../services/transactions/expenseService';
import { IncomingTransactionAnalysis } from '../services/messaging/messageService';

jest.mock('../database/expenseRepo', () => ({
  getExpensesWithSplits: jest.fn(),
  getRecentExpenses: jest.fn(),
  insertExpense: jest.fn(),
  insertExpenseWithRepayment: jest.fn(),
}));

jest.mock('../core/dedup', () => ({ isDuplicate: jest.fn() }));

const repository = require('../database/expenseRepo');
const dedup = require('../core/dedup');

beforeEach(() => {
  jest.clearAllMocks();
  repository.getExpensesWithSplits.mockReturnValue([]);
  repository.getRecentExpenses.mockReturnValue([]);
  dedup.isDuplicate.mockReturnValue(false);
});

describe('transaction decision input mapping', () => {
  it('preserves parser confidence and confirmation evidence through candidate mapping', () => {
    const parsed = {
      amount: 500,
      currency: 'INR',
      merchant: 'Cafe North',
      normalizedMerchant: 'Cafe North',
      transactionType: 'debit' as const,
      paymentMode: 'upi' as const,
      category: 'Food & Dining' as const,
      timestamp: 100,
      confidence: 0.72,
      confidenceBreakdown: {
        amount: 0.9,
        transactionType: 0.9,
        merchant: 0.6,
        category: 0.5,
        account: 0.5,
        overall: 0.72,
      },
      requiresConfirmation: true,
      source: 'sms' as const,
      rawMessage: 'INR 500 debited at Cafe North',
      parserVersion: 'test-version',
    };
    const analysis: IncomingTransactionAnalysis = {
      message: { body: parsed.rawMessage, sender: 'VM-TEST', source: 'sms' },
      normalizedBody: parsed.rawMessage,
      normalizedSender: 'VM-TEST',
      parsed,
      rejectionSignals: [],
    };

    const result = processTransaction(analysis);

    expect(result.decision).toMatchObject({
      kind: 'review',
      reason: 'parser_requires_confirmation',
      evidence: {
        parserVersion: 'test-version',
        parserConfidence: 0.72,
        parserRequiresConfirmation: true,
        parserConfidenceBreakdown: parsed.confidenceBreakdown,
      },
    });
    expect(result.candidate?.merchant).toBe('Cafe North');
  });

  it('routes early filter failures through the same policy as typed rejections', () => {
    const analysis: IncomingTransactionAnalysis = {
      message: { body: 'OTP code', sender: '1234567890', source: 'sms' },
      normalizedBody: 'OTP code',
      normalizedSender: '1234567890',
      parsed: null,
      rejectionSignals: ['non_transactional_sender', 'blocked_message'],
    };

    expect(processTransaction(analysis).decision).toMatchObject({
      kind: 'reject',
      reason: 'non_transactional_sender',
    });
  });
});

describe('saveExpense', () => {
  it('inserts a repayment credit and all debt allocations through one atomic repository method', () => {
    repository.getExpensesWithSplits.mockReturnValue([{
      id: 4,
      amount: 100,
      merchant: 'Dinner',
      category: 'Food & Dining',
      confidence: 1,
      timestamp: 10,
      source: 'manual',
      rawMessage: '',
      transactionType: 'debit',
      splits: [{ contactName: 'Alex', amount: 100 }],
    }]);
    repository.insertExpenseWithRepayment.mockReturnValue(55);

    const saved = saveExpense({
      amount: 40,
      merchant: 'Repayment from Alex',
      category: 'Other',
      confidence: 1,
      timestamp: 20,
      source: 'sms',
      rawMessage: 'INR 40 credited from Alex',
      transactionType: 'credit',
    });

    expect(repository.insertExpenseWithRepayment).toHaveBeenCalledWith(
      expect.objectContaining({ splits: [{ contactName: 'Alex', amount: 40, isPaid: true, owedByMe: true }] }),
      [{
        expenseId: 4,
        splits: [{ contactName: 'Alex', amount: 100, paidAmount: 40, isPaid: false }],
      }],
    );
    expect(repository.insertExpense).not.toHaveBeenCalled();
    expect(saved?.status).toBe('saved');
    if (!saved || saved.status !== 'saved') throw new Error('Expected a saved transaction result');
    expect(saved?.transaction.id).toBe(55);
    expect(saved?.repaymentUpdates).toHaveLength(1);
  });
});
