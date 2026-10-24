import { Token, TokenType } from './Token';
import { NormalizedMessage } from '../normalizer';

export interface ITokenizer {
  tokenize(normalized: NormalizedMessage): Token[];
  toTokenString(tokens: Token[]): string;
}

export class Tokenizer implements ITokenizer {
  private static readonly VPA_REGEX = /^[A-Za-z0-9_.-]+@[A-Za-z0-9_-]+$/;
  private static readonly AMOUNT_REGEX = /^[0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?$/;
  private static readonly DATE_REGEX = /^(?:\d{1,2}[-/.]\w+[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})$/;
  private static readonly ACCOUNT_MASK_REGEX = /^(?:[xX*]{2,}\d{2,6}|[xX*]+\d+|\d{3,4})$/;
  private static readonly MODE_KEYWORDS = new Set(['UPI', 'NEFT', 'IMPS', 'RTGS', 'CARD', 'WALLET', 'ATM', 'NETBANKING']);
  private static readonly ACTION_KEYWORDS = new Set(['DEBIT', 'CREDIT', 'REFUND', 'REVERSAL', 'FAILED', 'PENDING', 'CHARGEBACK']);
  private static readonly BALANCE_KEYWORDS = new Set(['AVLBAL', 'AVL', 'AVAILABLE', 'CLR', 'LIMIT']);

  public tokenize(normalized: NormalizedMessage): Token[] {
    const text = normalized.canonical;
    const tokens: Token[] = [];
    if (!text) return tokens;

    // Split preserving punctuation boundaries
    const regex = /([₹$€£])|([A-Za-z0-9_.-]+@[A-Za-z0-9_-]+)|([A-Za-z0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?)|([A-Za-z0-9*X/]+)|([^\sA-Za-z0-9])/g;
    let match: RegExpExecArray | null;

    let prevWasCurrency = false;

    while ((match = regex.exec(text)) !== null) {
      const raw = match[0];
      const start = match.index;
      const end = start + raw.length;

      let type: TokenType = 'WORD';
      let normVal: string | number = raw;

      if (raw === '₹' || raw === '$' || raw === '€' || raw === '£') {
        type = 'CURRENCY';
        prevWasCurrency = true;
      } else if (Tokenizer.VPA_REGEX.test(raw)) {
        type = 'VPA';
        prevWasCurrency = false;
      } else if (Tokenizer.AMOUNT_REGEX.test(raw)) {
        if (prevWasCurrency) {
          type = 'AMOUNT';
          normVal = parseFloat(raw.replace(/,/g, ''));
        } else {
          // Check if it looks like a monetary number (e.g. 500.00)
          if (raw.includes('.') || raw.includes(',')) {
            type = 'AMOUNT';
            normVal = parseFloat(raw.replace(/,/g, ''));
          } else {
            type = 'WORD';
          }
        }
        prevWasCurrency = false;
      } else if (Tokenizer.ACTION_KEYWORDS.has(raw.toUpperCase())) {
        type = 'KEYWORD';
        normVal = raw.toUpperCase();
        prevWasCurrency = false;
      } else if (Tokenizer.MODE_KEYWORDS.has(raw.toUpperCase())) {
        type = 'PAYMENT_MODE';
        normVal = raw.toUpperCase();
        prevWasCurrency = false;
      } else if (Tokenizer.BALANCE_KEYWORDS.has(raw.toUpperCase())) {
        type = 'BALANCE';
        normVal = raw.toUpperCase();
        prevWasCurrency = false;
      } else if (Tokenizer.DATE_REGEX.test(raw)) {
        type = 'DATE';
        prevWasCurrency = false;
      } else if (Tokenizer.ACCOUNT_MASK_REGEX.test(raw)) {
        type = 'ACCOUNT';
        prevWasCurrency = false;
      } else if (/^[^\w\s]$/.test(raw)) {
        type = 'PUNCTUATION';
        prevWasCurrency = false;
      } else {
        prevWasCurrency = false;
      }

      tokens.push({
        type,
        value: raw,
        normalizedValue: normVal,
        startIndex: start,
        endIndex: end,
      });
    }

    return tokens;
  }

  public toTokenString(tokens: Token[]): string {
    return tokens
      .filter(t => t.type !== 'PUNCTUATION')
      .map(t => (t.type === 'AMOUNT' ? `₹${t.normalizedValue}` : t.value))
      .join(' ');
  }
}

export const defaultTokenizer = new Tokenizer();
