export type TransactionType = 'debit' | 'credit';
export type TransactionSource = 'sms' | 'notification' | 'manual';
import { CATEGORIES, PAYMENT_MODES } from '../constants/appOptions';

export type PaymentMode = typeof PAYMENT_MODES[number];

export type Category = typeof CATEGORIES[number];

export interface ExpenseSplit {
  contactName: string;
  amount: number;
  isPaid?: boolean;
  owedByMe?: boolean;
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
}
