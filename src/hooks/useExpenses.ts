import { create } from 'zustand';
import { Expense, Category } from '../types/expense';
import {
  getAllExpenses,
  updateExpense as updateExpenseDb,
  saveMerchantCategory,
  insertExpense as insertExpenseDb,
  exportAllExpensesData,
  clearAllExpenses,
  deleteExpense as deleteExpenseDb,
  invalidateExpense as invalidateExpenseDb,
  updateTrashReason as updateTrashReasonDb,
  deduplicateDatabase as deduplicateDatabaseDb,
  getWindowedExpenses,
  insertExpenseWithRepayment,
  updateExpenseWithRepayment,
} from '../database/expenseRepo';
import { setMerchantMapping } from '../core/classifier/merchantMap';
import {
  planAutomaticRepayment,
  repaymentSplit,
} from '../core/transactions/repaymentPlanner';
import { SplitSettlementUpdate } from '../core/transactions/repaymentPlanner';

interface ExpenseState {
  expenses: Expense[];
  loading: boolean;
  pendingExpenses: Omit<Expense, 'id'>[];
  loadExpenses: () => void;
  addExpense: (expense: Expense) => void;
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
  settleContactSplits: (contactName: string) => void;
  unsettleContactSplits: (contactName: string) => void;
  toggleSplitPaid: (expenseId: number, contactName: string) => void;
  deleteExpense: (id: number) => void;
  invalidateExpense: (id: number, isInvalid: boolean) => void;
  updateTrashReason: (id: number, reason: string | null) => void;
  runDeduplication: () => number;
}

function prepareRepayment(
  expense: Omit<Expense, 'id'> & { id?: number },
  currentExpenses: Expense[],
): { expense: Omit<Expense, 'id'> & { id?: number }; updates: SplitSettlementUpdate[] } {
  const plan = planAutomaticRepayment(expense, currentExpenses);
  if (!plan) return { expense, updates: [] };

  return {
    expense: { ...expense, splits: [repaymentSplit(plan)] },
    updates: plan.updates,
  };
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

  loadExpenses: () => {
    set({ loading: true });
    try {
      // Load last 30 days for the windowed view; screens paginate older data on demand
      const expenses = getWindowedExpenses(30);
      set({ expenses, loading: false });
    } catch (e) {
      console.error('Failed to load expenses', e);
      set({ loading: false });
    }
  },

  addExpense: (expense: Expense) => {
    const { expense: processed, updates } = prepareRepayment(expense, get().expenses);
    let visibleExpense = processed as Expense;
    let committedUpdates = updates;

    if (updates.length > 0 && processed.id !== undefined) {
      try {
        updateExpenseWithRepayment(processed.id, processed.splits, updates);
      } catch (error) {
        console.error('Failed to apply automatic repayment', error);
        // The transaction was already inserted by the caller. Keep it visible
        // without a repayment link when the atomic settlement write rolls back.
        visibleExpense = { ...expense };
        committedUpdates = [];
      }
    } else if (updates.length > 0) {
      visibleExpense = { ...expense } as Expense;
      committedUpdates = [];
    }

    set(state => ({
      expenses: [
        visibleExpense,
        ...applySplitUpdates(state.expenses, committedUpdates),
      ],
    }));
  },

  addManualExpense: (expense: Omit<Expense, 'id'>) => {
    try {
      const { expense: processed, updates } = prepareRepayment(expense, get().expenses);
      const id = updates.length > 0
        ? insertExpenseWithRepayment(processed, updates)
        : insertExpenseDb(processed);
      const newExpense: Expense = { ...processed, id };
      set(state => ({
        expenses: [newExpense, ...applySplitUpdates(state.expenses, updates)],
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
      updateExpenseDb(
        id,
        merchant,
        category,
        bank,
        paymentMode,
        amount,
        splits,
        transactionType,
      );

      // Smart Remember: Update the memory map and DB map using alias
      const effectiveAlias = alias || merchant;
      if (effectiveAlias && effectiveAlias !== 'Unknown') {
        setMerchantMapping(effectiveAlias, category, merchant);
        saveMerchantCategory(effectiveAlias, category, merchant);
      }

      set(state => ({
        expenses: state.expenses.map(e =>
          e.id === id
            ? {
                ...e,
                merchant,
                category,
                bank,
                paymentMode: paymentMode as any,
                amount: amount !== undefined ? amount : e.amount,
                splits: splits,
                transactionType: transactionType || e.transactionType,
              }
            : e,
        ),
      }));
    } catch (e) {
      console.error('Failed to update expense', e);
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
      return exportAllExpensesData();
    } catch (e) {
      console.error('Failed to export expenses', e);
      return [];
    }
  },

  importExpenses: (imported, overwrite) => {
    try {
      if (overwrite) {
        clearAllExpenses();
      }

      // Batch insert each imported item
      for (const item of imported) {
        insertExpenseDb({
          amount: item.amount,
          merchant: item.merchant,
          alias: item.alias,
          category: item.category,
          confidence: item.confidence || 1.0,
          timestamp: item.timestamp,
          source: item.source || 'manual',
          rawMessage: item.rawMessage || 'Imported Transaction',
          transactionType: item.transactionType || 'debit',
          account: item.account,
          bank: item.bank,
          paymentMode: item.paymentMode,
          isDuplicate: item.isDuplicate,
          availableBalance: item.availableBalance,
          splits: item.splits,
        });
      }

      const reloaded = getAllExpenses(2000);
      set({ expenses: reloaded });
    } catch (e) {
      console.error('Failed to import expenses', e);
      throw e;
    }
  },

  settleContactSplits: contactName => {
    try {
      const expenses = get().expenses;
      const affected = expenses.filter(
        e => e.splits && e.splits.some(s => s.contactName === contactName && !s.isPaid),
      );
      for (const e of affected) {
        if (!e.id) continue;
        const updatedSplits =
          e.splits?.map(s => s.contactName === contactName
            ? { ...s, isPaid: true, paidAmount: s.amount }
            : s) || [];
        updateExpenseDb(e.id, e.merchant, e.category, e.bank, e.paymentMode, e.amount, updatedSplits);
      }
      set({ expenses: getAllExpenses(2000) });
    } catch (e) {
      console.error('Failed to settle contact splits', e);
    }
  },

  unsettleContactSplits: contactName => {
    try {
      const expenses = get().expenses;
      const affected = expenses.filter(
        e => e.splits && e.splits.some(s =>
          s.contactName === contactName && (s.isPaid || (Number(s.paidAmount) || 0) > 0),
        ),
      );
      for (const e of affected) {
        if (!e.id) continue;
        const updatedSplits =
          e.splits?.map(s => s.contactName === contactName
            ? { ...s, isPaid: false, paidAmount: 0 }
            : s) || [];
        updateExpenseDb(e.id, e.merchant, e.category, e.bank, e.paymentMode, e.amount, updatedSplits);
      }
      set({ expenses: getAllExpenses(2000) });
    } catch (e) {
      console.error('Failed to unsettle contact splits', e);
    }
  },

  toggleSplitPaid: (expenseId, contactName) => {
    try {
      const expenses = get().expenses;
      const expense = expenses.find(e => e.id === expenseId);
      if (!expense || !expense.splits) return;

      const updatedSplits = expense.splits.map(s => {
        if (s.contactName !== contactName) return s;
        const markPaid = !s.isPaid;
        return {
          ...s,
          isPaid: markPaid,
          paidAmount: markPaid ? s.amount : 0,
        };
      });

      // Save to DB
      updateExpenseDb(
        expense.id!,
        expense.merchant,
        expense.category,
        expense.bank,
        expense.paymentMode,
        expense.amount,
        updatedSplits,
      );

      // Reload
      const reloaded = getAllExpenses(2000);
      set({ expenses: reloaded });
    } catch (e) {
      console.error('Failed to toggle split paid status', e);
    }
  },

  deleteExpense: id => {
    try {
      deleteExpenseDb(id);
      set(state => ({
        expenses: state.expenses.filter(e => e.id !== id),
      }));
    } catch (e) {
      console.error('Failed to delete expense', e);
    }
  },

  invalidateExpense: (id, isInvalid) => {
    try {
      invalidateExpenseDb(id, isInvalid);
      set(state => ({
        expenses: state.expenses.map(e =>
          e.id === id ? { ...e, isInvalid } : e,
        ),
      }));
    } catch (e) {
      console.error('Failed to invalidate expense', e);
    }
  },

  updateTrashReason: (id, reason) => {
    try {
      updateTrashReasonDb(id, reason);
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
      const count = deduplicateDatabaseDb();
      // Reload expenses completely since many items could have been modified
      if (count > 0) {
        const reloaded = getAllExpenses(2000);
        set({ expenses: reloaded });
      }
      return count;
    } catch (e) {
      console.error('Failed to deduplicate database', e);
      return 0;
    }
  },
}));
