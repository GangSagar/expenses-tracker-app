import { InstalledModelArtifact, LocalModelCatalogEntry, ModelArtifactStore } from '../core/parser/ai/ModelCatalog';
import { ModelLibraryService } from '../services/ai/modelLibraryService';
import { SettingsRepository } from '../core/settings/SettingsRepository';
import { SettingsService } from '../services/settings/settingsService';

const catalog: LocalModelCatalogEntry[] = [
  {
    id: 'minilm-intent', version: '1.0.0', url: 'https://huggingface.co/org/minilm/resolve/main/model.onnx',
    sha256: 'a'.repeat(64), sizeBytes: 24_000_000, fileName: 'model.onnx',
    displayName: 'MiniLM Intent', description: 'Message intent classifier.', publisher: 'sample',
    license: 'Apache-2.0', baseModel: 'MiniLM', task: 'message_intent', format: 'onnx',
    runtime: 'onnx_runtime', supportedPlatforms: ['android', 'ios'], fineTuned: true,
  },
  {
    id: 'smollm2-extractor', version: '1.0.0', url: 'https://huggingface.co/org/smollm/resolve/main/model.gguf',
    sha256: 'b'.repeat(64), sizeBytes: 88_000_000, fileName: 'model.gguf',
    displayName: 'SmolLM2 Extractor', description: 'Structured transaction extractor.', publisher: 'sample',
    license: 'Apache-2.0', baseModel: 'SmolLM2', task: 'structured_extraction', format: 'gguf',
    runtime: 'llama_cpp', supportedPlatforms: ['android', 'ios'], fineTuned: true,
  },
  {
    id: 'mobilebert-category', version: '1.0.0', url: 'https://huggingface.co/org/mobilebert/resolve/main/model.onnx',
    sha256: 'c'.repeat(64), sizeBytes: 28_000_000, fileName: 'model.onnx',
    displayName: 'MobileBERT Category', description: 'Transaction category classifier.', publisher: 'sample',
    license: 'Apache-2.0', baseModel: 'MobileBERT', task: 'message_classification', format: 'onnx',
    runtime: 'onnx_runtime', supportedPlatforms: ['android', 'ios'], fineTuned: true,
  },
];

function createSettings(initial: Record<string, string> = {}): SettingsService {
  const values = { ...initial };
  const repository: SettingsRepository = {
    get: (key, defaultValue = '') => values[key] ?? defaultValue,
    set: (key, value) => { values[key] = value; },
  };
  return new SettingsService(repository);
}

function createArtifactManager(): ModelArtifactStore {
  const installed = new Map<string, InstalledModelArtifact>();
  const keyOf = (spec: { id: string; version: string }) => `${spec.id}@${spec.version}`;
  return {
    install: jest.fn(spec => {
      const artifact = { ...spec, path: `/private/models/${spec.id}-${spec.version}-${spec.fileName}` };
      installed.set(keyOf(spec), artifact);
      return { promise: Promise.resolve(artifact), cancel: jest.fn() };
    }),
    hasArtifact: jest.fn(async spec => installed.has(keyOf(spec))),
    getInstalled: jest.fn(async spec => installed.get(keyOf(spec)) || null),
    remove: jest.fn(async artifact => { installed.delete(keyOf(artifact)); }),
  } as unknown as ModelArtifactStore;
}

describe('ModelLibraryService', () => {
  it('supports installing models, assigning one per task slot, and removing unassigned models', async () => {
    const settings = createSettings();
    const artifacts = createArtifactManager();
    const library = new ModelLibraryService(catalog, artifacts, settings);

    await library.installModel('minilm-intent', '1.0.0').promise;
    await library.installModel('smollm2-extractor', '1.0.0').promise;
    await library.installModel('mobilebert-category', '1.0.0').promise;
    await library.selectModel('smollm2-extractor', '1.0.0');

    await expect(library.removeModel('smollm2-extractor', '1.0.0'))
      .rejects.toThrow('Clear or reassign');
    await library.selectModel('minilm-intent', '1.0.0');
    await library.selectModel('mobilebert-category', '1.0.0');
    await library.setDeterministicOnly();
    await library.removeModel('minilm-intent', '1.0.0');

    await expect(library.listModels()).resolves.toEqual([
      { ...catalog[0], installed: false, active: false, assignedSlot: null },
      { ...catalog[1], installed: true, active: false, assignedSlot: null },
      { ...catalog[2], installed: true, active: false, assignedSlot: null },
    ]);
    expect(settings.getModelLibraryPreferences()).toEqual({
      installedModels: [
        { id: 'smollm2-extractor', version: '1.0.0' },
        { id: 'mobilebert-category', version: '1.0.0' },
      ],
      assignments: { intent: null, category: null, extraction: null },
      activeModel: null,
    });
  });

  it('does not allow selecting an artifact that is not installed and verified', async () => {
    const library = new ModelLibraryService(catalog, createArtifactManager(), createSettings());
    await expect(library.selectModel('minilm-intent', '1.0.0'))
      .rejects.toThrow('Install and verify');
  });

  it('rejects a catalog runtime and format mismatch', () => {
    expect(() => new ModelLibraryService([
      { ...catalog[0], runtime: 'llama_cpp' },
    ], createArtifactManager(), createSettings())).toThrow('do not match');
  });

  it('keeps task assignments independent and rejects assigning a model to the wrong slot', async () => {
    const artifacts = createArtifactManager();
    const library = new ModelLibraryService(catalog, artifacts, createSettings());
    await library.installModel('minilm-intent', '1.0.0').promise;
    await library.installModel('mobilebert-category', '1.0.0').promise;
    await library.selectModel('minilm-intent', '1.0.0');
    await library.selectModel('mobilebert-category', '1.0.0');

    await expect(library.selectModel('minilm-intent', '1.0.0', 'category'))
      .rejects.toThrow('only compatible with the intent slot');
    await expect(library.listModels()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'minilm-intent', assignedSlot: 'intent' }),
      expect.objectContaining({ id: 'mobilebert-category', assignedSlot: 'category' }),
    ]));
  });

  it('migrates an installed legacy active model to the slot defined by catalog metadata', async () => {
    const settings = createSettings({
      local_ai_model_library: JSON.stringify({
        installedModels: [{ id: 'smollm2-extractor', version: '1.0.0' }],
        activeModel: { id: 'smollm2-extractor', version: '1.0.0' },
      }),
    });
    const artifacts = createArtifactManager();
    await artifacts.install(catalog[1]).promise;
    const library = new ModelLibraryService(catalog, artifacts, settings);
    expect(library).toBeInstanceOf(ModelLibraryService);

    expect(settings.getModelLibraryPreferences()).toEqual({
      installedModels: [{ id: 'smollm2-extractor', version: '1.0.0' }],
      assignments: {
        intent: null,
        category: null,
        extraction: { id: 'smollm2-extractor', version: '1.0.0' },
      },
      activeModel: null,
    });
  });
});
