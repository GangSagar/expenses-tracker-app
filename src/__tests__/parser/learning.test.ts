import { LearningEngine, InMemoryLearningRepository } from '../../core/parser/learning';

describe('LearningEngine Module', () => {
  it('stores and retrieves learned merchant and category corrections', () => {
    const repo = new InMemoryLearningRepository();
    const engine = new LearningEngine(repo);

    expect(engine.hasKnowledge('LOCAL_TEA_STALL')).toBe(false);

    engine.learn('LOCAL_TEA_STALL', 'Chai Point', 'Food & Dining');

    expect(engine.hasKnowledge('LOCAL_TEA_STALL')).toBe(true);
    const learned = engine.getLearnedMerchant('LOCAL_TEA_STALL');
    expect(learned?.displayName).toBe('Chai Point');
    expect(learned?.category).toBe('Food & Dining');
  });

  it('handles case-insensitivity when querying learned knowledge', () => {
    const repo = new InMemoryLearningRepository();
    const engine = new LearningEngine(repo);

    engine.learn('myntra designs', 'Myntra', 'Shopping');

    const learned = engine.getLearnedMerchant('MYNTRA DESIGNS');
    expect(learned?.displayName).toBe('Myntra');
  });
});
