import { TagLearningEngine } from '../core/tags/TagLearningEngine';

describe('TagLearningEngine (Self-Learning Dynamic Classifier)', () => {
  let engine: TagLearningEngine;

  beforeEach(() => {
    engine = new TagLearningEngine();
  });

  it('predicts UPI and Personal for payment app transactions from seed priors', () => {
    const predictions = engine.predict({
      entity: 'Dominos Pizza',
      sender: 'net.one97.paytm',
      paymentMode: 'upi',
      category: 'Food & Dining',
      tokens: ['paid', 'dominos', 'pizza', 'paytm'],
    });

    const tags = predictions.map(p => p.tag);
    expect(tags).toContain('UPI');
    expect(tags).toContain('Personal');
    expect(predictions.length).toBeLessThanOrEqual(3);
  });

  it('predicts Work for tech and enterprise merchants', () => {
    const predictions = engine.predict({
      entity: 'AWS',
      category: 'Business',
      tokens: ['aws', 'cloud', 'services', 'invoice'],
    });

    const tags = predictions.map(p => p.tag);
    expect(tags).toContain('Work');
  });

  it('predicts School for educational expenses', () => {
    const predictions = engine.predict({
      entity: 'Coursera',
      category: 'Education',
      tokens: ['coursera', 'course', 'tuition'],
    });

    const tags = predictions.map(p => p.tag);
    expect(tags).toContain('School');
  });

  it('caps predictions to a maximum of 3 tags even with many matching features', () => {
    const predictions = engine.predict(
      {
        entity: 'Dominos Pizza',
        sender: 'net.one97.paytm',
        paymentMode: 'upi',
        category: 'Food & Dining',
        tokens: ['paid', 'dominos', 'pizza', 'lunch', 'split', 'team', 'grocery'],
      },
      3,
    );

    expect(predictions.length).toBeLessThanOrEqual(3);
  });

  it('dynamically learns new custom merchant and tag associations without regexes', () => {
    const customMerchant = 'Acme Co-Working Space';

    // Before learning, no Work tag is predicted for Acme Co-Working Space
    const initialPredictions = engine.predict({
      entity: customMerchant,
      tokens: ['acme', 'desk', 'rent'],
    });
    expect(initialPredictions.map(p => p.tag)).not.toContain('Work');

    // User labels this transaction with tags ['Work', 'Office']
    engine.learn(
      {
        entity: customMerchant,
        tokens: ['acme', 'co-working', 'desk'],
      },
      ['Work', 'Office'],
    );
    engine.learn(
      {
        entity: customMerchant,
        tokens: ['acme', 'membership'],
      },
      ['Work', 'Office'],
    );

    // After learning, the engine dynamically predicts Work and Office for Acme
    const updatedPredictions = engine.predict({
      entity: customMerchant,
      tokens: ['acme', 'monthly', 'desk'],
    });

    const updatedTags = updatedPredictions.map(p => p.tag);
    expect(updatedTags).toContain('Work');
    expect(updatedTags).toContain('Office');
  });

  it('serializes and restores model state accurately', () => {
    engine.learn(
      {
        entity: 'NewStore',
        tokens: ['newstore'],
      },
      ['Family'],
    );

    const serialized = engine.serialize();
    const newEngine = new TagLearningEngine();
    newEngine.load(serialized);

    const predictions = newEngine.predict({
      entity: 'NewStore',
      tokens: ['newstore'],
    });

    expect(predictions.map(p => p.tag)).toContain('Family');
  });
});

