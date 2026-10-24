import { normalizeUnicode } from './unicodeNormalizer';
import { normalizeWhitespace } from './whitespaceNormalizer';
import { normalizeCurrency } from './currencyNormalizer';
import { normalizeKeywords } from './keywordNormalizer';

export interface NormalizedMessage {
  raw: string;
  clean: string;
  canonical: string;
}

export interface INormalizer {
  normalize(rawMessage: string): NormalizedMessage;
}

export class Normalizer implements INormalizer {
  public normalize(rawMessage: string): NormalizedMessage {
    if (!rawMessage || typeof rawMessage !== 'string') {
      return { raw: '', clean: '', canonical: '' };
    }

    // Step 1: Decode any Unicode mathematical/stylized characters
    const unicodeNormalized = normalizeUnicode(rawMessage);

    // Step 2: Clean whitespaces, newlines, and non-breaking characters
    const clean = normalizeWhitespace(unicodeNormalized);

    // Step 3: Canonicalize currencies (Rs., INR -> ₹)
    const currencyNormalized = normalizeCurrency(clean);

    // Step 4: Canonicalize action verbs (Debited -> DEBIT, Credited -> CREDIT)
    const canonical = normalizeKeywords(currencyNormalized);

    return {
      raw: rawMessage,
      clean,
      canonical,
    };
  }
}

export const defaultNormalizer = new Normalizer();
