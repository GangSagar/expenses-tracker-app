import { classifySMS, tokenize } from '../core/classifier/bayesClassifier';

describe('Local Bayesian SMS Classifier Engine', () => {
  describe('Text Tokenization & Stem Cleaning', () => {
    it('tokenizes and normalizes input text string properly', () => {
      const text = 'Dear Customer, Get FLAT 50% off on your loan today!';
      const tokens = tokenize(text);
      
      expect(tokens).toContain('dear');
      expect(tokens).toContain('customer');
      expect(tokens).toContain('flat');
      expect(tokens).toContain('off');
      expect(tokens).toContain('loan');
      expect(tokens).toContain('today');
      
      // Excludes short length 1-char elements and special characters
      expect(tokens).not.toContain('%');
      expect(tokens).not.toContain('a');
    });

    it('returns empty array for null/empty texts', () => {
      expect(tokenize('')).toEqual([]);
    });
  });

  describe('SMS Text Classification Probabilities', () => {
    it('classifies authentic banking debits as genuine transactions', () => {
      const msg = 'Rs. 1,500 spent at Swiggy via HDFC Card XX1234. Avl Bal: Rs. 4,500.';
      const result = classifySMS(msg);
      
      expect(result.isTransaction).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('classifies authentic banking credits as genuine transactions', () => {
      const msg = 'Salary Rs. 85,000 credited to a/c XX789 on 31-May-26. Ref: UTR983281.';
      const result = classifySMS(msg);
      
      expect(result.isTransaction).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('weeds out promotional marketing spams with high confidence', () => {
      const spam = 'Flat 40% discount on personal loans! Apply instantly at link, hurry!';
      const result = classifySMS(spam);
      
      expect(result.isTransaction).toBe(false);
    });

    it('filters out winning lottery lucky prize spams', () => {
      const prizeSpam = 'Congrats! You won a lucky lottery prize voucher worth Rs. 50,000. Spin now!';
      const result = classifySMS(prizeSpam);
      
      expect(result.isTransaction).toBe(false);
    });

    it('safely handles neutral unknown strings', () => {
      const neutral = 'Hey are you free to join us for coffee today?';
      const result = classifySMS(neutral);
      
      expect(result.isTransaction).toBe(false);
    });
  });
});
