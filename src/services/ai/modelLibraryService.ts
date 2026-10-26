import {
  LocalModelCatalogEntry,
  MODEL_ARTIFACT_MAX_BYTES_EXCLUSIVE,
  ModelArtifactDownload,
  ModelArtifactStore,
  ModelLibraryEntry,
  LocalModelTaskSlot,
  modelArtifactKey,
  modelTaskSlot,
} from '../../core/parser/ai/ModelCatalog';
import { InstalledModelReference } from '../../core/settings/SettingsRepository';
import { SettingsService } from '../settings/settingsService';

const TASK_SLOTS: LocalModelTaskSlot[] = ['intent', 'category', 'extraction'];

export class ModelLibraryService {
  private readonly catalogByKey: Map<string, LocalModelCatalogEntry>;

  constructor(
    private readonly catalog: readonly LocalModelCatalogEntry[],
    private readonly artifacts: ModelArtifactStore,
    private readonly settings: SettingsService,
  ) {
    this.catalogByKey = new Map();
    for (const model of catalog) {
      const key = modelArtifactKey(model);
      if (this.catalogByKey.has(key)) throw new Error(`Duplicate model catalog entry: ${key}`);
      if (!Number.isSafeInteger(model.sizeBytes) || model.sizeBytes <= 0 ||
          model.sizeBytes >= MODEL_ARTIFACT_MAX_BYTES_EXCLUSIVE) {
        throw new Error(`Catalog model must be smaller than 100 MB: ${key}`);
      }
      if ((model.runtime === 'llama_cpp') !== (model.format === 'gguf')) {
        throw new Error(`Model runtime and file format do not match: ${key}`);
      }
      if (model.supportedPlatforms.length === 0) throw new Error(`Model has no supported platform: ${key}`);
      this.catalogByKey.set(key, model);
    }
    this.migrateLegacySelection();
  }

  async listModels(): Promise<ModelLibraryEntry[]> {
    const preferences = this.settings.getModelLibraryPreferences();
    const installed = new Set<string>();
    await Promise.all(this.catalog.map(async model => {
      if (await this.artifacts.hasArtifact(model)) installed.add(modelArtifactKey(model));
    }));

    const validInstalled = this.catalog
      .filter(model => installed.has(modelArtifactKey(model)))
      .map(({ id, version }) => ({ id, version }));
    const assignments = { ...preferences.assignments };
    for (const slot of TASK_SLOTS) {
      const assignment = assignments[slot];
      if (!assignment) continue;
      const assignedModel = this.catalogByKey.get(modelArtifactKey(assignment));
      if (!installed.has(modelArtifactKey(assignment)) || !assignedModel || modelTaskSlot(assignedModel.task) !== slot) {
        assignments[slot] = null;
      }
    }
    const assignmentsChanged = TASK_SLOTS.some(slot =>
      modelArtifactKeyOrNull(assignments[slot]) !== modelArtifactKeyOrNull(preferences.assignments[slot]));

    if (validInstalled.length !== preferences.installedModels.length || assignmentsChanged || preferences.activeModel) {
      this.settings.setModelLibraryPreferences({
        installedModels: validInstalled,
        assignments,
        activeModel: null,
      });
    }

    const updated = this.settings.getModelLibraryPreferences();
    return this.catalog.map(model => {
      const key = modelArtifactKey(model);
      const isInstalled = installed.has(key) && updated.installedModels.some(item => modelArtifactKey(item) === key);
      const slot = modelTaskSlot(model.task);
      const assigned = isInstalled && modelArtifactKeyOrNull(updated.assignments[slot]) === key;
      return {
        ...model,
        installed: isInstalled,
        active: assigned,
        assignedSlot: assigned ? slot : null,
      };
    });
  }

  installModel(id: string, version: string, onProgress?: (ratio: number) => void): ModelArtifactDownload {
    const model = this.requireCatalogEntry(id, version);
    const operation = this.artifacts.install(model, onProgress);
    return {
      cancel: operation.cancel,
      promise: operation.promise.then(artifact => {
        const current = this.settings.getModelLibraryPreferences();
        const installedModels = addUniqueReference(current.installedModels, { id, version });
        this.settings.setModelLibraryPreferences({ ...current, installedModels, activeModel: null });
        return artifact;
      }),
    };
  }

  async selectModel(id: string, version: string, slot = modelTaskSlot(this.requireCatalogEntry(id, version).task)): Promise<void> {
    const model = this.requireCatalogEntry(id, version);
    const expectedSlot = modelTaskSlot(model.task);
    if (slot !== expectedSlot) throw new Error(`Model is only compatible with the ${expectedSlot} slot`);
    const artifact = await this.artifacts.getInstalled(model);
    if (!artifact) throw new Error('Install and verify this model before selecting it');

    const current = this.settings.getModelLibraryPreferences();
    const installedModels = addUniqueReference(current.installedModels, { id, version });
    this.settings.setModelLibraryPreferences({
      installedModels,
      assignments: { ...current.assignments, [slot]: { id, version } },
      activeModel: null,
    });
  }

  clearAssignment(slot: LocalModelTaskSlot): void {
    const current = this.settings.getModelLibraryPreferences();
    this.settings.setModelLibraryPreferences({
      ...current,
      assignments: { ...current.assignments, [slot]: null },
      activeModel: null,
    });
  }

  setDeterministicOnly(): void {
    const current = this.settings.getModelLibraryPreferences();
    this.settings.setModelLibraryPreferences({
      ...current,
      assignments: { intent: null, category: null, extraction: null },
      activeModel: null,
    });
  }

  async removeModel(id: string, version: string): Promise<void> {
    const model = this.requireCatalogEntry(id, version);
    const current = this.settings.getModelLibraryPreferences();
    const key = modelArtifactKey(model);
    if (TASK_SLOTS.some(slot => current.assignments[slot] && modelArtifactKey(current.assignments[slot]!) === key)) {
      throw new Error('Clear or reassign this model slot before removing the assigned model');
    }

    const artifact = await this.artifacts.getInstalled(model);
    if (artifact) await this.artifacts.remove(artifact);
    this.settings.setModelLibraryPreferences({
      ...current,
      installedModels: current.installedModels.filter(reference => modelArtifactKey(reference) !== key),
      activeModel: null,
    });
  }

  private migrateLegacySelection(): void {
    const preferences = this.settings.getModelLibraryPreferences();
    if (!preferences.activeModel) return;
    const model = this.catalogByKey.get(modelArtifactKey(preferences.activeModel));
    const assignments = { ...preferences.assignments };
    if (model && preferences.installedModels.some(item => modelArtifactKey(item) === modelArtifactKey(model))) {
      assignments[modelTaskSlot(model.task)] = preferences.activeModel;
    }
    this.settings.setModelLibraryPreferences({
      installedModels: preferences.installedModels,
      assignments,
      activeModel: null,
    });
  }

  private requireCatalogEntry(id: string, version: string): LocalModelCatalogEntry {
    const model = this.catalogByKey.get(modelArtifactKey({ id, version }));
    if (!model) throw new Error(`Model is not available in the catalog: ${id}@${version}`);
    return model;
  }
}

function modelArtifactKeyOrNull(reference: InstalledModelReference | null): string | null {
  return reference ? modelArtifactKey(reference) : null;
}

function addUniqueReference(
  references: InstalledModelReference[],
  value: InstalledModelReference,
): InstalledModelReference[] {
  return references.some(reference => modelArtifactKey(reference) === modelArtifactKey(value))
    ? references
    : [...references, value];
}
