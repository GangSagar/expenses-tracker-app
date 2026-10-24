import {
  defaultNormalizer,
  normalizeUnicode,
  normalizeCurrency,
  normalizeKeywords,
  normalizeWhitespace,
} from '../../core/parser/normalizer';

describe('Normalizer Module', () => {
  describe('normalizeUnicode', () => {
    it('normalizes mathematical sans-serif and bold fonts to standard ASCII', () => {
      // 𝖡𝖮𝖡 -> BOB, 𝟣.𝟢𝟢 -> 1.00
      const stylized = 'Dear \u{1D5A1}\u{1D5AE}\u{1D5A1} UPI: INR \u{1D7E3}.\u{1D7E2}\u{1D7E2}';
      const result = normalizeUnicode(stylized);
      expect(result).toBe('Dear BOB UPI: INR 1.00');
    });

    it('preserves regular ASCII strings intact', () => {
      const normal = 'Normal English Bank Alert 1234';
      expect(normalizeUnicode(normal)).toBe(normal);
    });
  });

  describe('normalizeCurrency', () => {
    it('normalizes Rs., Rs, INR, inr to canonical ₹ symbol', () => {
      expect(normalizeCurrency('Rs. 500 debited')).toBe('₹ 500 debited');
      expect(normalizeCurrency('Rs.500 spent')).toBe('₹ 500 spent');
      expect(normalizeCurrency('INR 1,200.50 paid')).toBe('₹ 1,200.50 paid');
      expect(normalizeCurrency('inr 99 credited')).toBe('₹ 99 credited');
      expect(normalizeCurrency('₹500')).toBe('₹ 500');
    });
  });

  describe('normalizeKeywords', () => {
    it('converts debit action verbs to DEBIT', () => {
      expect(normalizeKeywords('debited from your account')).toContain('DEBIT');
      expect(normalizeKeywords('spent at Store')).toContain('DEBIT');
      expect(normalizeKeywords('paid to Merchant')).toContain('DEBIT');
      expect(normalizeKeywords('purchase of goods')).toContain('DEBIT');
      expect(normalizeKeywords('Rs.10 Dr. from A/C')).toContain('DEBIT');
    });

    it('converts credit action verbs to CREDIT', () => {
      expect(normalizeKeywords('credited to your account')).toContain('CREDIT');
      expect(normalizeKeywords('received on card')).toContain('CREDIT');
      expect(normalizeKeywords('deposited into account')).toContain('CREDIT');
      expect(normalizeKeywords('Rs.10 Cr. to A/C')).toContain('CREDIT');
    });

    it('converts refund and reversal verbs', () => {
      expect(normalizeKeywords('refund initiated for order')).toContain('REFUND');
      expect(normalizeKeywords('reversal of transaction')).toContain('REVERSAL');
      expect(normalizeKeywords('transaction failed')).toContain('FAILED');
    });
  });

  describe('normalizeWhitespace', () => {
    it('collapses multi-space and cleans non-breaking characters', () => {
      const dirty = '  A/c   XX1234 \n\t debited   by   ₹500  ';
      expect(normalizeWhitespace(dirty)).toBe('A/c XX1234 debited by ₹500');
    });
  });

  describe('Composite Normalizer', () => {
    it('produces raw, clean, and canonical representations', () => {
      const raw = 'Rs. 500  debited  from A/c XX1234';
      const result = defaultNormalizer.normalize(raw);

      expect(result.raw).toBe(raw);
      expect(result.clean).toBe('Rs. 500 debited from A/c XX1234');
      expect(result.canonical).toBe('₹ 500 DEBIT from A/c XX1234');
    });
  });
});
