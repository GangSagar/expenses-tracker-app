import {
  GET_ALL_DEDUP_RECORDS_SQL,
  GET_DEDUP_CANDIDATES_SQL,
  INSERT_EXPENSE_SQL,
  UPDATE_EXPENSE_SPLITS_SQL,
  GET_EXPENSES_WITH_SPLITS_SQL,
  getExpensesWithSplits,
  getAllDedupRecords,
  getDedupCandidates,
  updateSplitExpensesAtomically,
  insertExpenseWithRepayment,
  restoreExpenseSnapshot,
  CLEAR_ALL_EXPENSES_SQL,
  CLEAR_ALL_MERCHANT_CATEGORIES_SQL,
  CLEAR_ALL_SETTINGS_SQL,
  clearAllExpenses,
  mutateExpenseWithSplitUpdatesAtomically,
  INVALIDATE_EXPENSE_SQL,
  DELETE_EXPENSE_SQL,
  deleteTransactionsForAccount,
  deduplicateDatabase,
  insertExpense,
  getAllExpenses,
} from '../database/expenseRepo';
import { getDatabase } from '../database/db';

// Mock getDatabase to return a mock execute function
jest.mock('../database/db', () => {
  const mockExecute = jest.fn();
  return {
    getDatabase: jest.fn(() => ({
      execute: mockExecute,
    })),
  };
});

describe('deduplication candidate repository queries', () => {
  let mockExecute: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute = getDatabase().execute as jest.Mock;
  });

  it('returns global reference and time-window rows for evaluation by the shared policy', () => {
    mockExecute.mockReturnValueOnce({ rows: { _array: [{
      id: 100, amount: 200, merchant: 'Shop', timestamp: 1000,
      source: 'sms', raw_message: 'message', transaction_type: 'debit',
      reference_id: 'REF-1', is_invalid: 0, is_duplicate: 0,
    }] } });

    const records = getDedupCandidates({
      amount: 200, merchant: 'Shop', transactionType: 'debit', timestamp: 1000,
      source: 'notification', rawMessage: 'message', referenceId: ' Ref-1 ',
    });

    expect(records[0]).toMatchObject({ id: 100, referenceId: 'REF-1', isInvalid: false, isDuplicate: false });
    expect(mockExecute).toHaveBeenCalledWith(GET_DEDUP_CANDIDATES_SQL, [
      'ref-1', 'ref-1', 1000 - 5 * 60 * 1000, 1000 + 5 * 60 * 1000,
    ]);
  });

  it('loads all dedup evidence fields for batch indexes', () => {
    mockExecute.mockReturnValueOnce({ rows: { _array: [] } });
    expect(getAllDedupRecords()).toEqual([]);
    expect(mockExecute).toHaveBeenCalledWith(GET_ALL_DEDUP_RECORDS_SQL);
  });
});
describe('insertExpenseWithRepayment', () => {
  let mockExecute: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute = getDatabase().execute as jest.Mock;
  });

  it('commits split updates and the new repayment expense as one transaction', () => {
    mockExecute
      .mockReturnValueOnce({ rowsAffected: 0 }) // BEGIN
      .mockReturnValueOnce({ rowsAffected: 1 }) // split update
      .mockReturnValueOnce({ insertId: 42, rowsAffected: 1 }) // insert
      .mockReturnValueOnce({ rowsAffected: 0 }); // COMMIT

    const id = insertExpenseWithRepayment({
      amount: 75,
      merchant: 'Repayment from Alex',
      category: 'Other',
      confidence: 1,
      timestamp: 1000,
      source: 'manual',
      rawMessage: '',
      transactionType: 'credit',
      splits: [{ contactName: 'Alex', amount: 75, isPaid: true, owedByMe: true }],
    }, [{
      expenseId: 7,
      splits: [{ contactName: 'Alex', amount: 75, isPaid: true }],
    }]);

    expect(id).toBe(42);
    expect(mockExecute.mock.calls.map(([query]) => query)).toEqual([
      'BEGIN TRANSACTION',
      UPDATE_EXPENSE_SPLITS_SQL,
      INSERT_EXPENSE_SQL,
      'COMMIT',
    ]);
  });

  it('rolls back related split updates if inserting the repayment fails', () => {
    mockExecute
      .mockReturnValueOnce({ rowsAffected: 0 }) // BEGIN
      .mockReturnValueOnce({ rowsAffected: 1 }) // split update
      .mockImplementationOnce(() => {
        throw new Error('insert failed');
      })
      .mockReturnValueOnce({ rowsAffected: 0 }); // ROLLBACK

    expect(() => insertExpenseWithRepayment({
      amount: 75,
      merchant: 'Repayment from Alex',
      category: 'Other',
      confidence: 1,
      timestamp: 1000,
      source: 'manual',
      rawMessage: '',
      transactionType: 'credit',
      splits: [{ contactName: 'Alex', amount: 75, isPaid: true, owedByMe: true }],
    }, [{
      expenseId: 7,
      splits: [{ contactName: 'Alex', amount: 75, isPaid: true }],
    }])).toThrow('insert failed');

    expect(mockExecute.mock.calls.map(([query]) => query)).toEqual([
      'BEGIN TRANSACTION',
      UPDATE_EXPENSE_SPLITS_SQL,
      INSERT_EXPENSE_SQL,
      'ROLLBACK',
    ]);
  });

  it('rolls back the split update when SQLite does not return the repayment ID', () => {
    mockExecute
      .mockReturnValueOnce({ rowsAffected: 0 })
      .mockReturnValueOnce({ rowsAffected: 1 })
      .mockReturnValueOnce({ rowsAffected: 1 })
      .mockReturnValueOnce({ rowsAffected: 0 });

    expect(() => insertExpenseWithRepayment({
      amount: 75,
      merchant: 'Repayment from Alex',
      category: 'Other',
      confidence: 1,
      timestamp: 1000,
      source: 'manual',
      rawMessage: '',
      transactionType: 'credit',
    }, [{ expenseId: 7, splits: [{ contactName: 'Alex', amount: 75, paidAmount: 75 }] }]))
      .toThrow(/valid repayment transaction identifier/i);

    expect(mockExecute.mock.calls.map(([query]) => query)).toEqual([
      'BEGIN TRANSACTION', UPDATE_EXPENSE_SPLITS_SQL, INSERT_EXPENSE_SQL, 'ROLLBACK',
    ]);
  });
});

describe('getExpensesWithSplits', () => {
  let mockExecute: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute = getDatabase().execute as jest.Mock;
  });

  it('queries split-bearing ledger rows without a UI time window or pagination limit', () => {
    mockExecute.mockReturnValueOnce({
      rows: {
        _array: [{
          id: 9,
          amount: 100,
          merchant: 'Old dinner',
          category: 'Food & Dining',
          confidence: 1,
          timestamp: 1,
          source: 'manual',
          raw_message: '',
          transaction_type: 'debit',
          is_duplicate: 0,
          is_invalid: 0,
          splits: JSON.stringify([{ contactName: 'Alex', amount: 100 }]),
        }],
      },
    });

    const results = getExpensesWithSplits();

    expect(results).toHaveLength(1);
    expect(results[0].timestamp).toBe(1);
    expect(results[0].splits).toEqual([{ contactName: 'Alex', amount: 100 }]);
    expect(mockExecute).toHaveBeenCalledWith(GET_EXPENSES_WITH_SPLITS_SQL);
    expect(GET_EXPENSES_WITH_SPLITS_SQL).not.toMatch(/LIMIT|timestamp\s*>/i);
  });
});

describe('updateSplitExpensesAtomically', () => {
  let mockExecute: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute = getDatabase().execute as jest.Mock;
  });

  it('wraps contact-wide split changes in one database transaction', () => {
    mockExecute
      .mockReturnValueOnce({ rowsAffected: 0 })
      .mockReturnValueOnce({ rowsAffected: 1 })
      .mockReturnValueOnce({ rowsAffected: 1 })
      .mockReturnValueOnce({ rowsAffected: 0 });

    updateSplitExpensesAtomically([
      { expenseId: 2, splits: [{ contactName: 'Alex', amount: 50, isPaid: true, paidAmount: 50 }] },
      { expenseId: 8, splits: [{ contactName: 'Alex', amount: 75, isPaid: true, paidAmount: 75 }] },
    ]);

    expect(mockExecute.mock.calls.map(([query]) => query)).toEqual([
      'BEGIN TRANSACTION',
      UPDATE_EXPENSE_SPLITS_SQL,
      UPDATE_EXPENSE_SPLITS_SQL,
      'COMMIT',
    ]);
  });

  it('rolls back all contact-wide updates if one row is missing', () => {
    mockExecute
      .mockReturnValueOnce({ rowsAffected: 0 })
      .mockReturnValueOnce({ rowsAffected: 1 })
      .mockReturnValueOnce({ rowsAffected: 0 })
      .mockReturnValueOnce({ rowsAffected: 0 });

    expect(() => updateSplitExpensesAtomically([
      { expenseId: 2, splits: [{ contactName: 'Alex', amount: 50 }] },
      { expenseId: 8, splits: [{ contactName: 'Alex', amount: 75 }] },
    ])).toThrow('Could not update repayment split for expense 8');
    expect(mockExecute.mock.calls.map(([query]) => query)).toEqual([
      'BEGIN TRANSACTION',
      UPDATE_EXPENSE_SPLITS_SQL,
      UPDATE_EXPENSE_SPLITS_SQL,
      'ROLLBACK',
    ]);
  });
});

describe('mutateExpenseWithSplitUpdatesAtomically', () => {
  let mockExecute: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute = getDatabase().execute as jest.Mock;
  });

  it('commits a repayment deletion and its split reversal in one transaction', () => {
    mockExecute
      .mockReturnValueOnce({ rowsAffected: 0 })
      .mockReturnValueOnce({ rowsAffected: 1 })
      .mockReturnValueOnce({ rowsAffected: 1 })
      .mockReturnValueOnce({ rowsAffected: 0 });

    mutateExpenseWithSplitUpdatesAtomically(12, { kind: 'delete' }, [{
      expenseId: 8,
      splits: [{ contactName: 'Alex', amount: 100, paidAmount: 0, repaymentPaidAmount: 0 }],
    }]);

    expect(mockExecute.mock.calls.map(([query]) => query)).toEqual([
      'BEGIN TRANSACTION',
      UPDATE_EXPENSE_SPLITS_SQL,
      DELETE_EXPENSE_SQL,
      'COMMIT',
    ]);
  });

  it('rolls back split reversals if the repayment transaction cannot be changed', () => {
    mockExecute
      .mockReturnValueOnce({ rowsAffected: 0 })
      .mockReturnValueOnce({ rowsAffected: 1 })
      .mockReturnValueOnce({ rowsAffected: 0 })
      .mockReturnValueOnce({ rowsAffected: 0 });

    expect(() => mutateExpenseWithSplitUpdatesAtomically(12, {
      kind: 'invalidate', isInvalid: true,
    }, [{ expenseId: 8, splits: [{ contactName: 'Alex', amount: 100, paidAmount: 0 }] }]))
      .toThrow('Could not update transaction 12');
    expect(mockExecute.mock.calls.map(([query]) => query)).toEqual([
      'BEGIN TRANSACTION',
      UPDATE_EXPENSE_SPLITS_SQL,
      INVALIDATE_EXPENSE_SQL,
      'ROLLBACK',
    ]);
  });
});

describe('account transaction deletion safety', () => {
  let mockExecute: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute = getDatabase().execute as jest.Mock;
  });

  it('preserves an account with repayment history instead of orphaning allocations', () => {
    mockExecute.mockReturnValueOnce({ rows: { _array: [{
      id: 12, amount: 35, merchant: 'Repayment from Alex', category: 'Other',
      confidence: 1, timestamp: 10, source: 'manual', raw_message: '',
      transaction_type: 'credit', bank: 'Bank A', account: '1234',
      splits: JSON.stringify([{
        contactName: 'Alex', amount: 35, owedByMe: true,
        repaymentAllocations: [{ expenseId: 8, splitId: 'debt-1', amount: 35 }],
      }]),
    }] } });

    expect(() => deleteTransactionsForAccount('Bank A', '1234')).toThrow(/repayment history/i);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

describe('deduplication settlement safety', () => {
  let mockExecute: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute = getDatabase().execute as jest.Mock;
  });

  it('does not invalidate a duplicate with repayment history', () => {
    mockExecute.mockReturnValueOnce({ rows: { _array: [
      {
        id: 1, amount: 35, merchant: 'Repayment from Alex', category: 'Other',
        confidence: 1, timestamp: 10, source: 'manual', raw_message: '',
      transaction_type: 'credit', reference_id: 'repayment-ref', is_duplicate: 0, is_invalid: 0,
        splits: null,
      },
      {
        id: 2, amount: 35, merchant: 'Repayment from Alex', category: 'Other',
        confidence: 1, timestamp: 11, source: 'manual', raw_message: '',
      transaction_type: 'credit', reference_id: ' REPAYMENT-REF ', is_duplicate: 0, is_invalid: 0,
        splits: JSON.stringify([{
          contactName: 'Alex', amount: 35, owedByMe: true,
          repaymentAllocations: [{ expenseId: 8, splitId: 'debt-split', amount: 35 }],
        }]),
      },
    ] } });

    expect(() => deduplicateDatabase()).toThrow(/split settlement history/i);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('does not auto-invalidate a weak amount/merchant/time similarity', () => {
    mockExecute.mockReturnValueOnce({ rows: { _array: [
      {
        id: 1, amount: 200, merchant: 'Cafe North', category: 'Food & Dining',
        confidence: 1, timestamp: 10, source: 'sms', raw_message: 'card purchase 200',
        transaction_type: 'debit', is_duplicate: 0, is_invalid: 0,
      },
      {
        id: 2, amount: 200, merchant: 'Cafe-North', category: 'Food & Dining',
        confidence: 1, timestamp: 11, source: 'notification', raw_message: 'another card purchase 200',
        transaction_type: 'debit', is_duplicate: 0, is_invalid: 0,
      },
    ] } });

    expect(deduplicateDatabase()).toBe(0);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

describe('restoreExpenseSnapshot', () => {
  let mockExecute: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute = getDatabase().execute as jest.Mock;
  });

  const backupExpense = {
    id: 800,
    amount: 120,
    merchant: 'Shared groceries',
    category: 'Food & Dining' as const,
    confidence: 1,
    timestamp: 100,
    source: 'manual' as const,
    rawMessage: 'backup row',
    transactionType: 'debit' as const,
    splits: [{ contactName: 'Alex', amount: 60, paidAmount: 25, isPaid: false }],
  };

  it('replaces the ledger atomically and preserves snapshot split state without replaying repayments', () => {
    mockExecute
      .mockReturnValueOnce({ rowsAffected: 0 }) // BEGIN
      .mockReturnValueOnce({ rowsAffected: 1 }) // clear ledger
      .mockReturnValueOnce({ insertId: 1, rowsAffected: 1 }) // imported expense
      .mockReturnValueOnce({ rowsAffected: 0 }); // COMMIT

    restoreExpenseSnapshot([backupExpense], true);

    expect(mockExecute.mock.calls.map(([query]) => query)).toEqual([
      'BEGIN TRANSACTION',
      CLEAR_ALL_EXPENSES_SQL,
      INSERT_EXPENSE_SQL,
      'COMMIT',
    ]);
    expect(mockExecute.mock.calls[2][1][14]).toBe(JSON.stringify(backupExpense.splits));
    expect(mockExecute).not.toHaveBeenCalledWith(CLEAR_ALL_MERCHANT_CATEGORIES_SQL);
    expect(mockExecute).not.toHaveBeenCalledWith(CLEAR_ALL_SETTINGS_SQL);
  });

  it('rolls back an overwrite when any snapshot row fails to insert', () => {
    mockExecute
      .mockReturnValueOnce({ rowsAffected: 0 }) // BEGIN
      .mockReturnValueOnce({ rowsAffected: 1 }) // clear ledger
      .mockImplementationOnce(() => { throw new Error('restore insert failed'); })
      .mockReturnValueOnce({ rowsAffected: 0 }); // ROLLBACK

    expect(() => restoreExpenseSnapshot([backupExpense], true)).toThrow('restore insert failed');
    expect(mockExecute.mock.calls.map(([query]) => query)).toEqual([
      'BEGIN TRANSACTION',
      CLEAR_ALL_EXPENSES_SQL,
      INSERT_EXPENSE_SQL,
      'ROLLBACK',
    ]);
  });

  it('appends a snapshot in one transaction without clearing the current ledger', () => {
    mockExecute
      .mockReturnValueOnce({ rowsAffected: 0 }) // BEGIN
      .mockReturnValueOnce({ insertId: 2, rowsAffected: 1 })
      .mockReturnValueOnce({ rowsAffected: 0 }); // COMMIT

    restoreExpenseSnapshot([backupExpense], false);

    expect(mockExecute.mock.calls.map(([query]) => query)).toEqual([
      'BEGIN TRANSACTION', INSERT_EXPENSE_SQL, 'COMMIT',
    ]);
  });

  it('remaps repayment allocation transaction IDs while restoring a snapshot', () => {
    mockExecute
      .mockReturnValueOnce({ rowsAffected: 0 })
      .mockReturnValueOnce({ rowsAffected: 2 })
      .mockReturnValueOnce({ insertId: 31, rowsAffected: 1 })
      .mockReturnValueOnce({ insertId: 32, rowsAffected: 1 })
      .mockReturnValueOnce({ rowsAffected: 1 })
      .mockReturnValueOnce({ rowsAffected: 0 });
    const debt = { ...backupExpense, id: 101, splits: [{
      splitId: 'debt-split', contactName: 'Alex', amount: 60,
      manualPaidAmount: 0, repaymentPaidAmount: 25, paidAmount: 25, isPaid: false,
    }] };
    const payment = {
      ...backupExpense,
      id: 202,
      transactionType: 'credit' as const,
      splits: [{
        contactName: 'Alex', amount: 25, isPaid: true, owedByMe: true,
        repaymentAllocations: [{ expenseId: 101, splitId: 'debt-split', amount: 25 }],
      }],
    };

    restoreExpenseSnapshot([debt, payment], true);

    expect(mockExecute.mock.calls[4][0]).toBe(UPDATE_EXPENSE_SPLITS_SQL);
    expect(JSON.parse(mockExecute.mock.calls[4][1][0])[0].repaymentAllocations).toEqual([
      { expenseId: 31, splitId: 'debt-split', amount: 25 },
    ]);
    expect(mockExecute.mock.calls[4][1][1]).toBe(32);
  });

  it('rolls back a snapshot that contains a dangling repayment allocation', () => {
    mockExecute
      .mockReturnValueOnce({ rowsAffected: 0 })
      .mockReturnValueOnce({ rowsAffected: 1 })
      .mockReturnValueOnce({ insertId: 32, rowsAffected: 1 })
      .mockReturnValueOnce({ rowsAffected: 0 });
    const payment = {
      ...backupExpense,
      id: 202,
      transactionType: 'credit' as const,
      splits: [{
        contactName: 'Alex', amount: 25, isPaid: true, owedByMe: true,
        repaymentAllocations: [{ expenseId: 101, splitId: 'missing-debt', amount: 25 }],
      }],
    };

    expect(() => restoreExpenseSnapshot([payment], true)).toThrow(/references missing transaction 101/i);
    expect(mockExecute.mock.calls.map(([query]) => query)).toEqual([
      'BEGIN TRANSACTION', CLEAR_ALL_EXPENSES_SQL, INSERT_EXPENSE_SQL, 'ROLLBACK',
    ]);
  });
});

describe('clearAllExpenses', () => {
  let mockExecute: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute = getDatabase().execute as jest.Mock;
  });

  it('clears expense, merchant, and app classifier state in one transaction', () => {
    mockExecute
      .mockReturnValueOnce({ rowsAffected: 0 })
      .mockReturnValueOnce({ rowsAffected: 1 })
      .mockReturnValueOnce({ rowsAffected: 1 })
      .mockReturnValueOnce({ rowsAffected: 1 })
      .mockReturnValueOnce({ rowsAffected: 0 });

    clearAllExpenses();

    expect(mockExecute.mock.calls.map(([query]) => query)).toEqual([
      'BEGIN TRANSACTION',
      CLEAR_ALL_EXPENSES_SQL,
      CLEAR_ALL_MERCHANT_CATEGORIES_SQL,
      CLEAR_ALL_SETTINGS_SQL,
      'COMMIT',
    ]);
  });

  it('rolls all reset tables back when a reset statement fails', () => {
    mockExecute
      .mockReturnValueOnce({ rowsAffected: 0 })
      .mockReturnValueOnce({ rowsAffected: 1 })
      .mockImplementationOnce(() => { throw new Error('reset failed'); })
      .mockReturnValueOnce({ rowsAffected: 0 });

    expect(() => clearAllExpenses()).toThrow('reset failed');
    expect(mockExecute.mock.calls.map(([query]) => query)).toEqual([
      'BEGIN TRANSACTION',
      CLEAR_ALL_EXPENSES_SQL,
      CLEAR_ALL_MERCHANT_CATEGORIES_SQL,
      'ROLLBACK',
    ]);
  });
});

describe('transaction metadata persistence & mapping', () => {
  let mockExecute: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute = getDatabase().execute as jest.Mock;
  });

  it('persists tags, notes, bill image, transactionId, and map location', () => {
    mockExecute.mockReturnValueOnce({ insertId: 42 });

    const id = insertExpense({
      amount: 450,
      merchant: 'Swiggy',
      category: 'Food & Dining',
      confidence: 0.95,
      timestamp: 1730000000,
      source: 'sms',
      rawMessage: 'Rs 450 debited at Swiggy UPI: 987654321',
      transactionType: 'debit',
      transactionId: '987654321',
      tags: ['Food', 'Work'],
      notes: 'Team lunch',
      billImageUri: 'file:///storage/bills/bill_42.jpg',
      location: { latitude: 12.9716, longitude: 77.5946, accuracy: 5.0 },
    });

    expect(id).toBe(42);
    expect(mockExecute).toHaveBeenCalledWith(
      INSERT_EXPENSE_SQL,
      expect.arrayContaining([
        '987654321',
        JSON.stringify(['Food', 'Work']),
        'Team lunch',
        'file:///storage/bills/bill_42.jpg',
        JSON.stringify({ latitude: 12.9716, longitude: 77.5946, accuracy: 5.0 }),
      ])
    );
  });

  it('deserializes metadata and aliases transactionId to referenceId', () => {
    mockExecute.mockReturnValueOnce({
      rows: {
        _array: [
          {
            id: 10,
            amount: 250,
            merchant: 'Starbucks',
            category: 'Food & Dining',
            confidence: 0.9,
            timestamp: 1730001000,
            source: 'notification',
            raw_message: 'Paid 250 to Starbucks',
            transaction_type: 'debit',
            reference_id: 'UPI-112233',
            tags: JSON.stringify(['Work', 'Personal']),
            notes: 'Coffee break',
            bill_image_uri: 'file:///bills/c1.png',
            location: JSON.stringify({ latitude: 13.0827, longitude: 80.2707 }),
          },
        ],
      },
    });

    const expenses = getAllExpenses();
    expect(expenses).toHaveLength(1);
    const exp = expenses[0];
    expect(exp.referenceId).toBe('UPI-112233');
    expect(exp.transactionId).toBe('UPI-112233');
    expect(exp.tags).toEqual(['Work', 'Personal']);
    expect(exp.notes).toBe('Coffee break');
    expect(exp.billImageUri).toBe('file:///bills/c1.png');
    expect(exp.location).toEqual({ latitude: 13.0827, longitude: 80.2707 });
  });
});
