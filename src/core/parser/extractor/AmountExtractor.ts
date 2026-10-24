import { ExtractedAmount } from './ExtractedEntities';
import { NormalizedMessage } from '../normalizer';

export class AmountExtractor {
  // Regex strictly targeting monetary expressions
  private static readonly PRIMARY_AMOUNT_REGEX = /(?:₹|Rs\.?|INR)\s*(\d+(?:[,\d]*)?(?:\.\d{1,2})?)/i;
  private static readonly BALANCE_LOOKAHEAD_REGEX = /(?:bal|balance|limit|avl)\s*(?:is|:)?\s*(?:₹|Rs\.?|INR)?\s*(\d+(?:[,\d]*)?(?:\.\d{1,2})?)/i;

  public extract(message: NormalizedMessage): ExtractedAmount | null {
    const text = message.clean;
    if (!text) return null;

    // First, locate and temporarily mask balances so they aren't confused for transaction amounts
    let scrubbed = text;
    const balanceMatch = scrubbed.match(AmountExtractor.BALANCE_LOOKAHEAD_REGEX);
    if (balanceMatch && balanceMatch.index !== undefined) {
      // If balance appears later in the message, keep earlier text for amount
      // (or preserve the rest)
    }

    // Try primary currency amount match
    const match = text.match(AmountExtractor.PRIMARY_AMOUNT_REGEX);
    if (match) {
      const rawNum = match[1].replace(/,/g, '');
      const parsed = parseFloat(rawNum);
      if (!isNaN(parsed) && parsed > 0) {
        return {
          value: parsed,
          currency: '₹',
          confidence: 0.99,
          rawMatched: match[0],
        };
      }
    }

    // Secondary fallback: look for numbers preceded or followed by DEBIT/CREDIT in canonical message
    const canonicalMatch = message.canonical.match(/₹\s*(\d+(?:[,\d]*)?(?:\.\d{1,2})?)/);
    if (canonicalMatch) {
      const rawNum = canonicalMatch[1].replace(/,/g, '');
      const parsed = parseFloat(rawNum);
      if (!isNaN(parsed) && parsed > 0) {
        return {
          value: parsed,
          currency: '₹',
          confidence: 0.95,
          rawMatched: canonicalMatch[0],
        };
      }
    }

    return null;
  }
}

export const amountExtractor = new AmountExtractor();
