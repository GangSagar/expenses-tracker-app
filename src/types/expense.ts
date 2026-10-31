export type TransactionType = 'debit' | 'credit';
export type TransactionSource = 'sms' | 'notification' | 'manual';
import { CATEGORIES, PAYMENT_MODES } from '../constants/appOptions';

export type PaymentMode = typeof PAYMENT_MODES[number];

export type Category = typeof CATEGORIES[number];

export const DEFAULT_TAGS = ['School', 'Work', 'Family', 'Friends', 'Personal'] as const;
export type DefaultTag = typeof DEFAULT_TAGS[number];

export interface TransactionLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  address?: string;
  timestamp?: number;
}

export interface CategorySuggestion {
  category: Category;
  confidence: number;
  evidence?: string[];
}

export interface RepaymentAllocation {
  expenseId: number;
  splitId: string;
  amount: number;
}

export interface ExpenseSplit {
  /** Stable identity used to tie repayment allocation history to this split. */
  splitId?: string;
  contactName: string;
  /** Original amount owed; kept unchanged when repayments are applied. */
  amount: number;
  /** Amount repaid so far. Missing values on older records mean zero. */
  paidAmount?: number;
  isPaid?: boolean;
  owedByMe?: boolean;
  /** Amount explicitly settled through the split controls, separate from repayments. */
  manualPaidAmount?: number;
  /** Total paid by active, exactly-linked repayment transactions. */
  repaymentPaidAmount?: number;
  /** Present on repayment transactions; points to the exact debt splits paid. */
  repaymentAllocations?: RepaymentAllocation[];
}

export interface Expense {
  id?: number;
  amount: number;
  merchant: string;
  alias?: string;
  category: Category;
  confidence: number;
  timestamp: number;
  source: TransactionSource;
  rawMessage: string;
  transactionType: TransactionType;
  account?: string;
  bank?: string;
  paymentMode?: PaymentMode;
  isDuplicate?: boolean;
  availableBalance?: number;
  splits?: ExpenseSplit[];
  referenceId?: string;
  transactionId?: string;
  tags?: string[];
  notes?: string;
  billImageUri?: string;
  location?: TransactionLocation;
  suggestedCategories?: CategorySuggestion[];
  isInvalid?: boolean;
  trashReason?: 'spam' | 'false' | 'duplicate' | 'other';
}

export interface ParsedTransaction {
  amount: number | null;
  merchant: string | null;
  alias: string | null;
  transactionType: TransactionType;
  paymentMode: PaymentMode;
  account: string | null;
  bank?: string;
  rawMessage: string;
  source: TransactionSource;
  timestamp: number;
  availableBalance?: number;
  referenceId?: string | null;
}
