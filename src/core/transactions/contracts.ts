import { Expense } from '../../types/expense';

/**
 * A transaction candidate has been parsed and normalized but has not yet been
 * accepted by the ledger. Parser-specific details stay outside this contract.
 */
export type TransactionCandidate = Omit<Expense, 'id'>;

export type PersistedTransaction = Expense & { id: number };

export type TransactionRejectionReason =
  | 'non_transactional_sender'
  | 'blocked_message'
  | 'spam'
  | 'missing_amount'
  | 'low_confidence';

export type TransactionProcessingOutcome =
  | {
      status: 'rejected';
      reason: TransactionRejectionReason;
    }
  | {
      status: 'duplicate';
      reason: 'reference_id' | 'raw_message' | 'amount_time_window';
      existingTransactionId?: number;
    }
  | {
      status: 'needs_review';
      candidate: TransactionCandidate;
      reason: string;
    }
  | {
      status: 'saved';
      transaction: PersistedTransaction;
    }
  | {
      status: 'failed';
      stage: 'processing' | 'persistence';
      message?: string;
    };

/**
 * Persistence port for transaction use cases. The SQLite adapter will
 * implement this boundary in a later phase; callers should not depend on SQL
 * or database row representations.
 */
export interface TransactionRepository {
  insert(candidate: TransactionCandidate): PersistedTransaction;
  update(transaction: PersistedTransaction): PersistedTransaction;
  findById(id: number): PersistedTransaction | null;
}
