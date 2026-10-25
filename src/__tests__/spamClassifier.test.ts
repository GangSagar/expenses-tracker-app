import { SpamClassifier, SpamClassifierState } from '../core/classifier/spamClassifier';

describe('SpamClassifier', () => {
  it('trains, persists, reloads, and resets through its repository port', () => {
    let saved: SpamClassifierState | null = null;
    const repository = {
      load: jest.fn(() => saved && JSON.parse(JSON.stringify(saved))),
      save: jest.fn((state: SpamClassifierState) => { saved = JSON.parse(JSON.stringify(state)); }),
    };
    const classifier = new SpamClassifier(repository);

    classifier.train('WIN prize cash', true);
    classifier.train('Grocery receipt', false);
    expect(repository.save).toHaveBeenCalledTimes(2);
    expect(classifier.isSpam('WIN prize cash')).toBe(true);

    const reloaded = new SpamClassifier(repository);
    expect(reloaded.isSpam('WIN prize cash')).toBe(true);
    reloaded.reset();
    expect(reloaded.isSpam('WIN prize cash')).toBe(false);
    expect(saved).toEqual({ spamCount: 0, hamCount: 0, wordFrequencies: {} });
  });

  it('does not persist an empty-token training message', () => {
    const repository = { load: jest.fn(() => null), save: jest.fn() };
    new SpamClassifier(repository).train('!!!', true);
    expect(repository.save).not.toHaveBeenCalled();
  });
});
