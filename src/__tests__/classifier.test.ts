import { classify } from '../core/classifier/classify';
import {
  setMerchantMapping,

  initMerchantMap,
} from '../core/classifier/merchantMap';

describe('classify', () => {
  it('classifies Swiggy as Food & Dining', () => {
    const result = classify('Swiggy', 'Rs.200 paid to Swiggy');
    expect(result.category).toBe('Food & Dining');
  });

  it('classifies Uber as Travel', () => {
    const result = classify('Uber', 'Rs.150 paid to Uber');
    expect(result.category).toBe('Travel');
  });

  it('classifies Amazon as Shopping', () => {
    const result = classify('Amazon', 'Rs.999 spent at Amazon');
    expect(result.category).toBe('Shopping');
  });

  it('classifies Netflix as Entertainment', () => {
    const result = classify('Netflix', 'Rs.499 paid to Netflix');
    expect(result.category).toBe('Entertainment');
  });

  it('classifies BigBasket as Groceries', () => {
    const result = classify('BigBasket', 'Rs.800 paid to BigBasket');
    expect(result.category).toBe('Groceries');
  });

  it('returns Other for unknown merchants', () => {
    const result = classify(
      'QWXYZ_RANDOM',
      'Rs.300 debited at QWXYZ_RANDOM on 15-05-26',
    );
    expect(result.category).toBe('Other');
    expect(result.matchedVia).toBe('default');
  });

  describe('Custom Merchant Mapping', () => {
    beforeEach(() => {
      initMerchantMap({});
    });

    it('should respect custom merchant mappings over rules', () => {
      // Train the classifier
      setMerchantMapping('local_shop', 'Groceries', 'Local Shop');

      // Test with mapping
      const result = classify('local_shop', 'Rs.100 paid to local_shop');
      expect(result.category).toBe('Groceries');
      expect(result.matchedVia).toBe('merchant_map');
    });
  });
});
