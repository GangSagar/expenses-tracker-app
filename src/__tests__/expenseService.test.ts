import { processTransaction, saveExpense } from '../services/transactions/expenseService';
import {
  createManualTransaction,
  importHistoricalTransactions,
} from '../services/transactions/transactionApplication';
import { IncomingTransactionAnalysis } from '../services/messaging/messageService';

jest.mock('../database/expenseRepo', () => ({
  getExpensesWithSplits: jest.fn(),
  getDedupCandidates: jest.fn(),
  getAllDedupRecords: jest.fn(),
  insertExpense: jest.fn(),
  insertExpenseWithRepayment: jest.fn(),
}));

jest.mock('../services/notifications/transactionSavedNotification', () => ({
  notifyTransactionSaved: jest.fn(),
}));

const repository = require('../database/expenseRepo');
const notifications = require('../services/notifications/transactionSavedNotification');

beforeEach(() => {
  jest.clearAllMocks();
  repository.getExpensesWithSplits.mockReturnValue([]);
  repository.getDedupCandidates.mockReturnValue([]);
  repository.getAllDedupRecords.mockReturnValue([]);
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
      category: 'Food & Dining' as const,
      confidence: 1,
      timestamp: 10,
      source: 'manual' as const,
      rawMessage: '',
      transactionType: 'debit' as const,
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
      expect.objectContaining({ splits: [{
        contactName: 'Alex', amount: 40, isPaid: true, owedByMe: true,
        repaymentAllocations: [{ expenseId: 4, splitId: 'legacy-4-0', amount: 40 }],
      }] }),
      [{
        expenseId: 4,
        splits: [{
          contactName: 'Alex', amount: 100, paidAmount: 40, isPaid: false,
          manualPaidAmount: 0, repaymentPaidAmount: 40, splitId: 'legacy-4-0',
        }],
      }],
    );
    expect(repository.insertExpense).not.toHaveBeenCalled();
    expect(saved?.status).toBe('saved');
    if (!saved || saved.status !== 'saved') throw new Error('Expected a saved transaction result');
    expect(saved?.transaction.id).toBe(55);
    expect(saved?.repaymentUpdates).toHaveLength(1);
    expect(notifications.notifyTransactionSaved).toHaveBeenCalledWith(saved.transaction);
  });

  it('notifies after a successful manual transaction save', () => {
    repository.insertExpense.mockReturnValue(61);
    const transaction = {
      amount: 18,
      merchant: 'Tea Shop',
      category: 'Food & Dining' as const,
      confidence: 1,
      timestamp: 30,
      source: 'manual' as const,
      rawMessage: '',
      transactionType: 'debit' as const,
    };

    const result = createManualTransaction(transaction);

    expect(result.status).toBe('saved');
    expect(notifications.notifyTransactionSaved).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 18, merchant: 'Tea Shop' }),
    );
  });

  it('enforces location immutability by stripping location on manual transaction creation', () => {
    repository.insertExpense.mockReturnValue(65);
    const transaction = {
      amount: 18,
      merchant: 'Tea Shop',
      category: 'Food & Dining' as const,
      confidence: 1,
      timestamp: 30,
      source: 'manual' as const,
      rawMessage: '',
      transactionType: 'debit' as const,
      location: { latitude: 12.9716, longitude: 77.5946 },
    };

    const result = createManualTransaction(transaction);

    expect(result.status).toBe('saved');
    if (result.status === 'saved') {
      expect(result.transaction.location).toBeUndefined();
    }
    expect(repository.insertExpense).toHaveBeenCalledWith(
      expect.not.objectContaining({ location: expect.anything() }),
    );
  });

  it('notifies once for each successfully imported row', async () => {
    repository.insertExpense.mockReturnValue(62);
    const transaction = {
      amount: 19,
      merchant: 'Book Shop',
      category: 'Shopping' as const,
      confidence: 1,
      timestamp: 40,
      source: 'sms' as const,
      rawMessage: 'INR 19 at Book Shop',
      transactionType: 'debit' as const,
    };

    const results = await importHistoricalTransactions([transaction]);

    expect(results.map(row => row.status)).toEqual(['imported']);
    expect(notifications.notifyTransactionSaved).toHaveBeenCalledWith(transaction);
  });

  it('does not let notification failure change a successful persistence result', () => {
    repository.insertExpense.mockReturnValue(63);
    notifications.notifyTransactionSaved.mockImplementation(() => {
      throw new Error('notification unavailable');
    });

    const saved = saveExpense({
      amount: 20,
      merchant: 'Shop',
      category: 'Shopping',
      confidence: 1,
      timestamp: 50,
      source: 'sms',
      rawMessage: 'unique transaction',
      transactionType: 'debit',
    });

    expect(saved.status).toBe('saved');
    expect(repository.insertExpense).toHaveBeenCalled();
  });

  it('does not send a saved notification when a definite duplicate is blocked', () => {
    repository.getDedupCandidates.mockReturnValue([{
      id: 64,
      amount: 25,
      merchant: 'Shop',
      category: 'Shopping',
      confidence: 1,
      timestamp: 60,
      source: 'notification',
      rawMessage: 'same saved message',
      transactionType: 'debit',
      isInvalid: false,
      isDuplicate: false,
    }]);

    const result = saveExpense({
      amount: 25,
      merchant: 'Shop',
      category: 'Shopping',
      confidence: 1,
      timestamp: 60,
      source: 'sms',
      rawMessage: 'same saved message',
      transactionType: 'debit',
    });

    expect(result.status).toBe('duplicate');
    expect(notifications.notifyTransactionSaved).not.toHaveBeenCalled();
    expect(repository.insertExpense).not.toHaveBeenCalled();
  });
});
