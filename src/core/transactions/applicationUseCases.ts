import { Expense } from '../../types/expense';
import { TransactionCandidate } from './contracts';
import {
  planAutomaticRepayment,
  repaymentSplit,
  SplitSettlementUpdate,
} from './repaymentPlanner';

export interface TransactionWriteGateway {
  getLedgerWithSplits(): Expense[];
  insert(expense: Omit<Expense, 'id'>): number;
  insertWithRepayment(
    expense: Omit<Expense, 'id'>,
    updates: SplitSettlementUpdate[],
  ): number;
  update(
    id: number, merchant: string, category: Expense['category'], bank?: string,
    paymentMode?: string, amount?: number, splits?: Expense['splits'],
    transactionType?: Expense['transactionType'],
  ): void;
  invalidate(id: number, invalid: boolean): void;
  delete(id: number): void;
}

export type PersistenceResult =
  | { status: 'saved'; transaction: Expense & { id: number }; repaymentUpdates: SplitSettlementUpdate[] }
  | { status: 'duplicate' }
  | { status: 'failed'; stage: 'processing' | 'persistence'; message: string };

/** Shared accepted-transaction write path. Deduplication is injected per source. */
export function persistAcceptedTransaction(
  candidate: TransactionCandidate,
  gateway: TransactionWriteGateway,
  isDuplicate: () => boolean = () => false,
): PersistenceResult {
  try {
    if (isDuplicate()) return { status: 'duplicate' };
    const plan = candidate.transactionType === 'credit'
      ? planAutomaticRepayment(candidate, gateway.getLedgerWithSplits())
      : null;
    const transaction = plan ? { ...candidate, splits: [repaymentSplit(plan)] } : candidate;
    const id = plan
      ? gateway.insertWithRepayment(transaction, plan.updates)
      : gateway.insert(transaction);
    return {
      status: 'saved',
      transaction: { ...transaction, id },
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
  gateway: TransactionWriteGateway,
  isDuplicate: (candidate: TransactionCandidate) => boolean,
  onProgress?: (result: ImportRowResult, completed: number, total: number) => void,
  onImported?: (candidate: TransactionCandidate) => void,
): Promise<ImportRowResult[]> {
  const ordered = candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => a.candidate.timestamp - b.candidate.timestamp || a.index - b.index);
  const results: ImportRowResult[] = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const { candidate } = ordered[index];
    const result = persistAcceptedTransaction(candidate, gateway, () => isDuplicate(candidate));
    const row: ImportRowResult = result.status === 'saved'
      ? { status: 'imported', candidate }
      : result.status === 'duplicate'
        ? { status: 'duplicate', candidate }
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

export function updateTransaction(
  gateway: TransactionWriteGateway,
  input: Parameters<TransactionWriteGateway['update']>,
): void { gateway.update(...input); }

export function invalidateTransaction(
  gateway: TransactionWriteGateway, id: number, invalid: boolean,
): void { gateway.invalidate(id, invalid); }

export function deleteTransaction(gateway: TransactionWriteGateway, id: number): void {
  gateway.delete(id);
}
