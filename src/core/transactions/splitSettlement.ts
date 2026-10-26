import { Expense, ExpenseSplit } from '../../types/expense';
import { SplitSettlementUpdate } from './repaymentPlanner';

export type ManualSplitAction = 'settle' | 'unsettle' | 'toggle';

let splitIdSequence = 0;

export function ensureSplitIds(splits?: ExpenseSplit[]): ExpenseSplit[] | undefined {
  if (!splits) return undefined;
  return splits.map(split => ({
    ...split,
    splitId: split.splitId || `split-${Date.now()}-${splitIdSequence++}`,
  }));
}

export function getManualSplitUpdates(
  expenses: Expense[],
  contactName: string,
  action: ManualSplitAction,
  expenseId?: number,
): SplitSettlementUpdate[] {
  const updates: SplitSettlementUpdate[] = [];
  const normalizedContact = contactName.trim().toLocaleLowerCase();

  for (const expense of expenses) {
    if (expense.id === undefined || (expenseId !== undefined && expense.id !== expenseId)) continue;
    if (!expense.splits?.some(split => split.contactName.trim().toLocaleLowerCase() === normalizedContact)) continue;

    const splits = expense.splits.map(split => {
      if (split.contactName.trim().toLocaleLowerCase() !== normalizedContact) return split;
      const amount = Number(split.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(`Cannot settle ${contactName}'s split because its amount is invalid.`);
      }
      const state = getSplitPaymentState(split);
      const currentlyPaid = state.manualPaidAmount + state.repaymentPaidAmount >= amount - 0.000001;
      const shouldSettle = action === 'settle' || (action === 'toggle' && !currentlyPaid);
      const manualPaidAmount = shouldSettle
        ? Math.max(0, amount - state.repaymentPaidAmount)
        : 0;
      return {
        ...split,
        splitId: split.splitId || legacySplitId(expense.id!, expense.splits!.indexOf(split)),
        manualPaidAmount,
        repaymentPaidAmount: state.repaymentPaidAmount,
        paidAmount: Math.min(amount, manualPaidAmount + state.repaymentPaidAmount),
        isPaid: manualPaidAmount + state.repaymentPaidAmount >= amount - 0.000001,
      };
    });
    updates.push({ expenseId: expense.id, splits });
  }
  return updates;
}

export function getSplitPaymentState(split: ExpenseSplit): {
  manualPaidAmount: number;
  repaymentPaidAmount: number;
} {
  const amount = Number(split.amount) || 0;
  const repaymentPaidAmount = clamp(Number(split.repaymentPaidAmount) || 0, amount);
  const legacyFullyPaid = split.isPaid && split.manualPaidAmount === undefined &&
    split.repaymentPaidAmount === undefined &&
    (split.paidAmount === undefined || Number(split.paidAmount) <= 0);
  const legacyPaidAmount = legacyFullyPaid
    ? amount
    : Number(split.paidAmount) || 0;
  const manualPaidAmount = split.manualPaidAmount !== undefined
    ? clamp(Number(split.manualPaidAmount) || 0, amount)
    : clamp(legacyPaidAmount - repaymentPaidAmount, amount);
  return { manualPaidAmount, repaymentPaidAmount };
}

/** Reverse an exact payment history. Legacy summary-only repayments are deliberately rejected. */
export function planRepaymentReversal(payment: Expense, ledger: Expense[]): SplitSettlementUpdate[] {
  if (!isRepaymentCredit(payment)) return [];
  if (!hasExactRepaymentHistory(payment)) {
    throw new Error(
      'This older repayment has no exact allocation history. Its linked splits were left unchanged; reconcile it before editing, restoring, or deleting it.',
    );
  }
  if (payment.isInvalid) return [];

  const updates = new Map<number, ExpenseSplit[]>();
  for (const repayment of payment.splits || []) {
    for (const allocation of repayment.repaymentAllocations || []) {
      const debt = ledger.find(expense => expense.id === allocation.expenseId);
      const debtSplit = debt?.splits?.find(split => split.splitId === allocation.splitId);
      if (!debt || !debtSplit || debt.id === undefined) {
        throw new Error('A repayment allocation points to a missing split. Reconcile the ledger before changing this payment.');
      }
      const currentSplits = updates.get(debt.id) || debt.splits!.map(split => ({ ...split }));
      const index = currentSplits.findIndex(split => split.splitId === allocation.splitId);
      if (index < 0) {
        throw new Error('A repayment allocation points to a missing split. Reconcile the ledger before changing this payment.');
      }
      const current = currentSplits[index];
      const state = getSplitPaymentState(current);
      if (state.repaymentPaidAmount + 0.000001 < allocation.amount) {
        throw new Error('Repayment allocation totals do not match the split balance. Reconcile the ledger before changing this payment.');
      }
      const repaymentPaidAmount = Math.max(0, state.repaymentPaidAmount - allocation.amount);
      const manualPaidAmount = state.manualPaidAmount;
      currentSplits[index] = {
        ...current,
        manualPaidAmount,
        repaymentPaidAmount,
        paidAmount: Math.min(Number(current.amount), manualPaidAmount + repaymentPaidAmount),
        isPaid: manualPaidAmount + repaymentPaidAmount >= Number(current.amount) - 0.000001,
      };
      updates.set(debt.id, currentSplits);
    }
  }
  return Array.from(updates, ([expenseId, splits]) => ({ expenseId, splits }));
}

export function isRepaymentCredit(expense: Expense): boolean {
  return expense.transactionType === 'credit' && !!expense.splits?.some(split => split.owedByMe);
}

export function hasExactRepaymentHistory(expense: Expense): boolean {
  const repaymentSplits = expense.splits?.filter(split => split.owedByMe) || [];
  return repaymentSplits.length > 0 && repaymentSplits.every(split => Array.isArray(split.repaymentAllocations));
}

export function validateDebtSplitMutation(existing: Expense, nextSplits?: ExpenseSplit[]): void {
  for (const split of nextSplits || []) {
    if (!split.contactName.trim() || !Number.isFinite(Number(split.amount)) || Number(split.amount) <= 0) {
      throw new Error('Split contacts must have a name and a positive amount.');
    }
  }
  for (const oldSplit of existing.splits || []) {
    const state = getSplitPaymentState(oldSplit);
    const paid = state.manualPaidAmount + state.repaymentPaidAmount;
    if (paid <= 0) continue;
    const next = nextSplits?.find(split => split.splitId === oldSplit.splitId) ||
      nextSplits?.find(split => split.contactName.trim().toLocaleLowerCase() === oldSplit.contactName.trim().toLocaleLowerCase());
    if (!next) {
      throw new Error(`Cannot remove ${oldSplit.contactName}'s split while ₹${paid.toFixed(2)} is marked paid. Unsettle or reconcile it first.`);
    }
    if (next.contactName.trim().toLocaleLowerCase() !== oldSplit.contactName.trim().toLocaleLowerCase()) {
      throw new Error(`Cannot reassign ${oldSplit.contactName}'s settled split. Unsettle or reconcile it first.`);
    }
    if (Number(next.amount) + 0.000001 < paid) {
      throw new Error(`The updated split amount for ${oldSplit.contactName} cannot be less than its ₹${paid.toFixed(2)} already paid.`);
    }
  }
}

export function applySplitUpdates(expenses: Expense[], updates: SplitSettlementUpdate[]): Expense[] {
  const byId = new Map(updates.map(update => [update.expenseId, update.splits]));
  return expenses.map(expense => {
    if (expense.id === undefined) return expense;
    const splits = byId.get(expense.id);
    return splits ? { ...expense, splits } : expense;
  });
}

function legacySplitId(expenseId: number, index: number): string {
  return `legacy-${expenseId}-${index}`;
}

function clamp(value: number, maximum: number): number {
  return Math.min(maximum, Math.max(0, value));
}
