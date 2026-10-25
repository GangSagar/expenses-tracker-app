import { SQLiteTransactionRepository } from '../database/SQLiteTransactionRepository';
import * as expenseRepo from '../database/expenseRepo';
import { Expense } from '../types/expense';

jest.mock('../database/expenseRepo', () => ({
  insertExpense: jest.fn(),
  insertExpenseWithRepayment: jest.fn(),
  getExpenseById: jest.fn(),
  updateExpense: jest.fn(),
  restoreExpenseSnapshot: jest.fn(),
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

  it('reports an update for a missing row as failure', () => {
    mockedRepo.getExpenseById.mockReturnValue(null);
    const repository = new SQLiteTransactionRepository();

    expect(() => repository.update(404, 'Coffee', 'Food & Dining')).toThrow(
      'Could not update transaction 404',
    );
    expect(mockedRepo.updateExpense).toHaveBeenCalledWith(
      404, 'Coffee', 'Food & Dining', undefined, undefined, undefined, undefined, undefined,
    );
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
});
