import { create } from 'zustand';
import { Expense, Category } from '../types/expense';
import { getAllExpenses, updateExpense as updateExpenseDb, saveMerchantCategory, insertExpense as insertExpenseDb, exportAllExpensesData, clearAllExpenses, deleteExpense as deleteExpenseDb, invalidateExpense as invalidateExpenseDb } from '../database/expenseRepo';
import { setMerchantMapping } from '../core/classifier/merchantMap';

interface ExpenseState {
  expenses: Expense[];
  loading: boolean;
  pendingExpenses: Omit<Expense, 'id'>[];
  loadExpenses: () => void;
  addExpense: (expense: Expense) => void;
  addManualExpense: (expense: Omit<Expense, 'id'>) => void;
  updateExpense: (id: number, alias: string | undefined, merchant: string, category: Category, bank?: string, paymentMode?: string, amount?: number, splits?: any[]) => void;
  queuePendingExpense: (expense: Omit<Expense, 'id'>) => void;
  popPendingExpense: () => void;
  exportExpenses: () => Expense[];
  importExpenses: (imported: Expense[], overwrite: boolean) => void;
  settleContactSplits: (contactName: string) => void;
  deleteExpense: (id: number) => void;
  invalidateExpense: (id: number, isInvalid: boolean) => void;
}

export const useExpenseStore = create<ExpenseState>((set, get) => ({
  expenses: [],
  loading: false,
  pendingExpenses: [],

  loadExpenses: () => {
    set({ loading: true });
    try {
      const expenses = getAllExpenses(100);
      set({ expenses, loading: false });
    } catch (e) {
      console.error('Failed to load expenses', e);
      set({ loading: false });
    }
  },

  addExpense: (expense: Expense) => {
    set(state => ({ expenses: [expense, ...state.expenses] }));
  },

  addManualExpense: (expense: Omit<Expense, 'id'>) => {
    try {
      const id = insertExpenseDb(expense);
      const newExpense: Expense = { ...expense, id };
      set(state => ({ expenses: [newExpense, ...state.expenses] }));
    } catch (e) {
      console.error('Failed to add manual expense', e);
    }
  },

  updateExpense: (id, alias, merchant, category, bank, paymentMode, amount, splits) => {
    try {
      updateExpenseDb(id, merchant, category, bank, paymentMode, amount, splits);
      
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
                splits: splits
              } 
            : e
        )
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

      const reloaded = getAllExpenses(100);
      set({ expenses: reloaded });
    } catch (e) {
      console.error('Failed to import expenses', e);
      throw e;
    }
  },

  settleContactSplits: (contactName) => {
    try {
      const expenses = get().expenses;
      
      // Find all expenses that have a split with this contact name
      const affected = expenses.filter(e => 
        e.splits && e.splits.some(s => s.contactName === contactName && !s.isPaid)
      );

      for (const e of affected) {
        if (!e.id) continue;
        const updatedSplits = e.splits?.map(s => 
          s.contactName === contactName ? { ...s, isPaid: true } : s
        ) || [];

        // Save to DB
        updateExpenseDb(
          e.id, 
          e.merchant, 
          e.category, 
          e.bank, 
          e.paymentMode, 
          e.amount, 
          updatedSplits
        );
      }

      // Reload expenses from DB to ensure state consistency
      const reloaded = getAllExpenses(100);
      set({ expenses: reloaded });
    } catch (e) {
      console.error('Failed to settle contact splits', e);
    }
  },

  deleteExpense: (id) => {
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
        expenses: state.expenses.map(e => e.id === id ? { ...e, isInvalid } : e),
      }));
    } catch (e) {
      console.error('Failed to invalidate expense', e);
    }
  },
}));
