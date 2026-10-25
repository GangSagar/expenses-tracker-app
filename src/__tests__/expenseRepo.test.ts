import {
  isDuplicateTransaction,
  SELECT_EXPENSE_BY_REF_SQL,
  SELECT_EXPENSE_DEDUP_WINDOW_SQL,
  INSERT_EXPENSE_SQL,
  UPDATE_EXPENSE_SPLITS_SQL,
  GET_EXPENSES_WITH_SPLITS_SQL,
  getExpensesWithSplits,
  updateSplitExpensesAtomically,
  insertExpenseWithRepayment,
  updateExpenseWithRepayment,
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

describe('isDuplicateTransaction (SQLite Ledger)', () => {
  let mockExecute: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute = getDatabase().execute as jest.Mock;
  });

  it('should return true if referenceId exists in database', () => {
    // Mock the reference_id SELECT query to return a row
    mockExecute.mockReturnValueOnce({
      rows: [{ id: 100 }],
    });

    const result = isDuplicateTransaction(150.0, 1621245600000, 'TXN123456');

    expect(result).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith(
      SELECT_EXPENSE_BY_REF_SQL,
      ['TXN123456']
    );
  });

  it('should return true if amount and timestamp match in database (no referenceId)', () => {
    // Mock the timestamp/amount SELECT query to return a row
    mockExecute.mockReturnValueOnce({
      rows: [{ id: 101 }],
    });

    const result = isDuplicateTransaction(200.0, 1621245600000);

    expect(result).toBe(true);
    expect(mockExecute).toHaveBeenCalledWith(
      SELECT_EXPENSE_DEDUP_WINDOW_SQL,
      [200.0, 1621245600000 - 15 * 60 * 1000, 1621245600000 + 15 * 60 * 1000]
    );
  });

  it('should return false if no duplicates are found (with referenceId)', () => {
    // Mock reference_id query to return empty
    mockExecute.mockReturnValueOnce({
      rows: [],
    });
    // Mock timestamp/amount query to return empty
    mockExecute.mockReturnValueOnce({
      rows: [],
    });

    const result = isDuplicateTransaction(150.0, 1621245600000, 'TXN999999');

    expect(result).toBe(false);
    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(mockExecute).toHaveBeenNthCalledWith(1, SELECT_EXPENSE_BY_REF_SQL, ['TXN999999']);
    expect(mockExecute).toHaveBeenNthCalledWith(2, SELECT_EXPENSE_DEDUP_WINDOW_SQL, [
      150.0,
      1621245600000 - 15 * 60 * 1000,
      1621245600000 + 15 * 60 * 1000,
    ]);
  });

  it('should return false if no duplicates are found (without referenceId)', () => {
    // Mock timestamp/amount query to return empty
    mockExecute.mockReturnValueOnce({
      rows: [],
    });

    const result = isDuplicateTransaction(300.0, 1621245600000);

    expect(result).toBe(false);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith(
      SELECT_EXPENSE_DEDUP_WINDOW_SQL,
      [300.0, 1621245600000 - 15 * 60 * 1000, 1621245600000 + 15 * 60 * 1000]
    );
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

describe('updateExpenseWithRepayment', () => {
  let mockExecute: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute = getDatabase().execute as jest.Mock;
  });

  it('rolls back earlier split updates if linking the incoming credit fails', () => {
    mockExecute
      .mockReturnValueOnce({ rowsAffected: 0 }) // BEGIN
      .mockReturnValueOnce({ rowsAffected: 1 }) // old split update
      .mockImplementationOnce(() => {
        throw new Error('credit update failed');
      })
      .mockReturnValueOnce({ rowsAffected: 0 }); // ROLLBACK

    expect(() => updateExpenseWithRepayment(42, [
      { contactName: 'Alex', amount: 75, isPaid: true, owedByMe: true },
    ], [{
      expenseId: 7,
      splits: [{ contactName: 'Alex', amount: 75, isPaid: true }],
    }])).toThrow('credit update failed');

    expect(mockExecute.mock.calls.map(([query]) => query)).toEqual([
      'BEGIN TRANSACTION',
      UPDATE_EXPENSE_SPLITS_SQL,
      UPDATE_EXPENSE_SPLITS_SQL,
      'ROLLBACK',
    ]);
  });
});
