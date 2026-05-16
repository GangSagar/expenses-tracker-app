import {
  OTP_REGEX,
  PROMO_REGEX,
  BALANCE_REGEX,
  LOGIN_REGEX,
  DEBIT_REGEX,
  CREDIT_REGEX,
} from './regexRules';

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

  // Promotional/transactional DLT prefixes that are NOT financial
  if (/^(?:TD|TA|JD|BD|SD|AD)-/i.test(sender)) {
    return false;
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
  // Only block promo messages if they don't also contain a debit/credit keyword.
  // Some bank SMSes mention cashback alongside a real transaction.
  if (PROMO_REGEX.test(message) && !DEBIT_REGEX.test(message) && !CREDIT_REGEX.test(message)) {
    return false;
  }
  // Only block pure balance-inquiry messages (no debit/credit action in the message)
  if (BALANCE_REGEX.test(message) && !DEBIT_REGEX.test(message) && !CREDIT_REGEX.test(message)) {
    return false;
  }
  return true;
}
