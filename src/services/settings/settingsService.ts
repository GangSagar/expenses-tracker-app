import { AIModelPreferences, SettingsRepository } from '../../core/settings/SettingsRepository';

const DEFAULT_MONTHLY_BUDGET = '20000';

export class SettingsService {
  constructor(private readonly repository: SettingsRepository) {}

  getMonthlyBudgetLimit(): string {
    return this.repository.get('monthly_budget_limit', DEFAULT_MONTHLY_BUDGET);
  }

  setMonthlyBudgetLimit(value: string): void {
    this.repository.set('monthly_budget_limit', value);
  }

  getFutureUpdatesNote(): string {
    return this.repository.get('future_updates_note', '');
  }

  setFutureUpdatesNote(value: string): void {
    this.repository.set('future_updates_note', value);
  }

  getAIModelPreferences(): AIModelPreferences {
    const enabled = this.repository.get('local_ai_enabled', 'false') === 'true';
    const selectedModelId = this.repository.get('local_ai_model_id', '').trim() || null;
    // An enabled flag without a selected verified model is not an active runtime.
    return { enabled: enabled && selectedModelId !== null, selectedModelId };
  }

  setAIModelPreferences(preferences: AIModelPreferences): void {
    const modelId = preferences.selectedModelId?.trim() || '';
    this.repository.set('local_ai_model_id', modelId);
    this.repository.set('local_ai_enabled', preferences.enabled && modelId ? 'true' : 'false');
  }

  getHiddenAccounts(): string[] {
    return this.getStringList('hidden_accounts');
  }

  setHiddenAccounts(accounts: string[]): void {
    this.setStringList('hidden_accounts', accounts);
  }

  getIgnoredAnomalies(): string[] {
    return this.getStringList('ignored_anomalies');
  }

  setIgnoredAnomalies(signatures: string[]): void {
    this.setStringList('ignored_anomalies', signatures);
  }

  getAccountType(bank: string, account: string): string | null {
    return this.repository.get(`account_type::${bank}::${account}`, '') || null;
  }

  setAccountType(bank: string, account: string, type: 'cc' | 'debit'): void {
    this.repository.set(`account_type::${bank}::${account}`, type);
  }

  private getStringList(key: string): string[] {
    try {
      const parsed: unknown = JSON.parse(this.repository.get(key, '[]'));
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  private setStringList(key: string, value: string[]): void {
    this.repository.set(key, JSON.stringify(value));
  }
}
