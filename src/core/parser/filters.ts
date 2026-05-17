import {
  OTP_REGEX,
  LOGIN_REGEX,
  DEBIT_REGEX,
  CREDIT_REGEX,
} from './regexRules';
import { classifySMS } from '../classifier/bayesClassifier';

// Matches the standard Indian bank transactional SMS sender format: XX-XXXXXXX
// Allows alphanumeric suffixes and hyphens (e.g., VM-HDFCBK, AX-SBI123, BP-ICICIB, JM-BOIIND-S)
const TRANSACTIONAL_SENDER_REGEX = /^[A-Z]{2}-[A-Z0-9-]+$/i;

const IGNORED_SENDERS: Set<string> = new Set([
  'VM-JioBal',
  'AD-VILBAL',
  'JD-INFO',
]);

import { KNOWN_BANKS } from '../../constants/appOptions';

export function isTransactionalSender(sender: string): boolean {
  if (IGNORED_SENDERS.has(sender)) {
    return false;
  }
  // 10-digit numbers are personal/individual SMS — always reject
  if (/^\d{10}$/.test(sender)) {
    return false;
  }

  // Strong bypass: if it contains any known bank keywords (e.g. BOI, HDFC, SBI), accept it immediately!
  const upperSender = sender.toUpperCase();
  for (const bank of KNOWN_BANKS) {
    for (const keyword of bank.keywords) {
      if (upperSender.includes(keyword)) {
        return true;
      }
    }
  }

  // Accept any sender matching the XX-XXXXX bank format (with alphanumeric suffix)
  if (TRANSACTIONAL_SENDER_REGEX.test(sender)) {
    return true;
  }
  // For notification sources, sender will be a package name — always accept
  if (sender.includes('.')) {
    return true;
  }
  // Default: reject unknown formats
  return false;
}

export function isTransactionMessage(message: string): boolean {
  if (OTP_REGEX.test(message)) {
    return false;
  }
  if (LOGIN_REGEX.test(message)) {
    return false;
  }
  // A transaction message must explicitly contain a debit or credit keyword/signal.
  // This blocks general notifications, carrier plan warnings, data limits, etc.
  if (!DEBIT_REGEX.test(message) && !CREDIT_REGEX.test(message)) {
    return false;
  }

  // Bayesian probability validation to weed out smart marketing/spam
  const classification = classifySMS(message);
  if (!classification.isTransaction) {
    return false;
  }

  return true;
}
