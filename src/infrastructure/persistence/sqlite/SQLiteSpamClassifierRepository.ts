import { SpamClassifierRepository, SpamClassifierState } from '../../../core/classifier/spamClassifier';
import { SettingsRepository } from '../../../core/settings/SettingsRepository';

const SPAM_STATE_KEY = 'spam_classifier_state';

export class SQLiteSpamClassifierRepository implements SpamClassifierRepository {
  constructor(private readonly settings: SettingsRepository) {}

  load(): SpamClassifierState | null {
    const raw = this.settings.get(SPAM_STATE_KEY, '');
    if (!raw) return null;
    try {
      const state: unknown = JSON.parse(raw);
      if (!isSpamClassifierState(state)) return null;
      return state;
    } catch {
      return null;
    }
  }

  save(state: SpamClassifierState): void {
    this.settings.set(SPAM_STATE_KEY, JSON.stringify(state));
  }
}

function isSpamClassifierState(value: unknown): value is SpamClassifierState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<SpamClassifierState>;
  return Number.isFinite(state.spamCount) && Number.isFinite(state.hamCount) &&
    Boolean(state.wordFrequencies) && typeof state.wordFrequencies === 'object';
}
