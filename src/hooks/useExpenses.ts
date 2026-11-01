import { create } from 'zustand';
import { Alert } from 'react-native';
import { Expense, Category } from '../types/expense';
import { SplitSettlementUpdate } from '../core/transactions/repaymentPlanner';
import {
  createManualTransaction,
  deleteTransactionUseCase,
  exportTransactionSnapshot,
  invalidateTransactionUseCase,
  linkDuplicateTransactionUseCase,
  queryAllTransactions,
  queryLinkedDuplicates,
  queryLinkedDuplicateCounts,
  queryWindowedTransactions,
  restoreTransactionSnapshot,
  runTransactionDeduplication,
  settleSplitContact,
  toggleSplitSettlement,
  unlinkDuplicateTransactionUseCase,
  updateTransactionUseCase,
  updateTrashReasonUseCase,
} from '../services/transactions/transactionApplication';

interface ExpenseState {
  expenses: Expense[];
  loading: boolean;
  pendingExpenses: Omit<Expense, 'id'>[];
  loadExpenses: () => void;
  addExpense: (expense: Expense, repaymentUpdates?: SplitSettlementUpdate[]) => void;
  addManualExpense: (expense: Omit<Expense, 'id'>) => void;
  updateExpense: (
    id: number,
    alias: string | undefined,
    merchant: string,
    category: Category,
    bank?: string,
    paymentMode?: string,
    amount?: number,
    splits?: any[],
    transactionType?: 'debit' | 'credit',
  ) => void;
  queuePendingExpense: (expense: Omit<Expense, 'id'>) => void;
  popPendingExpense: () => void;
  exportExpenses: () => Expense[];
  importExpenses: (imported: Expense[], overwrite: boolean) => void;
  settleContactSplits: (contactName: string) => boolean;
  unsettleContactSplits: (contactName: string) => boolean;
  toggleSplitPaid: (expenseId: number, contactName: string) => boolean;
  deleteExpense: (id: number) => boolean;
  invalidateExpense: (id: number, isInvalid: boolean) => boolean;
  updateTrashReason: (id: number, reason: string | null) => void;
  runDeduplication: () => number;
  linkedDuplicateCounts: Record<number, number>;
  linkDuplicate: (primaryId: number, duplicateId: number) => void;
  unlinkDuplicate: (duplicateId: number) => void;
  getLinkedDuplicates: (primaryId: number) => Expense[];
}

function applySplitUpdates(
  expenses: Expense[],
  updates: SplitSettlementUpdate[],
): Expense[] {
  const updatesById = new Map(updates.map(update => [update.expenseId, update.splits]));
  return expenses.map(expense => {
    if (expense.id === undefined) return expense;
    const splits = updatesById.get(expense.id);
    return splits ? { ...expense, splits } : expense;
  });
}

export const useExpenseStore = create<ExpenseState>((set, get) => ({
  expenses: [],
  loading: false,
  pendingExpenses: [],
  linkedDuplicateCounts: {},

  loadExpenses: () => {
    set({ loading: true });
    try {
      // Load last 30 days for the windowed view; screens paginate older data on demand
      const expenses = queryWindowedTransactions(30);
      let linkedDuplicateCounts: Record<number, number> = {};
      try {
        linkedDuplicateCounts = queryLinkedDuplicateCounts();
      } catch (err) {
        console.warn('Failed to query linked duplicate counts', err);
      }
      set({ expenses, linkedDuplicateCounts, loading: false });
    } catch (e) {
      console.error('Failed to load expenses', e);
      set({ loading: false });
    }
  },

  addExpense: (expense, updates = []) => {
    set(state => ({
      expenses: [
        expense,
        ...applySplitUpdates(state.expenses, updates),
      ],
    }));
  },

  addManualExpense: (expense: Omit<Expense, 'id'>) => {
    try {
      const result = createManualTransaction(expense);
      if (result.status !== 'saved') {
        throw new Error(result.status === 'failed' ? result.message : 'Manual transaction was not saved');
      }
      set(state => ({
        expenses: [result.transaction, ...applySplitUpdates(state.expenses, result.repaymentUpdates)],
      }));
    } catch (e) {
      console.error('Failed to add manual expense', e);
    }
  },

  updateExpense: (
    id,
    alias,
    merchant,
    category,
    bank,
    paymentMode,
    amount,
    splits,
    transactionType,
  ) => {
    try {
      const existing = get().expenses.find(expense => expense.id === id);
      updateTransactionUseCase(
        existing,
        alias,
        id,
        merchant,
        category,
        bank,
        paymentMode as Expense['paymentMode'],
        amount,
        splits,
        transactionType,
      );

      set({ expenses: queryAllTransactions(2000) });
    } catch (e) {
      console.error('Failed to update expense', e);
      Alert.alert('Unable to update transaction', errorMessage(e));
    }
  },

  queuePendingExpense: expense => {
    set(state => ({ pendingExpenses: [...state.pendingExpenses, expense] }));
  },

  popPendingExpense: () => {
    set(state => ({ pendingExpenses: state.pendingExpenses.slice(1) }));
  },

  exportExpenses: () => {
    try {
      return exportTransactionSnapshot();
    } catch (e) {
      console.error('Failed to export expenses', e);
      return [];
    }
  },

  importExpenses: (imported, overwrite) => {
    try {
      restoreTransactionSnapshot(imported, overwrite);
      const reloaded = queryAllTransactions(2000);
      set({ expenses: reloaded });
    } catch (e) {
      console.error('Failed to import expenses', e);
      throw e;
    }
  },

  settleContactSplits: contactName => {
    try {
      const updates = settleSplitContact(contactName, 'settle');
      set(state => ({ expenses: applySplitUpdates(state.expenses, updates) }));
      return true;
    } catch (e) {
      console.error('Failed to settle contact splits', e);
      Alert.alert('Unable to settle splits', errorMessage(e));
      return false;
    }
  },

  unsettleContactSplits: contactName => {
    try {
      const updates = settleSplitContact(contactName, 'unsettle');
      set(state => ({ expenses: applySplitUpdates(state.expenses, updates) }));
      return true;
    } catch (e) {
      console.error('Failed to unsettle contact splits', e);
      Alert.alert('Unable to unsettle splits', errorMessage(e));
      return false;
    }
  },

  toggleSplitPaid: (expenseId, contactName) => {
    try {
      const updates = toggleSplitSettlement(expenseId, contactName);
      set(state => ({ expenses: applySplitUpdates(state.expenses, updates) }));
      return true;
    } catch (e) {
      console.error('Failed to toggle split paid status', e);
      Alert.alert('Unable to update split', errorMessage(e));
      return false;
    }
  },

  deleteExpense: id => {
    try {
      deleteTransactionUseCase(id);
      set({ expenses: queryAllTransactions(2000) });
      return true;
    } catch (e) {
      console.error('Failed to delete expense', e);
      Alert.alert('Unable to delete transaction', errorMessage(e));
      return false;
    }
  },

  invalidateExpense: (id, isInvalid) => {
    try {
      invalidateTransactionUseCase(id, isInvalid);
      set({ expenses: queryAllTransactions(2000) });
    } catch (e) {
      console.error('Failed to invalidate expense', e);
      Alert.alert('Unable to change transaction status', errorMessage(e));
      return false;
    }
    return true;
  },

  updateTrashReason: (id, reason) => {
    try {
      updateTrashReasonUseCase(id, reason);
      set(state => ({
        expenses: state.expenses.map(e =>
          e.id === id ? { ...e, trashReason: reason as any } : e,
        ),
      }));
    } catch (e) {
      console.error('Failed to update trash reason', e);
    }
  },

  runDeduplication: () => {
    try {
      const count = runTransactionDeduplication();
      // Reload expenses completely since many items could have been modified
      if (count > 0) {
        const reloaded = queryAllTransactions(2000);
        set({ expenses: reloaded });
      }
      return count;
    } catch (e) {
      console.error('Failed to deduplicate database', e);
      Alert.alert('Unable to deduplicate transactions', errorMessage(e));
      return 0;
    }
  },

  linkDuplicate: (primaryId: number, duplicateId: number) => {
    try {
      linkDuplicateTransactionUseCase(primaryId, duplicateId);
      const linkedDuplicateCounts = queryLinkedDuplicateCounts();
      // Remove duplicateId from state.expenses because it is now hidden under primaryId
      set(state => ({
        expenses: state.expenses.filter(e => e.id !== duplicateId),
        linkedDuplicateCounts,
      }));
    } catch (e) {
      console.error('Failed to link duplicate expense', e);
      Alert.alert('Unable to link duplicate', errorMessage(e));
    }
  },

  unlinkDuplicate: (duplicateId: number) => {
    try {
      unlinkDuplicateTransactionUseCase(duplicateId);
      // Reload windowed expenses so the unlinked transaction automatically appears again in history
      const expenses = queryWindowedTransactions(30);
      const linkedDuplicateCounts = queryLinkedDuplicateCounts();
      set({ expenses, linkedDuplicateCounts });
    } catch (e) {
      console.error('Failed to unlink duplicate expense', e);
      Alert.alert('Unable to break link', errorMessage(e));
    }
  },

  getLinkedDuplicates: (primaryId: number) => {
    try {
      return queryLinkedDuplicates(primaryId);
    } catch (e) {
      console.error('Failed to query linked duplicates', e);
      return [];
    }
  },
}));

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
