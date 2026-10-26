import { tokenize } from './bayesClassifier';

export interface SpamClassifierState {
  spamCount: number;
  hamCount: number;
  wordFrequencies: Record<string, { spam: number; ham: number }>;
}

export interface SpamClassifierRepository {
  load(): SpamClassifierState | null;
  save(state: SpamClassifierState): void;
}

const emptyState = (): SpamClassifierState => ({
  spamCount: 0,
  hamCount: 0,
  wordFrequencies: {},
});

/** Pure model behavior with persisted state supplied by an outer adapter. */
export class SpamClassifier {
  private state: SpamClassifierState | null = null;

  constructor(private readonly repository: SpamClassifierRepository) {}

  train(text: string, isSpam: boolean): void {
    const state = this.getState();
    const tokens = tokenize(text);
    if (tokens.length === 0) return;

    if (isSpam) state.spamCount += 1;
    else state.hamCount += 1;

    tokens.forEach(token => {
      state.wordFrequencies[token] ||= { spam: 0, ham: 0 };
      state.wordFrequencies[token][isSpam ? 'spam' : 'ham'] += 1;
    });
    this.repository.save(state);
  }

  isSpam(text: string): boolean {
    const state = this.getState();
    if (state.spamCount === 0) return false;
    const tokens = tokenize(text);
    if (tokens.length === 0) return false;

    const totalDocs = state.spamCount + state.hamCount;
    let logPSpam = Math.log((state.spamCount + 1) / (totalDocs + 2));
    let logPHam = Math.log((state.hamCount + 1) / (totalDocs + 2));
    tokens.forEach(token => {
      const stats = state.wordFrequencies[token];
      if (!stats) return;
      logPSpam += Math.log((stats.spam + 1) / (state.spamCount + 2));
      logPHam += Math.log((stats.ham + 1) / (state.hamCount + 2));
    });
    return logPSpam > logPHam;
  }

  reset(): void {
    this.state = emptyState();
    this.repository.save(this.state);
  }

  private getState(): SpamClassifierState {
    if (!this.state) {
      const stored = this.repository.load();
      this.state = stored ? {
        spamCount: stored.spamCount,
        hamCount: stored.hamCount,
        wordFrequencies: { ...stored.wordFrequencies },
      } : emptyState();
    }
    return this.state;
  }
}
