import {
  PersistedTransaction,
  TransactionCandidate,
  TransactionMutation,
  TransactionRepository,
} from './contracts';
import { Expense, ExpenseSplit } from '../../types/expense';
import { DedupMatch } from '../dedup/duplicateCheck';
import {
  planAutomaticRepayment,
  repaymentSplit,
  SplitSettlementUpdate,
} from './repaymentPlanner';
import {
  applySplitUpdates,
  ensureSplitIds,
  getManualSplitUpdates,
  hasExactRepaymentHistory,
  isRepaymentCredit,
  planRepaymentReversal,
  getSplitPaymentState,
  validateDebtSplitMutation,
} from './splitSettlement';

export type PersistenceResult =
  | { status: 'saved'; transaction: PersistedTransaction; repaymentUpdates: SplitSettlementUpdate[] }
  | { status: 'duplicate'; match?: DedupMatch }
  | { status: 'possible_duplicate'; match: DedupMatch }
  | { status: 'failed'; stage: 'processing' | 'persistence'; message: string };

export type DuplicateLookupResult = DedupMatch | boolean | null;

/** Shared accepted-transaction write path. Deduplication is injected per source. */
export function persistAcceptedTransaction(
  candidate: TransactionCandidate,
  repository: TransactionRepository,
  findMatch: () => DuplicateLookupResult = () => null,
  allowPossibleDuplicate = false,
): PersistenceResult {
  try {
    const match = findMatch();
    if (match === true) return { status: 'duplicate' };
    if (match && typeof match === 'object' && match.kind === 'definite') {
      return { status: 'duplicate', match };
    }
    if (match && typeof match === 'object' && match.kind === 'possible' && !allowPossibleDuplicate) {
      return { status: 'possible_duplicate', match };
    }
    const normalizedCandidate = { ...candidate, splits: ensureSplitIds(candidate.splits) };
    const plan = normalizedCandidate.transactionType === 'credit'
      ? planAutomaticRepayment(normalizedCandidate, repository.getExpensesWithSplits())
      : null;
    const transaction = plan ? { ...normalizedCandidate, splits: [repaymentSplit(plan)] } : normalizedCandidate;
    const persisted = plan
      ? repository.insertWithRepayment(transaction, plan.updates)
      : repository.insert(transaction);
    return {
      status: 'saved',
      transaction: persisted,
      repaymentUpdates: plan?.updates || [],
    };
  } catch (error) {
    return {
      status: 'failed', stage: 'persistence',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export type ImportRowResult =
  | { status: 'imported'; candidate: TransactionCandidate }
  | { status: 'duplicate'; candidate: TransactionCandidate }
  | { status: 'failed'; candidate: TransactionCandidate; message: string };

/** Import one row at a time in stable chronological order; prior successes persist. */
export async function importTransactions(
  candidates: TransactionCandidate[],
  repository: TransactionRepository,
  findMatch: (candidate: TransactionCandidate) => DuplicateLookupResult,
  onProgress?: (result: ImportRowResult, completed: number, total: number) => void,
  onImported?: (candidate: TransactionCandidate) => void,
): Promise<ImportRowResult[]> {
  const ordered = candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => a.candidate.timestamp - b.candidate.timestamp || a.index - b.index);
  const results: ImportRowResult[] = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const { candidate } = ordered[index];
    // Selected rows are an explicit user confirmation for weak matches; exact
    // reference/message duplicates remain blocked by the shared policy.
    const result = persistAcceptedTransaction(candidate, repository, () => findMatch(candidate), true);
    const row: ImportRowResult = result.status === 'saved'
      ? { status: 'imported', candidate }
      : result.status === 'duplicate'
        ? { status: 'duplicate', candidate }
        : result.status === 'possible_duplicate'
          ? { status: 'failed', candidate, message: 'A possible duplicate still requires confirmation.' }
        : { status: 'failed', candidate, message: result.message };
    results.push(row);
    if (row.status === 'imported') onImported?.(candidate);
    onProgress?.(row, index + 1, ordered.length);
    // Yield periodically so the existing progress UI can paint during large imports.
    if ((index + 1) % 10 === 0 && index + 1 < ordered.length) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }
  return results;
}

export function settleSplits(
  repository: TransactionRepository,
  contactName: string,
  action: 'settle' | 'unsettle' | 'toggle',
  expenseId?: number,
): SplitSettlementUpdate[] {
  const updates = getManualSplitUpdates(repository.getExpensesWithSplits(), contactName, action, expenseId);
  repository.updateSplitExpensesAtomically(updates);
  return updates;
}

export interface TransactionEdit {
  merchant: string;
  category: Expense['category'];
  bank?: string;
  paymentMode?: Expense['paymentMode'];
  amount: number;
  splits?: ExpenseSplit[];
  transactionType: Expense['transactionType'];
}

export function updateTransactionWithRepaymentRules(
  repository: TransactionRepository,
  id: number,
  edit: TransactionEdit,
): SplitSettlementUpdate[] {
  const existing = requireTransaction(repository, id);
  if (!Number.isFinite(edit.amount) || edit.amount <= 0) {
    throw new Error('Amount must be a positive number.');
  }
  if (!edit.merchant.trim()) throw new Error('Merchant or description is required.');
  const mutation: TransactionMutation = { kind: 'update', ...edit };
  let updates: SplitSettlementUpdate[] = [];

  if (isRepaymentCredit(existing)) {
    assertExactRepaymentHistory(existing);
    const ledger = repository.getExpensesWithSplits();
    const reversed = planRepaymentReversal(existing, ledger);
    const afterReversal = applySplitUpdates(ledger, reversed);
    const candidate: TransactionCandidate = {
      ...existing,
      ...edit,
      splits: undefined,
      isInvalid: existing.isInvalid,
    };
    let nextSplits: ExpenseSplit[] | null = existing.isInvalid ? existing.splits || null : null;
    if (!existing.isInvalid && candidate.transactionType === 'credit') {
      const plan = planAutomaticRepayment(candidate, afterReversal);
      if (plan) nextSplits = [repaymentSplit(plan)];
      if (plan) updates = mergeUpdates(reversed, plan.updates);
      else updates = reversed;
    } else {
      updates = reversed;
    }
    repository.mutateWithSplitUpdates(id, { ...mutation, splits: nextSplits || undefined }, updates);
    return updates;
  }

  const nextSplits = ensureSplitIds(edit.splits);
  validateDebtSplitMutation(existing, nextSplits);
  const oldByContact = new Map((existing.splits || []).map(split => [split.contactName.trim().toLocaleLowerCase(), split]));
  const preservedSplits = nextSplits?.map(split => {
    const old = existing.splits?.find(item => item.splitId && item.splitId === split.splitId) ||
      oldByContact.get(split.contactName.trim().toLocaleLowerCase());
    const normalized = old?.splitId ? { ...split, splitId: old.splitId } : split;
    const paymentState = getSplitPaymentState(normalized);
    const paidAmount = Math.min(Number(normalized.amount), paymentState.manualPaidAmount + paymentState.repaymentPaidAmount);
    return {
      ...normalized,
      manualPaidAmount: paymentState.manualPaidAmount,
      repaymentPaidAmount: paymentState.repaymentPaidAmount,
      paidAmount,
      isPaid: paidAmount >= Number(normalized.amount) - 0.000001,
    };
  });
  repository.mutateWithSplitUpdates(id, { ...mutation, splits: preservedSplits }, updates);
  return updates;
}

export function invalidateTransactionWithRepaymentRules(
  repository: TransactionRepository,
  id: number,
  invalid: boolean,
): SplitSettlementUpdate[] {
  const existing = requireTransaction(repository, id);
  if (isRepaymentCredit(existing)) {
    assertExactRepaymentHistory(existing);
    if (existing.isInvalid === invalid) return [];
    if (invalid) {
      const ledger = repository.getExpensesWithSplits();
      const updates = planRepaymentReversal(existing, ledger);
      repository.mutateWithSplitUpdates(id, { kind: 'invalidate', isInvalid: true }, updates);
      return updates;
    }
    const ledger = repository.getExpensesWithSplits();
    const candidate: TransactionCandidate = { ...existing, isInvalid: false };
    const plan = planAutomaticRepayment(candidate, ledger);
    const splits = plan ? [repaymentSplit(plan)] : null;
    const updates = plan?.updates || [];
    repository.mutateWithSplitUpdates(id, { kind: 'invalidate', isInvalid: false, splits }, updates);
    return updates;
  }

  if (invalid && (existing.splits || []).some(split => {
    const state = getSplitPaymentState(split);
    return state.manualPaidAmount + state.repaymentPaidAmount > 0;
  })) {
    throw new Error('Cannot invalidate a settled split transaction. Unsettle or reconcile its payments first.');
  }
  repository.mutateWithSplitUpdates(id, { kind: 'invalidate', isInvalid: invalid }, []);
  return [];
}

export function deleteTransaction(repository: TransactionRepository, id: number): void {
  const existing = requireTransaction(repository, id);
  let updates: SplitSettlementUpdate[] = [];
  if (isRepaymentCredit(existing)) {
    assertExactRepaymentHistory(existing);
    const ledger = repository.getExpensesWithSplits();
    updates = planRepaymentReversal(existing, ledger);
  } else if ((existing.splits || []).some(split => {
    const state = getSplitPaymentState(split);
    return state.manualPaidAmount + state.repaymentPaidAmount > 0;
  })) {
    throw new Error('Cannot delete a settled split transaction. Unsettle or reconcile its payments first.');
  }
  repository.mutateWithSplitUpdates(id, { kind: 'delete' }, updates);
}

function requireTransaction(repository: TransactionRepository, id: number): Expense {
  const expense = repository.findById(id);
  if (!expense) throw new Error(`Transaction ${id} could not be found.`);
  return expense;
}

function assertExactRepaymentHistory(expense: Expense): void {
  if (!hasExactRepaymentHistory(expense)) {
    throw new Error(
      'This older repayment has no exact allocation history. Its linked splits were left unchanged; reconcile it before editing, restoring, or deleting it.',
    );
  }
}

function mergeUpdates(
  first: SplitSettlementUpdate[],
  second: SplitSettlementUpdate[],
): SplitSettlementUpdate[] {
  const byId = new Map(first.map(update => [update.expenseId, update]));
  for (const update of second) byId.set(update.expenseId, update);
  return Array.from(byId.values());
}
