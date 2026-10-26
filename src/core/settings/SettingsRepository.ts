import { LocalModelTaskSlot } from '../parser/ai/ModelCatalog';

export interface SettingsRepository {
  get(key: string, defaultValue?: string): string;
  set(key: string, value: string): void;
}

export interface AIModelPreferences {
  enabled: boolean;
  selectedModelId: string | null;
}

export interface InstalledModelReference {
  id: string;
  version: string;
}

export interface ModelLibraryPreferences {
  installedModels: InstalledModelReference[];
  assignments: Record<LocalModelTaskSlot, InstalledModelReference | null>;
  /** Legacy single selection kept read-only during migration from the v1 format. */
  activeModel: InstalledModelReference | null;
}
