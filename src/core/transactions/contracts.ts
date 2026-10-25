import { Category, Expense } from '../../types/expense';
import { SplitSettlementUpdate } from './repaymentPlanner';

/** A storage-ready transaction that has not yet been accepted by the ledger. */
export type TransactionCandidate = Omit<Expense, 'id'>;

export type PersistedTransaction = Expense & { id: number };

export type TransactionRejectionReason =
  | 'non_transactional_sender'
  | 'blocked_message'
  | 'spam'
  | 'missing_amount'
  | 'low_confidence';

export type TransactionReviewReason =
  | 'parser_requires_confirmation'
  | 'medium_confidence';

export type TransactionAutoSaveReason = 'high_confidence';

export interface ParserDecisionEvidence {
  confidence: number;
  requiresConfirmation: boolean;
  parserVersion: string;
  confidenceBreakdown: {
    amount: number;
    transactionType: number;
    merchant: number;
    category: number;
    account: number;
    overall: number;
  };
}

export interface ClassifierDecisionEvidence {
  category: Category;
  matchedVia: 'merchant_map' | 'keyword' | 'default';
  /** Legacy classifier score retained as the compatibility decision signal. */
  confidence: number;
}

export interface DecisionEvidenceSummary {
  policyVersion: string;
  parserVersion?: string;
  parserConfidence?: number;
  parserRequiresConfirmation?: boolean;
  parserConfidenceBreakdown?: ParserDecisionEvidence['confidenceBreakdown'];
  classifierConfidence?: number;
  classifierMatchedVia?: ClassifierDecisionEvidence['matchedVia'];
}

/**
 * Policy input. A missing candidate is valid only when a typed rejection
 * signal explains why parsing/validation could not produce one.
 */
export interface TransactionDecisionInput {
  candidate: TransactionCandidate | null;
  parser: ParserDecisionEvidence | null;
  classifier: ClassifierDecisionEvidence | null;
  rejectionSignals: TransactionRejectionReason[];
}

/** Business decision only. Duplicate checks and persistence happen afterward. */
export type TransactionDecision =
  | {
      kind: 'reject';
      reason: TransactionRejectionReason;
      evidence: DecisionEvidenceSummary;
    }
  | {
      kind: 'review';
      reason: TransactionReviewReason;
      candidate: TransactionCandidate;
      evidence: DecisionEvidenceSummary;
    }
  | {
      kind: 'auto_save';
      reason: TransactionAutoSaveReason;
      candidate: TransactionCandidate;
      evidence: DecisionEvidenceSummary;
    };

/** Processing results are deliberately separate from the decision result. */
export type TransactionProcessingOutcome =
  | { status: 'duplicate'; existingTransactionId?: number }
  | { status: 'saved'; transaction: PersistedTransaction }
  | { status: 'failed'; stage: 'processing' | 'persistence'; message?: string };

export interface TransactionDedupCache {
  refIds: Set<string>;
  rawMessages: Set<string>;
  temporalIndex: Array<{ amount: number; timestamp: number }>;
}

/** Transaction operations required by application use cases. */
export interface TransactionRepository {
  insert(candidate: TransactionCandidate): PersistedTransaction;
  insertWithRepayment(
    candidate: TransactionCandidate,
    updates: SplitSettlementUpdate[],
  ): PersistedTransaction;
  update(
    id: number,
    merchant: string,
    category: Category,
    bank?: string,
    paymentMode?: string,
    amount?: number,
    splits?: Expense['splits'],
    transactionType?: Expense['transactionType'],
  ): void;
  findById(id: number): PersistedTransaction | null;
  getRecentExpenses(minutes?: number): Expense[];
  getExpensesWithSplits(): Expense[];
  invalidate(id: number, isInvalid: boolean): void;
  delete(id: number): void;
  updateSplitExpensesAtomically(updates: SplitSettlementUpdate[]): void;
}

/** Read operations used by presentation adapters and reporting. */
export interface ExpenseQueryRepository {
  getAllExpenses(limit?: number, offset?: number): Expense[];
  getWindowedExpenses(days?: number): Expense[];
  getExpensesByCategory(category: Category): Expense[];
  getMonthlyTotal(year: number, month: number): number;
  exportAllExpenses(): Expense[];
}

/** Backup payloads are snapshots, not new parsed transactions. */
export interface TransactionBackupRepository {
  restoreSnapshot(expenses: Expense[], overwrite: boolean): void;
  clearAll(): void;
}

/** Maintenance and legacy presentation metadata operations. */
export interface TransactionMaintenanceRepository {
  updateTrashReason(id: number, reason: string | null): void;
  deduplicate(): number;
  deleteForAccount(bank: string, account: string): void;
  createDedupCache(): TransactionDedupCache;
  isDuplicateWithCache(
    cache: TransactionDedupCache,
    amount: number,
    timestamp: number,
    referenceId?: string,
    rawMessage?: string,
  ): boolean;
}

/** Full storage capability injected by the composition module. */
export type TransactionStorage = TransactionRepository
  & ExpenseQueryRepository
  & TransactionBackupRepository
  & TransactionMaintenanceRepository;
