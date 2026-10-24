import { ExtendedPaymentMode } from '../models';
import { NormalizedMessage } from '../normalizer';

export class PaymentModeExtractor {
  public extract(message: NormalizedMessage): ExtendedPaymentMode {
    const text = message.clean;

    if (/\b(?:wallet|paytm\s+wallet|amazon\s+pay\s+balance|phonepe\s+wallet)\b/i.test(text)) {
      return 'wallet';
    }

    if (/\b(?:upi|vpa|@\w+|upi\/cr|upi\/dr)\b/i.test(text)) {
      return 'upi';
    }

    if (/\b(?:credit\s*card|\bcc\b|credit\s*limit|avl\s*limit|\blimit\b)\b/i.test(text)) {
      return 'cc';
    }

    if (/\b(?:debit\s*card|atm\s*withdrawal|atm\s*cash)\b/i.test(text)) {
      return 'dc';
    }

    if (/\b(?:neft|imps|rtgs|net\s*banking|inft|billdesk)\b/i.test(text)) {
      return 'netbanking';
    }

    return 'unknown';
  }
}

export const paymentModeExtractor = new PaymentModeExtractor();
