import { configManager } from '../config';

/**
 * Normalizes banking action verbs into canonical keywords:
 * Debited, Spent, Paid, Purchase, Deducted, Dr. -> DEBIT
 * Credited, Received, Added, Cr. -> CREDIT
 * Refund, Cashback -> REFUND
 * Reversed, Reversal -> REVERSAL
 * Failed, Declined -> FAILED
 */
export function normalizeKeywords(text: string): string {
  if (!text) return '';

  const dict = configManager.getTokenDictionary();
  let result = text;

  // Debit keywords normalization
  for (const kw of dict.debitKeywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    result = result.replace(regex, 'DEBIT');
  }

  // Credit keywords normalization
  for (const kw of dict.creditKeywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    result = result.replace(regex, 'CREDIT');
  }

  // Refund keywords normalization
  for (const kw of dict.refundKeywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    result = result.replace(regex, 'REFUND');
  }

  // Reversal keywords normalization
  for (const kw of dict.reversalKeywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    result = result.replace(regex, 'REVERSAL');
  }

  // Failed keywords normalization
  for (const kw of dict.failedKeywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    result = result.replace(regex, 'FAILED');
  }

  return result;
}
