import { defaultNormalizer } from '../../core/parser/normalizer';
import { defaultTokenizer } from '../../core/parser/tokenizer';
import {
  defaultMerchantResolver,
  defaultTransactionResolver,
  defaultCategoryResolver,
} from '../../core/parser/resolver';
import { LearningEngine, InMemoryLearningRepository } from '../../core/parser/learning';

describe('Resolver Modules', () => {
  describe('MerchantResolver', () => {
    it('strips payment gateway prefixes (PAY*, RAZ*)', () => {
      const res = defaultMerchantResolver.resolve('PAY*Tobox Ventu');
      expect(res.normalized).toBe('Tobox Ventu');
    });

    it('strips corporate suffixes (Pvt Ltd, Technologies, India)', () => {
      const res = defaultMerchantResolver.resolve('Swiggy Pvt Ltd');
      expect(res.normalized).toBe('Swiggy');
    });

    it('applies configured alias dictionary', () => {
      const res1 = defaultMerchantResolver.resolve('AMAZON SELLER SERVICES');
      expect(res1.normalized).toBe('Amazon');

      const res2 = defaultMerchantResolver.resolve('UBER INDIA');
      expect(res2.normalized).toBe('Uber');
    });

    it('prioritizes learned user mappings above all rules', () => {
      const repo = new InMemoryLearningRepository();
      const learning = new LearningEngine(repo);
      learning.learn('CHAI_POINT_AIRPORT', 'Chai Point', 'Food & Dining');

      const res = defaultMerchantResolver.resolve('CHAI_POINT_AIRPORT', null, learning);
      expect(res.normalized).toBe('Chai Point');
      expect(res.confidence).toBe(1.0);
      expect(res.source).toBe('learned');
    });
  });

  describe('TransactionResolver', () => {
    it('detects Debit and Credit with high confidence', () => {
      const debitNorm = defaultNormalizer.normalize('Rs. 500 debited from account');
      const debitTokens = defaultTokenizer.tokenize(debitNorm);
      expect(defaultTransactionResolver.resolve(debitTokens, debitNorm, 'debit').type).toBe('debit');

      const creditNorm = defaultNormalizer.normalize('Rs. 500 credited to account');
      const creditTokens = defaultTokenizer.tokenize(creditNorm);
      expect(defaultTransactionResolver.resolve(creditTokens, creditNorm, 'credit').type).toBe('credit');
    });

    it('resolves dual-action sentences (debited ... and credited to) as DEBIT for user account', () => {
      const msg = defaultNormalizer.normalize(
        'Rs.1.00 Dr. from A/C XXXXXX9132 and Cr. to 8543851508@ybl. Ref:619719384932'
      );
      const tokens = defaultTokenizer.tokenize(msg);
      const res = defaultTransactionResolver.resolve(tokens, msg, 'debit');
      expect(res.type).toBe('debit');
    });

    it('resolves Refund, Reversal, and Failed transactions', () => {
      const refundMsg = defaultNormalizer.normalize('Refund of Rs 306.95 processed');
      expect(defaultTransactionResolver.resolve([], refundMsg, 'refund').type).toBe('refund');

      const revMsg = defaultNormalizer.normalize('Reversal of transaction Rs. 500');
      expect(defaultTransactionResolver.resolve([], revMsg, 'reversal').type).toBe('reversal');

      const failMsg = defaultNormalizer.normalize('Transaction of Rs. 500 failed due to timeout');
      expect(defaultTransactionResolver.resolve([], failMsg, 'failed').type).toBe('failed');
    });
  });

  describe('CategoryResolver', () => {
    it('maps known merchants directly to categories', () => {
      const swiggy = defaultCategoryResolver.resolve('Swiggy', 'Swiggy Ltd', '');
      expect(swiggy.category).toBe('Food & Dining');

      const uber = defaultCategoryResolver.resolve('Uber', 'Uber India', '');
      expect(uber.category).toBe('Travel');

      const amazon = defaultCategoryResolver.resolve('Amazon', 'Amazon Seller Services', '');
      expect(amazon.category).toBe('Shopping');
    });

    it('uses keyword heuristics on unknown merchants', () => {
      const cafe = defaultCategoryResolver.resolve('Blue Tokai Cafe', 'Blue Tokai Cafe', '');
      expect(cafe.category).toBe('Food & Dining');

      const fuel = defaultCategoryResolver.resolve('Indian Oil Petrol Pump', '', '');
      expect(fuel.category).toBe('Travel');
    });

    it('respects learned user preference over built-in rules', () => {
      const repo = new InMemoryLearningRepository();
      const learning = new LearningEngine(repo);
      // User classifies Amazon as Office / Education instead of Shopping
      learning.learn('Amazon', 'Amazon', 'Education');

      const result = defaultCategoryResolver.resolve('Amazon', 'Amazon', '', learning);
      expect(result.category).toBe('Education');
      expect(result.confidence).toBe(1.0);
      expect(result.source).toBe('learned');
    });
  });
});
