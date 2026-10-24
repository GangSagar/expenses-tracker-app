import { ExtractedAccount } from './ExtractedEntities';
import { NormalizedMessage } from '../normalizer';

export class AccountExtractor {
  // Regex patterns for bank accounts and cards
  private static readonly PATTERNS: Array<{ regex: RegExp; type: 'account' | 'card' | 'wallet'; confidence: number }> = [
    // Card specific patterns
    {
      regex: /(?:card\s*(?:no\.?|number)?\s*(?:ending\s*(?:in|with)?|ending|xx|\*{2,})?|crd)\s*[:.-]?\s*(?:xx|\*{2,})*(\d{3,6})/i,
      type: 'card',
      confidence: 0.95,
    },
    {
      regex: /(?:using|on)\s+[A-Za-z0-9\s]*Card\s+(?:ending\s+)?(?:xx|\*{2,})*(\d{3,6})/i,
      type: 'card',
      confidence: 0.95,
    },
    {
      regex: /(?:credit\s+card|debit\s+card)\s+[A-Za-z0-9\s]*(?:account\s+)?(?:4xxx|xx|\*{2,})*(\d{4})/i,
      type: 'card',
      confidence: 0.95,
    },
    // Standard Account patterns
    {
      regex: /(?:a\/c(?:\s*no\.?)?|acct(?:\s*no\.?)?|account(?:\s*no\.?)?|acc(?:\s*no\.?)?|ac)\s*[:.-]?\s*(?:ending\s*(?:with|in)?\s*)?(?:is\s*)?(?:[xX*]+|no\.?\s*[xX*]+)?(\d{3,6})\b/i,
      type: 'account',
      confidence: 0.92,
    },
    {
      regex: /\ba\/c\s*(?:[xX*]+)?(\d{3,6})\b/i,
      type: 'account',
      confidence: 0.90,
    },
    {
      regex: /\b(?:account|acct|ac|acc)\s*(?:no\.?)?\s*[*xX]*(\d{3,6})\b/i,
      type: 'account',
      confidence: 0.88,
    },
  ];

  public extract(message: NormalizedMessage): ExtractedAccount | null {
    const text = message.clean;
    if (!text) return null;

    for (const pattern of AccountExtractor.PATTERNS) {
      const match = text.match(pattern.regex);
      if (match && match[1]) {
        // Validate digits (should not be amount or year like 2026)
        const digits = match[1];
        if (digits.length >= 3 && digits.length <= 6) {
          return {
            accountNumber: digits,
            accountType: pattern.type,
            confidence: pattern.confidence,
          };
        }
      }
    }

    return null;
  }
}

export const accountExtractor = new AccountExtractor();
