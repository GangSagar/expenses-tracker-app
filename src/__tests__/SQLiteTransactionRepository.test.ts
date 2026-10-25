import { SQLiteTransactionRepository } from '../database/SQLiteTransactionRepository';
import * as expenseRepo from '../database/expenseRepo';
import { Expense } from '../types/expense';

jest.mock('../database/expenseRepo', () => ({
  insertExpense: jest.fn(),
  insertExpenseWithRepayment: jest.fn(),
  getExpenseById: jest.fn(),
  restoreExpenseSnapshot: jest.fn(),
  mutateExpenseWithSplitUpdatesAtomically: jest.fn(),
}));

const mockedRepo = expenseRepo as jest.Mocked<typeof expenseRepo>;

const candidate: Omit<Expense, 'id'> = {
  amount: 12,
  merchant: 'Coffee',
  category: 'Food & Dining',
  confidence: 1,
  timestamp: 10,
  source: 'manual',
  rawMessage: 'backup sample',
  transactionType: 'debit',
};

describe('SQLiteTransactionRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns a persisted transaction from an insert identifier', () => {
    mockedRepo.insertExpense.mockReturnValue(23);
    const repository = new SQLiteTransactionRepository();

    expect(repository.insert(candidate)).toEqual({ ...candidate, id: 23 });
  });

  it('delegates backup snapshots without deriving transaction or repayment rules', () => {
    const backup = [{
      ...candidate,
      id: 50,
      splits: [{ contactName: 'Alex', amount: 40, paidAmount: 10, isPaid: false }],
    }];
    const repository = new SQLiteTransactionRepository();

    repository.restoreSnapshot(backup, true);

    expect(mockedRepo.restoreExpenseSnapshot).toHaveBeenCalledWith(backup, true);
  });

  it('routes an atomic transaction mutation and split adjustments to SQLite', () => {
    const repository = new SQLiteTransactionRepository();
    const mutation = { kind: 'delete' as const };
    const updates = [{ expenseId: 3, splits: [{ contactName: 'Alex', amount: 40, paidAmount: 0 }] }];

    repository.mutateWithSplitUpdates(7, mutation, updates);

    expect(mockedRepo.mutateExpenseWithSplitUpdatesAtomically).toHaveBeenCalledWith(7, mutation, updates);
  });
});
