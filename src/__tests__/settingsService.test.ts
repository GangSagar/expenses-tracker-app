import { SettingsService } from '../services/settings/settingsService';

describe('SettingsService', () => {
  it('uses the existing persisted setting keys and defaults', () => {
    const values: Record<string, string> = {};
    const repository = {
      get: jest.fn((key: string, fallback = '') => values[key] ?? fallback),
      set: jest.fn((key: string, value: string) => { values[key] = value; }),
    };
    const service = new SettingsService(repository);

    expect(service.getMonthlyBudgetLimit()).toBe('20000');
    service.setMonthlyBudgetLimit('25000');
    service.setHiddenAccounts(['BANK::1234']);
    service.setIgnoredAnomalies(['BANK::1234::1::2']);
    service.setAccountType('BANK', '1234', 'cc');

    expect(service.getMonthlyBudgetLimit()).toBe('25000');
    expect(service.getHiddenAccounts()).toEqual(['BANK::1234']);
    expect(service.getIgnoredAnomalies()).toEqual(['BANK::1234::1::2']);
    expect(service.getAccountType('BANK', '1234')).toBe('cc');
  });

  it('returns an empty list for malformed or non-list stored values', () => {
    const repository = { get: jest.fn(() => '{bad'), set: jest.fn() };
    const service = new SettingsService(repository);
    expect(service.getHiddenAccounts()).toEqual([]);
  });

  it('persists multiple installed models and independent task assignments', () => {
    const values: Record<string, string> = {};
    const repository = {
      get: (key: string, fallback = '') => values[key] ?? fallback,
      set: (key: string, value: string) => { values[key] = value; },
    };
    const service = new SettingsService(repository);
    const library = {
      installedModels: [
        { id: 'minilm-intent', version: '1.0.0' },
        { id: 'smollm2-extractor', version: '1.0.0' },
        { id: 'mobilebert-category', version: '1.0.0' },
      ],
      assignments: {
        intent: { id: 'minilm-intent', version: '1.0.0' },
        category: { id: 'mobilebert-category', version: '1.0.0' },
        extraction: { id: 'smollm2-extractor', version: '1.0.0' },
      },
      activeModel: null,
    };

    service.setModelLibraryPreferences(library);

    expect(service.getModelLibraryPreferences()).toEqual(library);
    expect(service.getAIModelPreferences()).toEqual({ enabled: false, selectedModelId: null });
  });

  it('refuses a task assignment to a model that is not installed', () => {
    const repository = { get: jest.fn((_key: string, fallback = '') => fallback), set: jest.fn() };
    const service = new SettingsService(repository);

    expect(() => service.setModelLibraryPreferences({
      installedModels: [],
      assignments: {
        intent: null,
        category: null,
        extraction: { id: 'missing-model', version: '1.0' },
      },
      activeModel: { id: 'missing-model', version: '1.0' },
    })).toThrow('Assigned model must be present');
  });

  it('reads the previous single-active-model format for service-level migration', () => {
    const legacy = {
      installedModels: [{ id: 'smollm2-extractor', version: '1.0.0' }],
      activeModel: { id: 'smollm2-extractor', version: '1.0.0' },
    };
    const repository = {
      get: jest.fn((key: string, fallback = '') => key === 'local_ai_model_library' ? JSON.stringify(legacy) : fallback),
      set: jest.fn(),
    };

    expect(new SettingsService(repository).getModelLibraryPreferences()).toEqual({
      installedModels: legacy.installedModels,
      assignments: { intent: null, category: null, extraction: null },
      activeModel: legacy.activeModel,
    });
  });
});
