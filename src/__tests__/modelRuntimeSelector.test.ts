import { SettingsRepository } from '../core/settings/SettingsRepository';
import { LocalModelCatalogEntry } from '../core/parser/ai/ModelCatalog';
import { SettingsService } from '../services/settings/settingsService';
import { LocalModelInferenceAdapter, ModelRuntimeSelector } from '../services/ai/modelRuntimeSelector';

const models: LocalModelCatalogEntry[] = [
  {
    id: 'mini', version: '1.0', url: 'https://huggingface.co/o/m/resolve/main/model.onnx', sha256: 'a'.repeat(64),
    sizeBytes: 20_000_000, fileName: 'model.onnx', displayName: 'Mini', description: 'Intent', publisher: 'o',
    license: 'Apache-2.0', baseModel: 'MiniLM', task: 'message_intent', format: 'onnx', runtime: 'onnx_runtime',
    supportedPlatforms: ['android', 'ios'], fineTuned: true,
  },
  {
    id: 'mobile', version: '1.0', url: 'https://huggingface.co/o/m/resolve/main/model.onnx', sha256: 'b'.repeat(64),
    sizeBytes: 21_000_000, fileName: 'model.onnx', displayName: 'Mobile', description: 'Category', publisher: 'o',
    license: 'Apache-2.0', baseModel: 'MobileBERT', task: 'message_classification', format: 'onnx', runtime: 'onnx_runtime',
    supportedPlatforms: ['android', 'ios'], fineTuned: true,
  },
];

function createSettings() {
  const values: Record<string, string> = {};
  const repository: SettingsRepository = {
    get: (key, fallback = '') => values[key] ?? fallback,
    set: (key, value) => { values[key] = value; },
  };
  return new SettingsService(repository);
}

function evidence(value: unknown) {
  return { value, confidence: 0.9, source: 'local_model' };
}

describe('ModelRuntimeSelector', () => {
  it('runs assigned slots serially and combines validated evidence', async () => {
    const settings = createSettings();
    settings.setModelLibraryPreferences({
      installedModels: models.map(({ id, version }) => ({ id, version })),
      assignments: {
        intent: { id: 'mini', version: '1.0' },
        category: { id: 'mobile', version: '1.0' },
        extraction: null,
      },
      activeModel: null,
    });
    const sequence: string[] = [];
    let active = false;
    const createAdapter = (model: LocalModelCatalogEntry, proposal: object): LocalModelInferenceAdapter => ({
      model,
      propose: jest.fn(async () => {
        expect(active).toBe(false);
        active = true;
        sequence.push(model.id);
        await Promise.resolve();
        active = false;
        return proposal;
      }),
    });
    const selector = new ModelRuntimeSelector(settings, [
      createAdapter(models[0], {
        modelId: 'mini', modelVersion: '1.0', conflicts: [],
        transactionType: evidence('debit'),
      }),
      createAdapter(models[1], {
        modelId: 'mobile', modelVersion: '1.0', conflicts: [],
        category: evidence('Food & Dining'),
      }),
    ]);

    await expect(selector.propose({ message: 'private', context: 'foreground_interaction' })).resolves.toMatchObject({
      modelId: 'local-model-pipeline',
      transactionType: evidence('debit'),
      category: evidence('Food & Dining'),
      conflicts: [],
    });
    expect(sequence).toEqual(['mini', 'mobile']);
  });

  it('does not run local adapters for background or unknown context', async () => {
    const settings = createSettings();
    settings.setModelLibraryPreferences({
      installedModels: [{ id: 'mini', version: '1.0' }],
      assignments: { intent: { id: 'mini', version: '1.0' }, category: null, extraction: null },
      activeModel: null,
    });
    const adapter = { model: models[0], propose: jest.fn(async () => null) };
    const selector = new ModelRuntimeSelector(settings, [adapter]);

    await expect(selector.propose({ message: 'private', context: 'live_background' })).resolves.toBeNull();
    await expect(selector.propose({ message: 'private', context: 'unknown' })).resolves.toBeNull();
    expect(adapter.propose).not.toHaveBeenCalled();
  });

  it('drops invalid adapter output and continues with other assigned slots', async () => {
    const settings = createSettings();
    settings.setModelLibraryPreferences({
      installedModels: models.map(({ id, version }) => ({ id, version })),
      assignments: {
        intent: { id: 'mini', version: '1.0' },
        category: { id: 'mobile', version: '1.0' },
        extraction: null,
      },
      activeModel: null,
    });
    const selector = new ModelRuntimeSelector(settings, [
      { model: models[0], propose: async () => ({ unexpected: true }) },
      { model: models[1], propose: async () => ({ modelId: 'mobile', modelVersion: '1.0', conflicts: [], category: evidence('Food & Dining') }) },
    ]);

    await expect(selector.propose({ message: 'private', context: 'foreground_interaction' })).resolves.toMatchObject({
      category: evidence('Food & Dining'),
    });
  });
});
