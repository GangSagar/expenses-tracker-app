import {
  isDuplicateTransaction,
  SELECT_EXPENSE_BY_REF_SQL,
  SELECT_EXPENSE_DEDUP_WINDOW_SQL,
  INSERT_EXPENSE_SQL,
  UPDATE_EXPENSE_SPLITS_SQL,
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
