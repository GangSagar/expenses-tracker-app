import { Expense } from '../types/expense';
import { planAutomaticRepayment, repaymentSplit } from '../core/transactions/repaymentPlanner';
import {
  getManualSplitUpdates,
  planRepaymentReversal,
  validateDebtSplitMutation,
} from '../core/transactions/splitSettlement';
import {
  deleteTransaction,
  invalidateTransactionWithRepaymentRules,
  settleSplits,
  updateTransactionWithRepaymentRules,
} from '../core/transactions/applicationUseCases';
import { TransactionRepository } from '../core/transactions/contracts';

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 1,
    amount: 100,
    merchant: 'Dinner',
    category: 'Food & Dining',
    confidence: 1,
    timestamp: 1,
    source: 'manual',
    rawMessage: '',
    transactionType: 'debit',
    ...overrides,
  };
}

function linkedLedger(): Expense[] {
  const initialDebt = expense({
    id: 10,
    splits: [{
      splitId: 'alex-dinner', contactName: 'Alex', amount: 100,
    }],
  });
  const paymentPlan = planAutomaticRepayment({
    amount: 35,
    merchant: 'Repayment from Alex',
    category: 'Other',
    confidence: 1,
    timestamp: 2,
    source: 'manual',
    rawMessage: '',
    transactionType: 'credit',
  }, [initialDebt]);
  const debt = expense({ ...initialDebt, splits: paymentPlan!.updates[0].splits });
  return [debt, expense({
    id: 11,
    amount: 35,
    merchant: 'Repayment from Alex',
    timestamp: 2,
    transactionType: 'credit',
    splits: [repaymentSplit(paymentPlan!)],
  })];
}

function repository(ledger: Expense[]) {
  let mutation: any;
  let mutationUpdates: any;
  const repo: TransactionRepository = {
    insert: value => ({ ...value, id: 500 }),
    insertWithRepayment: value => ({ ...value, id: 500 }),
    findById: id => ledger.find(row => row.id === id) as (Expense & { id: number }) || null,
    getRecentExpenses: () => [],
    getExpensesWithSplits: () => ledger,
    updateSplitExpensesAtomically: () => {},
    mutateWithSplitUpdates: (id, nextMutation, updates) => {
      mutation = { id, ...nextMutation };
      mutationUpdates = updates;
    },
  };
  return {
    repo,
    getMutation: () => mutation,
    getUpdates: () => mutationUpdates,
  };
}

describe('split settlement domain', () => {
  it('records exact partial repayment allocations and keeps original split amounts', () => {
    const debt = expense({
      id: 10,
      splits: [{ contactName: 'Alex', amount: 100 }],
    });
    const plan = planAutomaticRepayment({
      amount: 35,
      merchant: 'Repayment from Alex',
      category: 'Other',
      confidence: 1,
      timestamp: 2,
      source: 'manual',
      rawMessage: '',
      transactionType: 'credit',
    }, [debt]);

    expect(plan?.updates[0].splits[0]).toMatchObject({
      amount: 100,
      paidAmount: 35,
      manualPaidAmount: 0,
      repaymentPaidAmount: 35,
      isPaid: false,
    });
    expect(plan?.allocations).toEqual([{
      expenseId: 10,
      splitId: 'legacy-10-0',
      amount: 35,
    }]);
    expect(repaymentSplit(plan!).repaymentAllocations).toEqual(plan?.allocations);
  });

  it('manual settlement and unsettlement preserve exact automatic repayment amounts', () => {
    const debt = expense({
      id: 10,
      splits: [{
        splitId: 'alex-dinner', contactName: 'Alex', amount: 100,
        paidAmount: 35, manualPaidAmount: 0, repaymentPaidAmount: 35,
      }],
    });
    const settled = getManualSplitUpdates([debt], 'Alex', 'settle')[0].splits[0];
    expect(settled).toMatchObject({ manualPaidAmount: 65, repaymentPaidAmount: 35, paidAmount: 100, isPaid: true });

    const unsettled = getManualSplitUpdates([{ ...debt, splits: [settled] }], 'Alex', 'unsettle')[0].splits[0];
    expect(unsettled).toMatchObject({ manualPaidAmount: 0, repaymentPaidAmount: 35, paidAmount: 35, isPaid: false });
  });

  it('runs contact settlement through the use case using the complete repository ledger', () => {
    const debt = expense({
      id: 44,
      splits: [{
        splitId: 'alex-dinner', contactName: 'Alex', amount: 100,
        paidAmount: 35, manualPaidAmount: 0, repaymentPaidAmount: 35,
      }],
    });
    const state = repository([debt]);
    let persisted: any[] = [];
    const original = state.repo.updateSplitExpensesAtomically;
    state.repo.updateSplitExpensesAtomically = updates => {
      persisted = updates;
      original(updates);
    };

    const updates = settleSplits(state.repo, 'Alex', 'unsettle');

    expect(persisted).toEqual(updates);
    expect(updates[0].splits[0]).toMatchObject({
      manualPaidAmount: 0, repaymentPaidAmount: 35, paidAmount: 35, isPaid: false,
    });
  });

  it('reverses only the exact automatic amount and leaves manual settlements intact', () => {
    const debt = expense({
      id: 10,
      splits: [{
        splitId: 'alex-dinner', contactName: 'Alex', amount: 100,
        paidAmount: 55, manualPaidAmount: 20, repaymentPaidAmount: 35,
      }],
    });
    const payment = expense({
      id: 11, amount: 35, transactionType: 'credit',
      splits: [{
        contactName: 'Alex', amount: 35, owedByMe: true, isPaid: true,
        repaymentAllocations: [{ expenseId: 10, splitId: 'alex-dinner', amount: 35 }],
      }],
    });
    const updates = planRepaymentReversal(payment, [debt, payment]);
    expect(updates[0].splits[0]).toMatchObject({
      amount: 100, manualPaidAmount: 20, repaymentPaidAmount: 0,
      paidAmount: 20, isPaid: false,
    });
  });

  it('refuses to reverse a legacy repayment with summary-only split data', () => {
    const payment = expense({
      transactionType: 'credit',
      splits: [{ contactName: 'Alex', amount: 30, owedByMe: true, isPaid: true }],
    });
    expect(() => planRepaymentReversal(payment, [payment])).toThrow(/no exact allocation history/i);
  });

  it('rejects removing a split that still has paid value', () => {
    const debt = expense({ splits: [{ contactName: 'Alex', amount: 50, paidAmount: 10 }] });
    expect(() => validateDebtSplitMutation(debt, undefined)).toThrow(/cannot remove Alex's split/i);
  });
});

describe('repayment transaction use cases', () => {
  it('atomically reverses known allocations when deleting a repayment', () => {
    const ledger = linkedLedger();
    const state = repository(ledger);
    deleteTransaction(state.repo, 11);
    expect(state.getMutation()).toEqual({ id: 11, kind: 'delete' });
    expect(state.getUpdates()[0].splits[0]).toMatchObject({ paidAmount: 0, repaymentPaidAmount: 0 });
  });

  it('blocks legacy repayment deletion without attempting any writes', () => {
    const oldPayment = expense({
      id: 12,
      transactionType: 'credit',
      splits: [{ contactName: 'Alex', amount: 25, owedByMe: true, isPaid: true }],
    });
    const state = repository([oldPayment]);
    expect(() => deleteTransaction(state.repo, 12)).toThrow(/no exact allocation history/i);
    expect(state.getMutation()).toBeUndefined();
  });

  it('reverses and replans an edited repayment atomically', () => {
    const ledger = linkedLedger();
    const state = repository(ledger);
    const updates = updateTransactionWithRepaymentRules(state.repo, 11, {
      merchant: 'Repayment from Alex', category: 'Other', amount: 20,
      transactionType: 'credit', splits: undefined,
    });
    expect(updates[0].splits[0]).toMatchObject({ paidAmount: 20, repaymentPaidAmount: 20 });
    expect(state.getMutation()).toMatchObject({ kind: 'update', amount: 20 });
  });

  it('reverses a repayment on invalidation and replans it on restore', () => {
    const ledger = linkedLedger();
    const state = repository(ledger);
    const reversed = invalidateTransactionWithRepaymentRules(state.repo, 11, true);
    expect(reversed[0].splits[0]).toMatchObject({ paidAmount: 0, repaymentPaidAmount: 0 });
    expect(state.getMutation()).toMatchObject({ kind: 'invalidate', isInvalid: true });

    ledger[0].splits = reversed[0].splits;
    ledger[1].isInvalid = true;
    const restored = invalidateTransactionWithRepaymentRules(state.repo, 11, false);
    expect(restored[0].splits[0]).toMatchObject({ paidAmount: 35, repaymentPaidAmount: 35 });
    expect(state.getMutation()).toMatchObject({ kind: 'invalidate', isInvalid: false });
  });
});
