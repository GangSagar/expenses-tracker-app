import { Expense } from '../../types/expense';
import {
  createDedupCache, deleteExpense, getExpensesWithSplits, getRecentExpenses,
  insertExpense, insertExpenseWithRepayment, invalidateExpense,
  isDuplicateWithCache, updateExpense,
} from '../../database/expenseRepo';
import { isDuplicate } from '../../core/dedup';
import {
  deleteTransaction, importTransactions, invalidateTransaction,
  persistAcceptedTransaction, TransactionWriteGateway, updateTransaction,
} from '../../core/transactions/applicationUseCases';
import { TransactionCandidate } from '../../core/transactions/contracts';
import { IncomingMessage, processIncomingMessage } from '../messaging/messageService';
import { processTransaction } from './transactionDecisionService';
import { orchestrateTransaction } from './transactionOrchestrator';
import { defaultLearningEngine } from '../../core/parser/learning';
import { setMerchantMapping } from '../../core/classifier/merchantMap';

const gateway: TransactionWriteGateway = {
  getLedgerWithSplits: getExpensesWithSplits,
  insert: insertExpense,
  insertWithRepayment: insertExpenseWithRepayment,
  update: updateExpense,
  invalidate: invalidateExpense,
  delete: deleteExpense,
};

function learnCorrection(alias: string, merchant: string, category: Expense['category']) {
  try {
    setMerchantMapping(alias, category, merchant);
    defaultLearningEngine.learn(alias, merchant, category);
  } catch (error) {
    // Learning is a follow-up side effect; it must not hide a successful write.
    console.error('Transaction saved, but merchant/category learning failed:', error);
  }
}

export { createDedupCache, isDuplicateWithCache };

export async function ingestLiveMessage(message: IncomingMessage) {
  const { processedExpense } = await orchestrateTransaction(message);
  const { candidate, decision } = processedExpense;
  if (decision.kind !== 'auto_save' || !candidate) {
    return { candidate, decision, persistence: null };
  }
  const recent = getRecentExpenses(5);
  const persistence = persistAcceptedTransaction(candidate, gateway, () => isDuplicate(candidate, recent));
  return { candidate, decision, persistence };
}

export async function previewHistoricalMessage(
  message: IncomingMessage,
  cache: ReturnType<typeof createDedupCache>,
) {
  const analysis = await processIncomingMessage(message);
  if (analysis.parsed && message.timestamp !== undefined) {
    analysis.parsed.timestamp = message.timestamp;
  }
  const processed = processTransaction(analysis);
  const candidate = processed.candidate;
  const duplicate = !!candidate && isDuplicateWithCache(
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
  const cache = createDedupCache();
  const isImportDuplicate = (candidate: TransactionCandidate) => isDuplicateWithCache(
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
  return importTransactions(candidates, gateway, isImportDuplicate, onProgress, rememberImported);
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
  return persistAcceptedTransaction(expense, gateway);
}

export function confirmReviewedTransaction(
  expense: TransactionCandidate,
  previousCategory?: Expense['category'],
) {
  const recent = getRecentExpenses(5);
  const result = persistAcceptedTransaction(expense, gateway, () => isDuplicate(expense, recent));
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
  ...args: Parameters<typeof updateExpense>
) {
  updateTransaction(gateway, args);
  const [, merchant, category] = args;
  const effectiveAlias = alias || merchant;
  if (effectiveAlias && effectiveAlias !== 'Unknown' && existing && (
    existing.alias !== alias || existing.merchant !== merchant || existing.category !== category
  )) {
    learnCorrection(effectiveAlias, merchant, category);
  }
}

export function invalidateTransactionUseCase(id: number, invalid: boolean) {
  return invalidateTransaction(gateway, id, invalid);
}

export function deleteTransactionUseCase(id: number) {
  return deleteTransaction(gateway, id);
}

