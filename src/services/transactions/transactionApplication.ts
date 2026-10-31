import { Expense, ExpenseSplit } from '../../types/expense';
import { addDedupCandidate, createDedupCache, findDuplicate } from '../../core/dedup';
import type { DedupCandidate, DedupCache } from '../../core/dedup/duplicateCheck';
import {
  deleteTransaction, importTransactions, invalidateTransactionWithRepaymentRules,
  persistAcceptedTransaction, settleSplits, updateTransactionWithRepaymentRules,
} from '../../core/transactions/applicationUseCases';
import { TransactionCandidate } from '../../core/transactions/contracts';
import { IncomingMessage, processIncomingMessage } from '../messaging/messageService';
import { processTransaction } from './transactionDecisionService';
import { orchestrateTransaction } from './transactionOrchestrator';
import { setMerchantMapping } from '../../core/classifier/merchantMap';
import { defaultTagLearningEngine } from '../../core/tags';
import { learningEngine, transactionStorage } from '../../app/composition';
import { notifyTransactionSaved } from '../notifications/transactionSavedNotification';
import { ParseExecutionContext } from '../../core/parser/ai/AIExtractionProposal';

function learnCorrection(alias: string, merchant: string, category: Expense['category']) {
  try {
    setMerchantMapping(alias, category, merchant);
    learningEngine.learn(alias, merchant, category);
  } catch (error) {
    // Learning is a follow-up side effect; it must not hide a successful write.
    console.error('Transaction saved, but merchant/category learning failed:', error);
  }
}

export const createTransactionDedupCache = () =>
  createDedupCache(transactionStorage.getAllDedupRecords());

function duplicateLookup(candidate: DedupCandidate) {
  return findDuplicate(candidate, transactionStorage.getDedupCandidates(candidate));
}

function persistAndNotify(
  candidate: TransactionCandidate,
  match: () => ReturnType<typeof findDuplicate> | boolean,
  allowPossibleDuplicate = false,
) {
  const result = persistAcceptedTransaction(candidate, transactionStorage, match, allowPossibleDuplicate);
  if (result.status === 'saved') notifySavedBestEffort(result.transaction);
  return result;
}

function notifySavedBestEffort(transaction: TransactionCandidate): void {
  try {
    notifyTransactionSaved(transaction);
  } catch (error) {
    console.warn('Transaction saved, but its notification could not be queued:', error);
  }
}

export async function ingestLiveMessage(message: IncomingMessage) {
  const { processedExpense } = await orchestrateTransaction(message);
  const { candidate, decision } = processedExpense;
  if (decision.kind !== 'auto_save' || !candidate) {
    return { candidate, decision, persistence: null };
  }
  const persistence = persistAndNotify(candidate, () => duplicateLookup(candidate));
  return { candidate, decision, persistence };
}

export async function previewHistoricalMessage(
  message: IncomingMessage,
  cache: DedupCache,
) {
  const analysis = await processIncomingMessage(message, 'historical_import' satisfies ParseExecutionContext);
  if (analysis.parsed && message.timestamp !== undefined) {
    analysis.parsed.timestamp = message.timestamp;
  }
  const processed = processTransaction(analysis);
  const candidate = processed.candidate;
  const duplicateMatch = candidate ? findDuplicate(candidate, cache) : null;
  const duplicate = duplicateMatch?.kind === 'definite';
  if (candidate && !duplicate) {
    addDedupCandidate(cache, candidate);
  }
  return {
    ...processed,
    duplicate,
    possibleDuplicate: duplicateMatch?.kind === 'possible',
    duplicateMatch,
  };
}

export function importHistoricalTransactions(
  candidates: TransactionCandidate[],
  onProgress?: Parameters<typeof importTransactions>[3],
) {
  const cache = createTransactionDedupCache();
  const findImportMatch = (candidate: TransactionCandidate) => findDuplicate(candidate, cache);
  const rememberImported = (candidate: TransactionCandidate) => {
    addDedupCandidate(cache, candidate);
    notifySavedBestEffort(candidate);
  };
  return importTransactions(candidates, transactionStorage, findImportMatch, onProgress, rememberImported);
}

export function createManualTransaction(expense: Omit<Expense, 'id'>) {
  if (!Number.isFinite(expense.amount) || expense.amount <= 0) {
    return {
      status: 'failed' as const,
      stage: 'processing' as const,
      message: 'Amount must be a positive number.',
    };
  }
  if (!expense.merchant.trim()) {
    return {
      status: 'failed' as const,
      stage: 'processing' as const,
      message: 'Merchant or description is required.',
    };
  }
  // Enforce location immutability: manual transactions cannot set or fake map location
  const candidate: Omit<Expense, 'id'> = {
    ...expense,
    location: undefined,
  };
  return persistAndNotify(candidate, () => null);
}

export function confirmReviewedTransaction(
  expense: TransactionCandidate,
  previousCategory?: Expense['category'],
) {
  const result = persistAndNotify(expense, () => duplicateLookup(expense), true);
  if (result.status === 'saved' && previousCategory !== undefined && previousCategory !== expense.category) {
    const alias = expense.alias || expense.merchant;
    if (alias && alias !== 'Unknown') {
      learnCorrection(alias, expense.merchant, expense.category);
    }
  }
  return result;
}

export function updateTransactionUseCase(
  existing: Expense | undefined,
  alias: string | undefined,
  id: number,
  merchant: string,
  category: Expense['category'],
  bank?: string,
  paymentMode?: Expense['paymentMode'],
  amount?: number,
  splits?: Expense['splits'],
  transactionType?: Expense['transactionType'],
  tags?: string[],
  notes?: string,
  billImageUri?: string,
) {
  const persisted = transactionStorage.findById(id) || existing;
  const updates = updateTransactionWithRepaymentRules(transactionStorage, id, {
    merchant,
    category,
    bank,
    paymentMode,
    amount: amount ?? persisted?.amount ?? 0,
    splits: splits as ExpenseSplit[] | undefined,
    transactionType: transactionType || persisted?.transactionType || 'debit',
    tags: tags ?? persisted?.tags,
    notes: notes ?? persisted?.notes,
    billImageUri: billImageUri ?? persisted?.billImageUri,
  });
  const updatedTransaction = transactionStorage.findById(id);
  if (updatedTransaction) notifySavedBestEffort(updatedTransaction);
  const effectiveAlias = alias || merchant;
  if (effectiveAlias && effectiveAlias !== 'Unknown' && persisted && (
    persisted.alias !== alias || persisted.merchant !== merchant || persisted.category !== category
  )) {
    learnCorrection(effectiveAlias, merchant, category);
  }
  if (tags && tags.length > 0) {
    try {
      defaultTagLearningEngine.learn(
        {
          entity: merchant,
          category,
          paymentMode,
          tokens: merchant.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(t => t.length > 1),
        },
        tags,
      );
    } catch {
      // Dynamic tag learning is best effort
    }
  }
  return updates;
}

export function invalidateTransactionUseCase(id: number, invalid: boolean) {
  return invalidateTransactionWithRepaymentRules(transactionStorage, id, invalid);
}

export function deleteTransactionUseCase(id: number) {
  return deleteTransaction(transactionStorage, id);
}

export const queryAllTransactions = (limit?: number, offset?: number) =>
  transactionStorage.getAllExpenses(limit, offset);
export const queryWindowedTransactions = (days?: number) =>
  transactionStorage.getWindowedExpenses(days);
export const exportTransactionSnapshot = () => transactionStorage.exportAllExpenses();
export function restoreTransactionSnapshot(expenses: Expense[], overwrite: boolean): void {
  if (!Array.isArray(expenses)) {
    throw new Error('Backup data must contain a transaction array.');
  }
  const snapshotIds = new Set<number>();
  expenses.forEach((expense, index) => {
    if (!expense || typeof expense !== 'object') {
      throw new Error(`Backup transaction ${index + 1} is not an object.`);
    }
    if (!Number.isFinite(expense.amount) || expense.amount <= 0) {
      throw new Error(`Backup transaction ${index + 1} has an invalid amount.`);
    }
    if (typeof expense.merchant !== 'string' || !expense.merchant.trim()) {
      throw new Error(`Backup transaction ${index + 1} is missing a merchant or description.`);
    }
    if (!Number.isFinite(expense.timestamp) || typeof expense.category !== 'string') {
      throw new Error(`Backup transaction ${index + 1} is missing required transaction data.`);
    }
    if (expense.id !== undefined) {
      if (!Number.isInteger(expense.id) || expense.id <= 0 || snapshotIds.has(expense.id)) {
        throw new Error(`Backup transaction ${index + 1} has an invalid or repeated ID.`);
      }
      snapshotIds.add(expense.id);
    }
    if (expense.splits && (!Array.isArray(expense.splits) || expense.splits.some(split => {
      if (!split || typeof split !== 'object') return true;
      if (typeof split.contactName !== 'string' || !Number.isFinite(split.amount)) return true;
      if (split.splitId !== undefined && (typeof split.splitId !== 'string' || !split.splitId)) return true;
      if (split.paidAmount !== undefined && !Number.isFinite(split.paidAmount)) return true;
      if (split.manualPaidAmount !== undefined && !Number.isFinite(split.manualPaidAmount)) return true;
      if (split.repaymentPaidAmount !== undefined && !Number.isFinite(split.repaymentPaidAmount)) return true;
      if (split.repaymentAllocations !== undefined && (!Array.isArray(split.repaymentAllocations) ||
        split.repaymentAllocations.some(allocation =>
          !allocation || typeof allocation !== 'object' ||
          !Number.isInteger(allocation.expenseId) || allocation.expenseId <= 0 ||
          typeof allocation.splitId !== 'string' || !allocation.splitId ||
          !Number.isFinite(allocation.amount) || allocation.amount <= 0,
        ))) return true;
      return false;
    }))) {
      throw new Error(`Backup transaction ${index + 1} has invalid split or repayment allocation data.`);
    }
  });
  const expensesById = new Map(expenses.filter(expense => expense.id !== undefined)
    .map(expense => [expense.id!, expense]));
  expenses.forEach((expense, index) => {
    for (const split of expense.splits || []) {
      for (const allocation of split.repaymentAllocations || []) {
        const allocatedExpense = expensesById.get(allocation.expenseId);
        if (!snapshotIds.has(allocation.expenseId) || !allocatedExpense?.splits?.some(
          allocatedSplit => allocatedSplit.splitId === allocation.splitId,
        )) {
          throw new Error(`Backup transaction ${index + 1} contains a repayment allocation to a transaction outside the snapshot.`);
        }
      }
    }
  });
  transactionStorage.restoreSnapshot(expenses, overwrite);
}
export const clearTransactionData = () => transactionStorage.clearAll();
export const settleSplitContact = (contactName: string, action: 'settle' | 'unsettle') =>
  settleSplits(transactionStorage, contactName, action);
export const toggleSplitSettlement = (expenseId: number, contactName: string) =>
  settleSplits(transactionStorage, contactName, 'toggle', expenseId);
export const updateTrashReasonUseCase = (id: number, reason: string | null) =>
  transactionStorage.updateTrashReason(id, reason);
export const runTransactionDeduplication = () => transactionStorage.deduplicate();
export const deleteAccountTransactions = (bank: string, account: string) =>
  transactionStorage.deleteForAccount(bank, account);

