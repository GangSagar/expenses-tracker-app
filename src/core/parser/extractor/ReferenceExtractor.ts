import { NormalizedMessage } from '../normalizer';

export class ReferenceExtractor {
  private static readonly REFERENCE_PATTERNS: RegExp[] = [
    // Standard Ref:123456789 or Ref. 123456789
    /\b(?:ref|reference|rrn|utr)\s*(?:no\.?|id|num)?\s*[:.-]?\s*(\w{6,22})\b/i,
    // UPI:1234567890 or UPI Ref no 1234567890
    /\bUPI(?:\s*Ref\s*(?:no\.?|id)?)?\s*[:.-]?\s*(\w{6,22})\b/i,
    // Txn ID: 1234567890
    /\b(?:txn|transaction)\s*(?:id|no\.?)\s*[:.-]?\s*(\w{6,22})\b/i,
  ];

  public extract(message: NormalizedMessage): string | null {
    const text = message.clean;
    if (!text) return null;

    for (const pattern of ReferenceExtractor.REFERENCE_PATTERNS) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const val = match[1].trim();
        // Disqualify if it's a date or common word
        if (!/^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(val)) {
          return val;
        }
      }
    }

    return null;
  }
}

export const referenceExtractor = new ReferenceExtractor();
