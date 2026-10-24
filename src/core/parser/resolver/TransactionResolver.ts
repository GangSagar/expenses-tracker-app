import { Token } from '../tokenizer';
import { NormalizedMessage } from '../normalizer';
import { ExtendedTransactionType } from '../models';

export interface ResolvedTransactionType {
  type: ExtendedTransactionType;
  confidence: number;
}

export interface ITransactionResolver {
  resolve(tokens: Token[], message: NormalizedMessage, extractedSignal: ExtendedTransactionType): ResolvedTransactionType;
}

export class TransactionResolver implements ITransactionResolver {
  public resolve(
    tokens: Token[],
    message: NormalizedMessage,
    extractedSignal: ExtendedTransactionType
  ): ResolvedTransactionType {
    const text = message.clean.toUpperCase();

    // 1. Check for Failed / Declined transactions first
    if (/\b(?:FAILED|DECLINED|UNSUCCESSFUL|REJECTED)\b/.test(text)) {
      return { type: 'failed', confidence: 0.99 };
    }

    // 2. Check for Reversal
    if (/\b(?:REVERSED|REVERSAL|BOUNCED|RETURNED)\b/.test(text)) {
      return { type: 'reversal', confidence: 0.98 };
    }

    // 3. Check for Refund / Cashback
    if (/\b(?:REFUND|REFUNDED|CASHBACK)\b/.test(text)) {
      return { type: 'refund', confidence: 0.98 };
    }

    // 4. Check for Chargeback / Dispute
    if (/\b(?:CHARGEBACK|DISPUTED?)\b/.test(text)) {
      return { type: 'chargeback', confidence: 0.95 };
    }

    // 5. Check for Pending / Processing
    if (/\b(?:PENDING|IN PROCESS|AUTHORIZED|ON HOLD)\b/.test(text)) {
      return { type: 'pending', confidence: 0.90 };
    }

    // 6. Dual-action sentences (e.g. "Dr. from A/C XXXXXX9132 and Cr. to payee@upi" or "is debited Rs.1.00 and credited to ...")
    // When money is debited from user account and credited to payee, user transaction is DEBIT
    if (/\b(?:dr\.?|debited?)\b.*?\band\s+(?:cr\.?|credited?)\s+(?:to|towards)\b/i.test(text) ||
        /\b(?:dr\.?|debited?)\b.*?\bcredited\s+to\b/i.test(text)) {
      return { type: 'debit', confidence: 0.99 };
    }

    if (/\b(?:DR\.?|DEBITED?|SPENT|PAID)\s+FROM\b/i.test(text) ||
        /\b(?:A\/C|ACC|ACCOUNT)(?:\s*NO\.?)?\s*[*xX\d]+\s+IS\s+DEBITED\b/i.test(text) ||
        /\b(?:A\/C|ACC|ACCOUNT)(?:\s*NO\.?)?\s*[*xX\d]+\s+DEBITED\b/i.test(text) ||
        /\bDEBITED\s+(?:A\/C|ACC|ACCOUNT)\b/i.test(text) ||
        /\bDEBITED\s+BY\b/i.test(text) ||
        /\bDEBITED\s+WITH\b/i.test(text) ||
        /\bDR\.\s+FROM\b/i.test(text) ||
        /\bSPENT\s+(?:ON|AT|USING)\b/i.test(text) ||
        /\bPAID\s+(?:TO|VIA)\b/i.test(text) ||
        /\bIS\s+DUE\b/i.test(text)) {
      return { type: 'debit', confidence: 0.99 };
    }

    if (/\b(?:CR\.?|CREDITED?|DEPOSITED?)\s+(?:TO|INTO)\s+(?:YOUR\s+)?(?:A\/C|ACC|ACCOUNT)\b/i.test(text) ||
        /\b(?:A\/C|ACC|ACCOUNT)\s+[A-Z0-9*X]+\s+IS\s+CREDITED\b/i.test(text) ||
        /\b(?:A\/C|ACC|ACCOUNT)\s+[A-Z0-9*X]+\s+CREDITED\b/i.test(text) ||
        /\bCREDITED\s+TO\s+YOUR\s+A\/C\b/i.test(text) ||
        /\bCREDITED\s+WITH\b/i.test(text) ||
        /\bCREDITED\s+FOR\b/i.test(text) ||
        /\bRECEIVED\s+(?:ON|INTO|IN)\s+YOUR\b/i.test(text) ||
        /\bPAYMENT\s+OF\s+[A-Z0-9.,\s]+HAS\s+BEEN\s+RECEIVED\b/i.test(text)) {
      return { type: 'credit', confidence: 0.99 };
    }

    // 7. Fallback to token keyword inspection
    let hasDebitToken = false;
    let hasCreditToken = false;

    for (const t of tokens) {
      if (t.type === 'KEYWORD') {
        if (t.normalizedValue === 'DEBIT') hasDebitToken = true;
        if (t.normalizedValue === 'CREDIT') hasCreditToken = true;
      }
    }

    if (hasDebitToken && !hasCreditToken) {
      return { type: 'debit', confidence: 0.95 };
    }
    if (hasCreditToken && !hasDebitToken) {
      return { type: 'credit', confidence: 0.95 };
    }

    // Default to the initial signal
    return { type: extractedSignal || 'debit', confidence: 0.85 };
  }
}

export const defaultTransactionResolver = new TransactionResolver();
