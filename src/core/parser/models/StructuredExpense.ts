import { Category, PaymentMode, TransactionSource, TransactionType, Expense, ParsedTransaction } from '../../../types/expense';
import { AIExtractionProposal, FieldEvidence, ProposalField } from '../ai/AIExtractionProposal';

export type ExtendedTransactionType =
  | 'debit'
  | 'credit'
  | 'refund'
  | 'reversal'
  | 'failed'
  | 'pending'
  | 'chargeback';

export type ExtendedPaymentMode =
  | 'upi'
  | 'cc'
  | 'dc'
  | 'wallet'
  | 'netbanking'
  | 'atm'
  | 'cash'
  | 'unknown';

export interface ConfidenceBreakdown {
  amount: number;
  transactionType: number;
  merchant: number;
  category: number;
  account: number;
  overall: number;
}

export interface StructuredExpense {
  id?: number | string;
  amount: number;
  currency: string;
  merchant: string;
  normalizedMerchant: string;
  transactionType: ExtendedTransactionType;
  paymentMode: ExtendedPaymentMode;
  account?: string | null;
  bank?: string;
  category: Category;
  timestamp: number;
  referenceNumber?: string | null;
  availableBalance?: number | null;
  confidence: number;
  confidenceBreakdown: ConfidenceBreakdown;
  requiresConfirmation: boolean;
  source: TransactionSource;
  rawMessage: string;
  parserVersion: string;
  /** Ephemeral inference evidence for the decision boundary; never persisted. */
  aiProposal?: AIExtractionProposal;
  fieldEvidence?: Partial<Record<ProposalField, FieldEvidence<unknown>>>;
}

export function toBaseTransactionType(type: ExtendedTransactionType): TransactionType {
  if (type === 'credit' || type === 'refund' || type === 'reversal' || type === 'chargeback') {
    return 'credit';
  }
  return 'debit';
}

export function toBasePaymentMode(mode: ExtendedPaymentMode): PaymentMode {
  if (mode === 'upi' || mode === 'cc' || mode === 'wallet' || mode === 'cash') {
    return mode;
  }
  if (mode === 'dc') {
    return 'cc';
  }
  return 'unknown';
}

/**
 * Converts a StructuredExpense into the existing ParsedTransaction format,
 * ensuring 100% backwards compatibility with all services and UI screens.
 */
export function toParsedTransaction(expense: StructuredExpense): ParsedTransaction {
  const baseType = toBaseTransactionType(expense.transactionType);
  const baseMode = toBasePaymentMode(expense.paymentMode);
  const rawOrNorm = expense.merchant || expense.normalizedMerchant;

  return {
    amount: expense.amount,
    merchant: rawOrNorm || null,
    alias: expense.merchant || null,
    transactionType: baseType,
    paymentMode: baseMode,
    account: expense.account || null,
    bank: expense.bank,
    rawMessage: expense.rawMessage,
    source: expense.source,
    timestamp: expense.timestamp,
    availableBalance: expense.availableBalance ?? undefined,
    referenceId: expense.referenceNumber ?? undefined,
  };
}

/**
 * Converts a StructuredExpense into the storage-ready Expense model.
 */
export function toExpenseModel(expense: StructuredExpense): Expense {
  const baseType = toBaseTransactionType(expense.transactionType);
  const baseMode = toBasePaymentMode(expense.paymentMode);

  return {
    amount: expense.amount,
    merchant: expense.normalizedMerchant || expense.merchant,
    alias: expense.merchant,
    category: expense.category,
    confidence: expense.confidence,
    timestamp: expense.timestamp,
    source: expense.source,
    rawMessage: expense.rawMessage,
    transactionType: baseType,
    account: expense.account || undefined,
    bank: expense.bank,
    paymentMode: baseMode,
    availableBalance: expense.availableBalance ?? undefined,
    referenceId: expense.referenceNumber ?? undefined,
    isInvalid: expense.requiresConfirmation ? false : undefined,
  };
}
