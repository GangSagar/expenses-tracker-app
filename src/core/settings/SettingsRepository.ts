export interface SettingsRepository {
  get(key: string, defaultValue?: string): string;
  set(key: string, value: string): void;
}
