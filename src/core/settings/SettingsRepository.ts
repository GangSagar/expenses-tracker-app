export interface SettingsRepository {
  get(key: string, defaultValue?: string): string;
  set(key: string, value: string): void;
}

export interface AIModelPreferences {
  enabled: boolean;
  selectedModelId: string | null;
}
