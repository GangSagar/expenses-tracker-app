import { Expense } from '../../types/expense';
import { isDuplicate } from '../../core/dedup';
import {
  deleteTransaction, importTransactions, invalidateTransaction,
  persistAcceptedTransaction, updateTransaction,
} from '../../core/transactions/applicationUseCases';
import { TransactionCandidate } from '../../core/transactions/contracts';
import { IncomingMessage, processIncomingMessage } from '../messaging/messageService';
import { processTransaction } from './transactionDecisionService';
import { orchestrateTransaction } from './transactionOrchestrator';
import { defaultLearningEngine } from '../../core/parser/learning';
import { setMerchantMapping } from '../../core/classifier/merchantMap';
import { transactionStorage } from './transactionDependencies';

function learnCorrection(alias: string, merchant: string, category: Expense['category']) {
  try {
    setMerchantMapping(alias, category, merchant);
    defaultLearningEngine.learn(alias, merchant, category);
  } catch (error) {
    // Learning is a follow-up side effect; it must not hide a successful write.
    console.error('Transaction saved, but merchant/category learning failed:', error);
  }
}

export const createDedupCache = () => transactionStorage.createDedupCache();
export const isDuplicateWithCache = transactionStorage.isDuplicateWithCache.bind(transactionStorage);

export async function ingestLiveMessage(message: IncomingMessage) {
  const { processedExpense } = await orchestrateTransaction(message);
  const { candidate, decision } = processedExpense;
  if (decision.kind !== 'auto_save' || !candidate) {
    return { candidate, decision, persistence: null };
  }
  const recent = transactionStorage.getRecentExpenses(5);
  const persistence = persistAcceptedTransaction(candidate, transactionStorage, () => isDuplicate(candidate, recent));
  return { candidate, decision, persistence };
}

export async function previewHistoricalMessage(
  message: IncomingMessage,
  cache: ReturnType<typeof transactionStorage.createDedupCache>,
) {
  const analysis = await processIncomingMessage(message);
  if (analysis.parsed && message.timestamp !== undefined) {
    analysis.parsed.timestamp = message.timestamp;
  }
  const processed = processTransaction(analysis);
  const candidate = processed.candidate;
  const duplicate = !!candidate && transactionStorage.isDuplicateWithCache(
    cache, candidate.amount, candidate.timestamp,
    candidate.referenceId || undefined, candidate.rawMessage || undefined,
  );
  if (candidate && !duplicate) {
    if (candidate.referenceId) cache.refIds.add(candidate.referenceId.trim());
    if (candidate.rawMessage) cache.rawMessages.add(candidate.rawMessage.trim());
    cache.temporalIndex.push({ amount: candidate.amount, timestamp: candidate.timestamp });
  }
  return { ...processed, duplicate };
}

export function importHistoricalTransactions(
  candidates: TransactionCandidate[],
  onProgress?: Parameters<typeof importTransactions>[3],
) {
  const cache = transactionStorage.createDedupCache();
  const isImportDuplicate = (candidate: TransactionCandidate) => transactionStorage.isDuplicateWithCache(
      cache, candidate.amount, candidate.timestamp,
      candidate.referenceId || undefined, candidate.rawMessage || undefined,
    );
  const rememberImported = (candidate: TransactionCandidate) => {
    // Earlier successful rows in this batch participate in the import strategy.
    const refId = candidate.referenceId?.trim();
    const rawMessage = candidate.rawMessage?.trim();
    if (refId) cache.refIds.add(refId);
    if (rawMessage) cache.rawMessages.add(rawMessage);
    cache.temporalIndex.push({ amount: candidate.amount, timestamp: candidate.timestamp });
  };
  return importTransactions(candidates, transactionStorage, isImportDuplicate, onProgress, rememberImported);
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
  return persistAcceptedTransaction(expense, transactionStorage);
}

export function confirmReviewedTransaction(
  expense: TransactionCandidate,
  previousCategory?: Expense['category'],
) {
  const recent = transactionStorage.getRecentExpenses(5);
  const result = persistAcceptedTransaction(expense, transactionStorage, () => isDuplicate(expense, recent));
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
  ...args: Parameters<typeof transactionStorage.update>
) {
  updateTransaction(transactionStorage, args);
  const [, merchant, category] = args;
  const effectiveAlias = alias || merchant;
  if (effectiveAlias && effectiveAlias !== 'Unknown' && existing && (
    existing.alias !== alias || existing.merchant !== merchant || existing.category !== category
  )) {
    learnCorrection(effectiveAlias, merchant, category);
  }
}

export function invalidateTransactionUseCase(id: number, invalid: boolean) {
  return invalidateTransaction(transactionStorage, id, invalid);
}

export function deleteTransactionUseCase(id: number) {
  return deleteTransaction(transactionStorage, id);
}

export const queryAllTransactions = (limit?: number, offset?: number) =>
  transactionStorage.getAllExpenses(limit, offset);
export const queryWindowedTransactions = (days?: number) =>
  transactionStorage.getWindowedExpenses(days);
export const querySplitLedger = () => transactionStorage.getExpensesWithSplits();
export const exportTransactionSnapshot = () => transactionStorage.exportAllExpenses();
export function restoreTransactionSnapshot(expenses: Expense[], overwrite: boolean): void {
  if (!Array.isArray(expenses)) {
    throw new Error('Backup data must contain a transaction array.');
  }
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
    if (expense.splits && (!Array.isArray(expense.splits) || expense.splits.some(split =>
      typeof split.contactName !== 'string' || !Number.isFinite(split.amount) ||
      (split.paidAmount !== undefined && !Number.isFinite(split.paidAmount)),
    ))) {
      throw new Error(`Backup transaction ${index + 1} has invalid split data.`);
    }
  });
  transactionStorage.restoreSnapshot(expenses, overwrite);
}
export const clearTransactionData = () => transactionStorage.clearAll();
export const persistSplitUpdates = (updates: Parameters<typeof transactionStorage.updateSplitExpensesAtomically>[0]) =>
  transactionStorage.updateSplitExpensesAtomically(updates);
export const updateTrashReasonUseCase = (id: number, reason: string | null) =>
  transactionStorage.updateTrashReason(id, reason);
export const runTransactionDeduplication = () => transactionStorage.deduplicate();
export const deleteAccountTransactions = (bank: string, account: string) =>
  transactionStorage.deleteForAccount(bank, account);

