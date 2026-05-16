import { create } from 'zustand';
import { Expense, Category } from '../types/expense';
import { getAllExpenses, updateExpense as updateExpenseDb, saveMerchantCategory } from '../database/expenseRepo';
import { setMerchantMapping } from '../core/classifier/merchantMap';

interface ExpenseState {
  expenses: Expense[];
  loading: boolean;
  pendingExpenses: Omit<Expense, 'id'>[];
  loadExpenses: () => void;
  addExpense: (expense: Expense) => void;
  updateExpense: (id: number, alias: string | undefined, merchant: string, category: Category, bank?: string, paymentMode?: string) => void;
  queuePendingExpense: (expense: Omit<Expense, 'id'>) => void;
  popPendingExpense: () => void;
}

export const useExpenseStore = create<ExpenseState>(set => ({
  expenses: [],
  loading: false,
  pendingExpenses: [],

  loadExpenses: () => {
    set({ loading: true });
    try {
      const expenses = getAllExpenses(100);
      set({ expenses, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addExpense: (expense: Expense) => {
    set(state => ({ expenses: [expense, ...state.expenses] }));
  },

  updateExpense: (id, alias, merchant, category, bank, paymentMode) => {
    try {
      updateExpenseDb(id, merchant, category, bank, paymentMode);
      
      // Smart Remember: Update the memory map and DB map using alias
      const effectiveAlias = alias || merchant;
      if (effectiveAlias && effectiveAlias !== 'Unknown') {
        setMerchantMapping(effectiveAlias, category, merchant);
        saveMerchantCategory(effectiveAlias, category, merchant);
      }

      set(state => ({
        expenses: state.expenses.map(e => 
          e.id === id 
            ? { ...e, merchant, category, bank, paymentMode: paymentMode as any } 
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
}));
