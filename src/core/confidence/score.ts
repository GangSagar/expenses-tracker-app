import { ParsedTransaction } from '../../types/expense';
import { ClassificationResult } from '../classifier/classify';
import { DEBIT_REGEX, CREDIT_REGEX } from '../parser/regexRules';

export interface ConfidenceFactors {
  amountDetected: boolean;
  merchantExtracted: boolean;
  knownMerchant: boolean;
  paymentModeIdentified: boolean;
  accountFound: boolean;
  multipleAmounts: boolean;
  ambiguousMerchant: boolean;
  messageTooShort: boolean;
}

export function calculateConfidence(
  parsed: ParsedTransaction,
  classification: ClassificationResult,
): number {
  if (parsed.amount === null) {
    return 0;
  }
  let score = 0;

  // Positive factors
  if (parsed.amount !== null) {
    score += 0.35;
  }
  if (parsed.merchant !== null) {
    score += 0.2;
  }
  if (
    classification.matchedVia === 'merchant_map' ||
    classification.matchedVia === 'keyword'
  ) {
    score += 0.2;
  }
  if (parsed.paymentMode !== 'unknown') {
    score += 0.1;
  }
  if (parsed.account !== null) {
    score += 0.1;
  }
  // Strong signal: an explicit debit or credit keyword is present
  if (DEBIT_REGEX.test(parsed.rawMessage) || CREDIT_REGEX.test(parsed.rawMessage)) {
    score += 0.1;
  }

  // Penalties
  const amountMatches = parsed.rawMessage.match(
    /(?:Rs\.?|INR|₹)\s*\d+(?:[,]\d+)*(?:\.\d{1,2})?/gi,
  );
  // Reduced penalty: most bank UPI SMSes include the available balance as a second amount
  if (amountMatches && amountMatches.length > 1) {
    score -= 0.1;
  }

  if (parsed.merchant && parsed.merchant.length < 3) {
    score -= 0.15;
  }

  if (parsed.rawMessage.length < 20) {
    score -= 0.1;
  }

  // Floor: if a debit or credit keyword was found AND we have an amount,
  // never discard — show the popup instead
  const hasActionKeyword =
    DEBIT_REGEX.test(parsed.rawMessage) || CREDIT_REGEX.test(parsed.rawMessage);
  if (parsed.amount !== null && hasActionKeyword) {
    score = Math.max(score, 0.5);
  }

  return Math.max(0, Math.min(1, score));
}
