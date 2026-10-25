import { Category, Expense } from '../types/expense';
import { SplitSettlementUpdate } from '../core/transactions/repaymentPlanner';
import {
  ExpenseQueryRepository,
  PersistedTransaction,
  TransactionBackupRepository,
  TransactionCandidate,
  TransactionDedupCache,
  TransactionMaintenanceRepository,
  TransactionMutation,
  TransactionRepository,
} from '../core/transactions/contracts';
import {
  clearAllExpenses,
  createDedupCache,
  deduplicateDatabase,
  deleteTransactionsForAccount,
  exportAllExpensesData,
  getAllExpenses,
  getExpenseById,
  getExpensesByCategory,
  getExpensesWithSplits,
  getMonthlyTotal,
  getRecentExpenses,
  getWindowedExpenses,
  insertExpense,
  insertExpenseWithRepayment,
  isDuplicateWithCache,
  mutateExpenseWithSplitUpdatesAtomically,
  restoreExpenseSnapshot,
  updateSplitExpensesAtomically,
  updateTrashReason,
} from './expenseRepo';

type ExpenseRepositoryPort = TransactionRepository
  & ExpenseQueryRepository
  & TransactionBackupRepository
  & TransactionMaintenanceRepository;

function persisted(expense: Expense, id: number): PersistedTransaction {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('SQLite did not return a valid transaction identifier.');
  }
  return { ...expense, id };
}

/** SQLite adapter for transaction application and presentation query ports. */
export class SQLiteTransactionRepository implements ExpenseRepositoryPort {
  insert(candidate: TransactionCandidate): PersistedTransaction {
    return persisted(candidate, insertExpense(candidate));
  }

  insertWithRepayment(
    candidate: TransactionCandidate,
    updates: SplitSettlementUpdate[],
  ): PersistedTransaction {
    return persisted(candidate, insertExpenseWithRepayment(candidate, updates));
  }

  findById(id: number): PersistedTransaction | null {
    const expense = getExpenseById(id);
    return expense?.id === undefined ? null : expense as PersistedTransaction;
  }

  getRecentExpenses(minutes?: number): Expense[] {
    return getRecentExpenses(minutes);
  }

  getExpensesWithSplits(): Expense[] {
    return getExpensesWithSplits();
  }

  updateSplitExpensesAtomically(updates: SplitSettlementUpdate[]): void {
    updateSplitExpensesAtomically(updates);
  }

  mutateWithSplitUpdates(
    id: number,
    mutation: TransactionMutation,
    updates: SplitSettlementUpdate[],
  ): void {
    mutateExpenseWithSplitUpdatesAtomically(id, mutation, updates);
  }

  getAllExpenses(limit?: number, offset?: number): Expense[] {
    return getAllExpenses(limit, offset);
  }

  getWindowedExpenses(days?: number): Expense[] {
    return getWindowedExpenses(days);
  }

  getExpensesByCategory(category: Category): Expense[] {
    return getExpensesByCategory(category);
  }

  getMonthlyTotal(year: number, month: number): number {
    return getMonthlyTotal(year, month);
  }

  exportAllExpenses(): Expense[] {
    return exportAllExpensesData();
  }

  restoreSnapshot(expenses: Expense[], overwrite: boolean): void {
    restoreExpenseSnapshot(expenses, overwrite);
  }

  clearAll(): void {
    clearAllExpenses();
  }

  updateTrashReason(id: number, reason: string | null): void {
    updateTrashReason(id, reason);
    if (!getExpenseById(id)) throw new Error(`Could not update trash reason for transaction ${id}`);
  }

  deduplicate(): number {
    return deduplicateDatabase();
  }

  deleteForAccount(bank: string, account: string): void {
    deleteTransactionsForAccount(bank, account);
  }

  createDedupCache(): TransactionDedupCache {
    return createDedupCache();
  }

  isDuplicateWithCache(
    cache: TransactionDedupCache,
    amount: number,
    timestamp: number,
    referenceId?: string,
    rawMessage?: string,
  ): boolean {
    return isDuplicateWithCache(cache, amount, timestamp, referenceId, rawMessage);
  }
}
