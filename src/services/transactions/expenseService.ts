import { confirmReviewedTransaction } from './transactionApplication';
import {
  TransactionCandidate,
  TransactionProcessingOutcome,
} from '../../core/transactions/contracts';
import { SplitSettlementUpdate } from '../../core/transactions/repaymentPlanner';
export type { ProcessedExpense } from './transactionDecisionService';
export { processTransaction } from './transactionDecisionService';

export type SaveExpenseResult =
  | (Extract<TransactionProcessingOutcome, { status: 'saved' }> & {
      repaymentUpdates: SplitSettlementUpdate[];
    })
  | Extract<TransactionProcessingOutcome, { status: 'duplicate' }>
  | Extract<TransactionProcessingOutcome, { status: 'failed' }>;

/**
 * Persist an accepted transaction. For credits with repayment allocations,
 * insert the credit and update all affected debts in one SQLite transaction.
 */
export function saveExpense(expense: TransactionCandidate): SaveExpenseResult {
  return confirmReviewedTransaction(expense) as SaveExpenseResult;
}
