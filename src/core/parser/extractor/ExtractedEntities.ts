import { ExtendedPaymentMode, ExtendedTransactionType } from '../models';

export interface ExtractedAmount {
  value: number;
  currency: string;
  confidence: number;
  rawMatched: string;
}

export interface ExtractedAccount {
  accountNumber: string;
  accountType: 'account' | 'card' | 'wallet' | 'unknown';
  confidence: number;
}

export interface ExtractedVpa {
  vpa: string;
  username: string;
  handle: string;
  isPhoneNumber: boolean;
}

export interface ExtractedEntities {
  amount: ExtractedAmount | null;
  rawMerchant: string | null;
  account: ExtractedAccount | null;
  vpa: ExtractedVpa | null;
  referenceNumber: string | null;
  availableBalance: number | null;
  bank: string | null;
  paymentMode: ExtendedPaymentMode;
  transactionSignal: ExtendedTransactionType;
  timestamp: number;
  rawMessage: string;
}
