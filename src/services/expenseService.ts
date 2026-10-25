import { classify } from '../core/classifier';
import { calculateConfidence } from '../core/confidence';
import { isDuplicate } from '../core/dedup';
import {
  getExpensesWithSplits,
  getRecentExpenses,
  insertExpense,
  insertExpenseWithRepayment,
} from '../database/expenseRepo';
import { IncomingTransactionAnalysis } from './messageService';
import { toExpenseModel, toParsedTransaction } from '../core/parser/models';
import {
  TransactionCandidate,
  TransactionDecision,
  TransactionDecisionInput,
  TransactionProcessingOutcome,
} from '../core/transactions/contracts';
import { decideTransaction } from '../core/transactions/decisionPolicy';
import {
  planAutomaticRepayment,
  repaymentSplit,
  SplitSettlementUpdate,
} from '../core/transactions/repaymentPlanner';

export interface ProcessedExpense {
  candidate: TransactionCandidate | null;
  decision: TransactionDecision;
  repaymentUpdates: SplitSettlementUpdate[];
}

export type SaveExpenseResult =
  | (Extract<TransactionProcessingOutcome, { status: 'saved' }> & {
      repaymentUpdates: SplitSettlementUpdate[];
    })
  | Extract<TransactionProcessingOutcome, { status: 'duplicate' }>
  | Extract<TransactionProcessingOutcome, { status: 'failed' }>;

export function processTransaction(
  analysis: IncomingTransactionAnalysis,
): ProcessedExpense {
  const parsed = analysis.parsed;
  if (!parsed) {
    const decision = decideTransaction({
      candidate: null,
      parser: null,
      classifier: null,
      rejectionSignals: analysis.rejectionSignals,
    });
    return { candidate: null, decision, repaymentUpdates: [] };
  }

  const legacyParsed = toParsedTransaction(parsed);
  const classification = classify(legacyParsed.alias, legacyParsed.rawMessage);
  const legacyConfidence = calculateConfidence(legacyParsed, classification);
  const candidate: TransactionCandidate = {
    ...toExpenseModel(parsed),
    category: classification.category,
    confidence: legacyConfidence,
    timestamp: analysis.message.timestamp ?? parsed.timestamp,
    rawMessage: analysis.normalizedBody,
  };
  const input: TransactionDecisionInput = {
    candidate,
    parser: {
      confidence: parsed.confidence,
      requiresConfirmation: parsed.requiresConfirmation,
      parserVersion: parsed.parserVersion,
      confidenceBreakdown: parsed.confidenceBreakdown,
    },
    classifier: {
      category: classification.category,
      matchedVia: classification.matchedVia,
      confidence: legacyConfidence,
    },
    rejectionSignals: analysis.rejectionSignals,
  };
  const decision = decideTransaction(input);
  return { candidate, decision, repaymentUpdates: [] };
}

/**
 * Persist an accepted transaction. For credits with repayment allocations,
 * insert the credit and update all affected debts in one SQLite transaction.
 */
export function saveExpense(expense: TransactionCandidate): SaveExpenseResult {
  try {
    const recent = getRecentExpenses(5);
    if (isDuplicate(expense, recent)) return { status: 'duplicate' };

    const plan = expense.transactionType === 'credit'
      ? planAutomaticRepayment(expense, getExpensesWithSplits())
      : null;
    const transactionCandidate = plan
      ? { ...expense, splits: [repaymentSplit(plan)] }
      : expense;
    const id = plan
      ? insertExpenseWithRepayment(transactionCandidate, plan.updates)
      : insertExpense(transactionCandidate);

    return {
      status: 'saved',
      transaction: { ...transactionCandidate, id },
      repaymentUpdates: plan?.updates || [],
    };
  } catch (error) {
    return {
      status: 'failed',
      stage: 'persistence',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
