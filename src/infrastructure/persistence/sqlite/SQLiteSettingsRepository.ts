import { SettingsRepository } from '../../../core/settings/SettingsRepository';
import { getSetting, setSetting } from '../../../database/expenseRepo';

export class SQLiteSettingsRepository implements SettingsRepository {
  get(key: string, defaultValue = ''): string {
    return getSetting(key, defaultValue);
  }

  set(key: string, value: string): void {
    setSetting(key, value);
  }
}
