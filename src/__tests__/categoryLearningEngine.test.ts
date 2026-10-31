import { CategoryLearningEngine } from '../core/learning/categories/CategoryLearningEngine';

describe('CategoryLearningEngine (Self-Learning Statistical Classifier)', () => {
  let engine: CategoryLearningEngine;

  beforeEach(() => {
    engine = new CategoryLearningEngine();
  });

  it('suggests Food & Dining for restaurants and food delivery from baseline priors', () => {
    const suggestions = engine.suggest({
      entity: 'Dominos Pizza',
      tokens: ['paid', 'dominos', 'pizza', 'paytm'],
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].category).toBe('Food & Dining');
    expect(suggestions[0].confidence).toBeGreaterThan(0.5);
  });

  it('suggests Travel for cab rides and transit merchants', () => {
    const suggestions = engine.suggest({
      entity: 'Uber',
      tokens: ['paid', 'uber', 'trip', 'ride'],
    });

    expect(suggestions[0].category).toBe('Travel');
  });

  it('suggests Groceries for quick commerce and supermarkets', () => {
    const suggestions = engine.suggest({
      entity: 'Blinkit',
      tokens: ['blinkit', 'grocery', 'milk', 'vegetables'],
    });

    expect(suggestions[0].category).toBe('Groceries');
  });

  it('provides multiple ranked category suggestions sorted by confidence descending', () => {
    const suggestions = engine.suggest(
      {
        entity: 'Cafe & Bookshop',
        tokens: ['cafe', 'coffee', 'books', 'store'],
      },
      3,
    );

    expect(suggestions.length).toBeLessThanOrEqual(3);
    if (suggestions.length >= 2) {
      expect(suggestions[0].confidence).toBeGreaterThanOrEqual(suggestions[1].confidence);
    }
  });

  it('dynamically learns new merchant category associations without regexes', () => {
    const newMerchant = 'Green Leaf Nursery';

    // Prior to learning, Green Leaf Nursery doesn't match standard merchants
    const initialSuggestions = engine.suggest({
      entity: newMerchant,
      tokens: ['green', 'leaf', 'plants'],
    });
    // Check it's not shopping initially with high confidence
    expect(initialSuggestions.find(s => s.category === 'Shopping')?.confidence || 0).toBeLessThan(0.7);

    // User labels this transaction as Shopping
    engine.learn(
      {
        entity: newMerchant,
        tokens: ['green', 'leaf', 'nursery', 'plants'],
      },
      'Shopping',
    );
    engine.learn(
      {
        entity: newMerchant,
        tokens: ['green', 'leaf', 'pots'],
      },
      'Shopping',
    );

    // After learning, the engine dynamically suggests Shopping as top category
    const updatedSuggestions = engine.suggest({
      entity: newMerchant,
      tokens: ['green', 'leaf'],
    });

    expect(updatedSuggestions[0].category).toBe('Shopping');
  });

  it('serializes and restores model state accurately', () => {
    engine.learn(
      {
        entity: 'Novel Store',
        tokens: ['novel', 'store'],
      },
      'Education',
    );

    const serialized = engine.serialize();
    const newEngine = new CategoryLearningEngine();
    newEngine.load(serialized);

    const suggestions = newEngine.suggest({
      entity: 'Novel Store',
      tokens: ['novel'],
    });

    expect(suggestions[0].category).toBe('Education');
  });
});

