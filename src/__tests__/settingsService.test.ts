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
});
