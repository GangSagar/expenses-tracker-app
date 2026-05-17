import { create } from 'zustand';
import { Expense, Category, ExpenseSplit } from '../types/expense';
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
  unsettleContactSplits: (contactName: string) => void;
  toggleSplitPaid: (expenseId: number, contactName: string) => void;
  deleteExpense: (id: number) => void;
  invalidateExpense: (id: number, isInvalid: boolean) => void;
}

// Helper to automatically apply credit repayments to pending contact splits
function applyRepaymentIfApplicable(
  expense: Omit<Expense, 'id'> & { id?: number },
  currentExpenses: Expense[]
): Omit<Expense, 'id'> & { id?: number } {
  if (expense.transactionType !== 'credit' || expense.isInvalid) {
    return expense;
  }

  // 1. Get all unique contact names that have pending splits where we are owed money
  const pendingSplitsByContact: Record<
    string,
    { amount: number; splits: { expenseId: number; splitIndex: number; sp: any }[] }
  > = {};

  for (const exp of currentExpenses) {
    if (!exp.splits || exp.splits.length === 0 || !exp.id || exp.isInvalid) continue;

    for (let i = 0; i < exp.splits.length; i++) {
      const sp: ExpenseSplit = exp.splits[i];
      if (sp.isPaid || sp.owedByMe) continue;

      const name = sp.contactName.trim();
      if (!name) continue;

      if (!pendingSplitsByContact[name]) {
        pendingSplitsByContact[name] = { amount: 0, splits: [] };
      }
      pendingSplitsByContact[name].amount += Number(sp.amount) || 0;
      pendingSplitsByContact[name].splits.push({ expenseId: exp.id, splitIndex: i, sp });
    }
  }

  // 2. Search for a matching contact name in merchant, alias, or rawMessage using word boundary regex
  const merchantText = (expense.merchant || '').toLowerCase();
  const aliasText = (expense.alias || '').toLowerCase();
  const rawText = (expense.rawMessage || '').toLowerCase();

  let matchedContact: string | null = null;
  for (const name of Object.keys(pendingSplitsByContact)) {
    const lowerName = name.toLowerCase();
    const escapedName = lowerName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedName}\\b`, 'i');

    if (
      regex.test(merchantText) ||
      regex.test(aliasText) ||
      regex.test(rawText)
    ) {
      matchedContact = name;
      break;
    }
  }

  if (!matchedContact) {
    return expense;
  }

  // 3. Settle matched pending splits up to the received amount
  const matchData = pendingSplitsByContact[matchedContact];
  const totalOwed = matchData.amount;
  const receivedAmount = expense.amount;

  let remainingPayment = receivedAmount;

  // Sort splits oldest first so we pay off chronologically
  const sortedPending = [...matchData.splits].sort((a, b) => {
    const expA = currentExpenses.find(e => e.id === a.expenseId);
    const expB = currentExpenses.find(e => e.id === b.expenseId);
    return (expA?.timestamp || 0) - (expB?.timestamp || 0);
  });

  for (const item of sortedPending) {
    if (remainingPayment <= 0) break;

    const exp = currentExpenses.find(e => e.id === item.expenseId);
    if (!exp || !exp.splits) continue;

    const splitAmt = Number(item.sp.amount) || 0;

    const updatedSplits = exp.splits.map((s, idx) => {
      if (idx === item.splitIndex) {
        return { ...s, isPaid: true };
      }
      return s;
    });

    // Save update to DB
    updateExpenseDb(
      exp.id!,
      exp.merchant,
      exp.category,
      exp.bank,
      exp.paymentMode,
      exp.amount,
      updatedSplits
    );

    // Update in memory copy as well
    exp.splits = updatedSplits;

    remainingPayment -= splitAmt;
  }

  // 4. Attach a settled split entry to the incoming credit transaction
  const appliedRepaymentAmount = Math.min(receivedAmount, totalOwed);
  expense.splits = [
    {
      contactName: matchedContact,
      amount: appliedRepaymentAmount,
      isPaid: true,
      owedByMe: true, // Mark as "owed by me" to counterbalance the outstanding debt in calculation
    },
  ];

  return expense;
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
    const processed = applyRepaymentIfApplicable(expense, get().expenses);
    if (processed.splits && processed.id) {
      updateExpenseDb(
        processed.id,
        processed.merchant,
        processed.category,
        processed.bank,
        processed.paymentMode,
        processed.amount,
        processed.splits
      );
    }
    set(state => ({ expenses: [processed as Expense, ...state.expenses] }));
  },

  addManualExpense: (expense: Omit<Expense, 'id'>) => {
    try {
      const processed = applyRepaymentIfApplicable(expense, get().expenses);
      const id = insertExpenseDb(processed);
      const newExpense: Expense = { ...processed, id };
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

  unsettleContactSplits: (contactName) => {
    try {
      const expenses = get().expenses;
      
      // Find all expenses that have a settled split with this contact name
      const affected = expenses.filter(e => 
        e.splits && e.splits.some(s => s.contactName === contactName && s.isPaid)
      );

      for (const e of affected) {
        if (!e.id) continue;
        const updatedSplits = e.splits?.map(s => 
          s.contactName === contactName ? { ...s, isPaid: false } : s
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

      // Reload expenses from DB
      const reloaded = getAllExpenses(100);
      set({ expenses: reloaded });
    } catch (e) {
      console.error('Failed to unsettle contact splits', e);
    }
  },

  toggleSplitPaid: (expenseId, contactName) => {
    try {
      const expenses = get().expenses;
      const expense = expenses.find(e => e.id === expenseId);
      if (!expense || !expense.splits) return;

      const updatedSplits = expense.splits.map(s => 
        s.contactName === contactName ? { ...s, isPaid: !s.isPaid } : s
      );

      // Save to DB
      updateExpenseDb(
        expense.id!, 
        expense.merchant, 
        expense.category, 
        expense.bank, 
        expense.paymentMode, 
        expense.amount, 
        updatedSplits
      );

      // Reload
      const reloaded = getAllExpenses(100);
      set({ expenses: reloaded });
    } catch (e) {
      console.error('Failed to toggle split paid status', e);
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
