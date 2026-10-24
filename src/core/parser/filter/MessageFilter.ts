import { configManager } from '../config';

export interface FilterResult {
  isTransaction: boolean;
  dropReason?: 'otp' | 'login' | 'pure_balance' | 'promotional' | 'invalid_sender' | 'malformed';
}

export class MessageFilter {
  private static readonly OTP_PATTERNS: RegExp[] = [
    /\b(?:otp|one\s*time\s*password|verification\s*code|security\s*code)\b/i,
    /\b(?:do\s*not\s*share|is\s*your\s*secret\s*otp|valid\s*for\s*\d+\s*mins?)\b/i,
  ];

  private static readonly LOGIN_PATTERNS: RegExp[] = [
    /\b(?:logged\s*in|login\s*(?:alert|attempt|to)?|password\s*changed|sign-?in|registered\s*for\s*netbanking)\b/i,
  ];

  private static readonly PROMOTIONAL_PATTERNS: RegExp[] = [
    /\bcongratulations!?\s+you\s+have\s+won\b/i,
    /\bpre-?approved\s+(?:personal\s+)?loan\b/i,
    /\bapply\s+now\s+for\b/i,
    /\bdiscount\s+coupon\b/i,
    /\blimited\s+period\s+offer\b/i,
  ];

  public filter(rawMessage: string, sender: string = ''): FilterResult {
    if (!rawMessage || typeof rawMessage !== 'string' || rawMessage.trim().length === 0) {
      return { isTransaction: false, dropReason: 'malformed' };
    }

    const text = rawMessage.trim();

    // 1. Check for OTP messages
    for (const pattern of MessageFilter.OTP_PATTERNS) {
      if (pattern.test(text)) {
        return { isTransaction: false, dropReason: 'otp' };
      }
    }

    // 2. Check for Login alerts
    for (const pattern of MessageFilter.LOGIN_PATTERNS) {
      if (pattern.test(text)) {
        return { isTransaction: false, dropReason: 'login' };
      }
    }

    // 3. Check for Promotional messages
    for (const pattern of MessageFilter.PROMOTIONAL_PATTERNS) {
      if (pattern.test(text)) {
        return { isTransaction: false, dropReason: 'promotional' };
      }
    }

    // 4. Check for pure balance enquiry messages (contains balance, but NO debit or credit action)
    const hasBalance = /\b(?:available\s+balance|avl\s+bal|avl\s+limit|balance\s+in\s+a\/c)\b/i.test(text);
    const hasDebit = /\b(?:debited?|spent|paid|purchase|withdrawn|deducted|transfer(?:red)?|trf|dr\.?|due|sent)\b/i.test(text);
    const hasCredit = /\b(?:credited?|received|refund(?:ed)?|reversed?|deposited|added|cashback|cr\.?)\b/i.test(text);

    if (hasBalance && !hasDebit && !hasCredit) {
      return { isTransaction: false, dropReason: 'pure_balance' };
    }

    // Must have at least a debit or credit signal to qualify as transaction
    if (!hasDebit && !hasCredit) {
      return { isTransaction: false, dropReason: 'promotional' };
    }

    return { isTransaction: true };
  }

  public isTransactionalSender(sender: string): boolean {
    if (!sender) return false;
    const s = sender.trim();

    // 10-digit phone numbers are personal messages
    if (/^\d{10}$/.test(s)) {
      return false;
    }

    // Shortcodes (e.g. 567676)
    if (/^\d{3,9}$/.test(s)) {
      return true;
    }

    // App package name for notifications
    if (s.includes('.')) {
      return true;
    }

    // Standard Indian transactional SMS header format (e.g. VM-HDFCBK, AX-ICICIB, JX-BOBSMS)
    if (/^[A-Z]{2}-[A-Z0-9-]+$/i.test(s)) {
      return true;
    }

    // Check known bank sender keywords
    const upperSender = s.toUpperCase();
    const bankRules = configManager.getBankRules();
    for (const rule of bankRules) {
      for (const kw of rule.senderKeywords) {
        if (upperSender.includes(kw.toUpperCase())) {
          return true;
        }
      }
    }

    return false;
  }
}

export const defaultMessageFilter = new MessageFilter();
