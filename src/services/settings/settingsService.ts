import {
  AIModelPreferences,
  AlertPreferences,
  InstalledModelReference,
  ModelLibraryPreferences,
  ReportPreferences,
  SettingsRepository,
} from '../../core/settings/SettingsRepository';
import { LocalModelTaskSlot } from '../../core/parser/ai/ModelCatalog';
import { syncReportSchedule } from '../notifications/reportSchedulerService';

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

  getModelLibraryPreferences(): ModelLibraryPreferences {
    try {
      const parsed: unknown = JSON.parse(this.repository.get('local_ai_model_library', '{}'));
      if (!parsed || typeof parsed !== 'object') return emptyModelLibraryPreferences();
      const value = parsed as { installedModels?: unknown; activeModel?: unknown; assignments?: unknown };
      const installedModels = Array.isArray(value.installedModels)
        ? value.installedModels.filter(isModelReference)
        : [];
      const unique = new Map(installedModels.map(model => [`${model.id}@${model.version}`, model]));
      const activeModel = isModelReference(value.activeModel) ? value.activeModel : null;
      const activeIsInstalled = activeModel && unique.has(`${activeModel.id}@${activeModel.version}`);
      const assignments = normalizeAssignments(value.assignments, unique);
      return {
        installedModels: [...unique.values()],
        assignments,
        // Old settings are exposed for ModelLibraryService to map to a task slot
        // using catalog metadata. New-format data always writes this as null.
        activeModel: value.assignments === undefined && activeIsInstalled ? activeModel : null,
      };
    } catch {
      return emptyModelLibraryPreferences();
    }
  }

  setModelLibraryPreferences(preferences: ModelLibraryPreferences): void {
    const installedModels = [...new Map(
      preferences.installedModels.filter(isModelReference)
        .map(model => [`${model.id}@${model.version}`, model] as const),
    ).values()];
    const installed = new Map(installedModels.map(model => [`${model.id}@${model.version}`, model]));
    for (const slot of ['intent', 'category', 'extraction'] as const) {
      const reference = preferences.assignments?.[slot];
      if (reference && (!isModelReference(reference) || !installed.has(`${reference.id}@${reference.version}`))) {
        throw new Error('Assigned model must be present in the installed model list');
      }
    }
    const assignments = normalizeAssignments(preferences.assignments, installed);
    this.repository.set('local_ai_model_library', JSON.stringify({ installedModels, assignments, activeModel: null }));
    const assigned = Object.values(assignments).filter((reference): reference is InstalledModelReference => reference !== null);
    this.repository.set('local_ai_model_id', assigned.length === 1 ? assigned[0].id : '');
    this.repository.set('local_ai_enabled', assigned.length > 0 ? 'true' : 'false');
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

  getReportPreferences(): ReportPreferences {
    return {
      dailyEnabled: this.repository.get('report_daily_enabled', 'true') === 'true',
      dailyTime: this.repository.get('report_daily_time', '22:00'),
      weeklyEnabled: this.repository.get('report_weekly_enabled', 'true') === 'true',
      weeklyTime: this.repository.get('report_weekly_time', '22:00'),
      weeklyDay: this.repository.get('report_weekly_day', 'Sunday'),
      monthlyEnabled: this.repository.get('report_monthly_enabled', 'true') === 'true',
      monthlyTime: this.repository.get('report_monthly_time', '22:00'),
    };
  }

  setReportPreferences(preferences: ReportPreferences): void {
    this.repository.set('report_daily_enabled', preferences.dailyEnabled ? 'true' : 'false');
    this.repository.set('report_daily_time', preferences.dailyTime);
    this.repository.set('report_weekly_enabled', preferences.weeklyEnabled ? 'true' : 'false');
    this.repository.set('report_weekly_time', preferences.weeklyTime);
    this.repository.set('report_weekly_day', preferences.weeklyDay);
    this.repository.set('report_monthly_enabled', preferences.monthlyEnabled ? 'true' : 'false');
    this.repository.set('report_monthly_time', preferences.monthlyTime);
    syncReportSchedule();
  }

  getAlertPreferences(): AlertPreferences {
    return {
      budgetAlertsEnabled: this.repository.get('alert_budget_enabled', 'true') === 'true',
      highValueThreshold: Number(this.repository.get('alert_high_value_threshold', '10000')) || 10000,
      lowBalanceThreshold: Number(this.repository.get('alert_low_balance_threshold', '2000')) || 2000,
      duplicateAlertsEnabled: this.repository.get('alert_duplicate_enabled', 'true') === 'true',
      billRemindersEnabled: this.repository.get('alert_bills_enabled', 'true') === 'true',
    };
  }

  setAlertPreferences(preferences: AlertPreferences): void {
    this.repository.set('alert_budget_enabled', preferences.budgetAlertsEnabled ? 'true' : 'false');
    this.repository.set('alert_high_value_threshold', String(preferences.highValueThreshold));
    this.repository.set('alert_low_balance_threshold', String(preferences.lowBalanceThreshold));
    this.repository.set('alert_duplicate_enabled', preferences.duplicateAlertsEnabled ? 'true' : 'false');
    this.repository.set('alert_bills_enabled', preferences.billRemindersEnabled ? 'true' : 'false');
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

function isModelReference(value: unknown): value is InstalledModelReference {
  if (!value || typeof value !== 'object') return false;
  const reference = value as Partial<InstalledModelReference>;
  return typeof reference.id === 'string' && /^[a-zA-Z0-9._-]{1,80}$/.test(reference.id) &&
    typeof reference.version === 'string' && /^[a-zA-Z0-9._-]{1,40}$/.test(reference.version);
}

function emptyModelLibraryPreferences(): ModelLibraryPreferences {
  return { installedModels: [], assignments: emptyAssignments(), activeModel: null };
}

function emptyAssignments(): Record<LocalModelTaskSlot, InstalledModelReference | null> {
  return { intent: null, category: null, extraction: null };
}

function normalizeAssignments(
  value: unknown,
  installed: Map<string, InstalledModelReference>,
): Record<LocalModelTaskSlot, InstalledModelReference | null> {
  const assignments = emptyAssignments();
  if (!value || typeof value !== 'object') return assignments;
  const candidate = value as Partial<Record<LocalModelTaskSlot, unknown>>;
  for (const slot of ['intent', 'category', 'extraction'] as const) {
    const reference = candidate[slot];
    if (isModelReference(reference) && installed.has(`${reference.id}@${reference.version}`)) {
      assignments[slot] = reference;
    }
  }
  return assignments;
}
