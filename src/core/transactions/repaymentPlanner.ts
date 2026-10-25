import { Expense, ExpenseSplit } from '../../types/expense';

export interface SplitSettlementUpdate {
  expenseId: number;
  splits: ExpenseSplit[];
}

export interface AutomaticRepaymentPlan {
  contactName: string;
  /** Total amount allocated across full and partial split repayments. */
  settledAmount: number;
  updates: SplitSettlementUpdate[];
}

type IncomingExpense = Omit<Expense, 'id'> & { id?: number };

/**
 * Build an oldest-first repayment plan without mutating input expenses.
 * A payment can partially settle the final split row it reaches.
 */
export function planAutomaticRepayment(
  incoming: IncomingExpense,
  expenses: Expense[],
): AutomaticRepaymentPlan | null {
  if (
    incoming.transactionType !== 'credit' ||
    incoming.isInvalid ||
    !Number.isFinite(incoming.amount) ||
    incoming.amount <= 0
  ) {
    return null;
  }

  const pendingByContact = new Map<
    string,
    Array<{ expense: Expense; splitIndex: number; split: ExpenseSplit }>
  >();

  for (const expense of expenses) {
    if (!expense.id || expense.isInvalid || !expense.splits) continue;

    for (let splitIndex = 0; splitIndex < expense.splits.length; splitIndex++) {
      const split = expense.splits[splitIndex];
      const contactName = split.contactName.trim();
      if (!contactName || split.isPaid || split.owedByMe) continue;
      if (remainingSplitAmount(split) <= 0) continue;

      const pending = pendingByContact.get(contactName) || [];
      pending.push({ expense, splitIndex, split });
      pendingByContact.set(contactName, pending);
    }
  }

  const texts = [incoming.merchant, incoming.alias, incoming.rawMessage]
    .filter((text): text is string => Boolean(text))
    .map(text => text.toLowerCase());

  let matchedContact: string | undefined;
  let matchedSplits:
    | Array<{ expense: Expense; splitIndex: number; split: ExpenseSplit }>
    | undefined;

  for (const [contactName, pending] of pendingByContact) {
    const escapedName = contactName
      .toLowerCase()
      .replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const contactPattern = new RegExp(`\\b${escapedName}\\b`, 'i');
    if (texts.some(text => contactPattern.test(text))) {
      matchedContact = contactName;
      matchedSplits = pending;
      break;
    }
  }

  if (!matchedContact || !matchedSplits) return null;

  matchedSplits.sort((left, right) => left.expense.timestamp - right.expense.timestamp);

  let remaining = incoming.amount;
  let settledAmount = 0;
  const updatedByExpense = new Map<number, ExpenseSplit[]>();

  for (const item of matchedSplits) {
    const outstanding = remainingSplitAmount(item.split);
    if (outstanding <= 0) continue;
    const appliedAmount = Math.min(remaining, outstanding);

    const expenseId = item.expense.id;
    if (expenseId === undefined) continue;

    const updatedSplits = updatedByExpense.get(expenseId) ||
      item.expense.splits!.map(split => ({ ...split }));
    const paidAmount = Math.min(
      Number(item.split.amount),
      (Number(item.split.paidAmount) || 0) + appliedAmount,
    );
    updatedSplits[item.splitIndex] = {
      ...updatedSplits[item.splitIndex],
      paidAmount,
      isPaid: paidAmount >= Number(item.split.amount) - 0.000001,
    };
    updatedByExpense.set(expenseId, updatedSplits);

    remaining = Math.max(0, remaining - appliedAmount);
    settledAmount += appliedAmount;
    if (remaining <= 0.000001) break;
  }

  if (settledAmount <= 0) return null;

  return {
    contactName: matchedContact,
    settledAmount,
    updates: Array.from(updatedByExpense, ([expenseId, splits]) => ({
      expenseId,
      splits,
    })),
  };
}

export function repaymentSplit(plan: AutomaticRepaymentPlan): ExpenseSplit {
  return {
    contactName: plan.contactName,
    amount: plan.settledAmount,
    isPaid: true,
    owedByMe: true,
  };
}

export function remainingSplitAmount(split: ExpenseSplit): number {
  const amount = Number(split.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (split.isPaid) return 0;
  const rawPaidAmount = Number(split.paidAmount) || 0;
  const paidAmount = Math.min(amount, Math.max(0, rawPaidAmount));
  return Math.max(0, amount - paidAmount);
}
