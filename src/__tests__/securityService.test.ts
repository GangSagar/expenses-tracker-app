import {
  sha256,
  generateSalt,
  hashPin,
  verifyPinHash,
  createSecurityService,
  DEFAULT_LOCK_TIMEOUT_MS,
  SECURITY_SETTING_KEYS,
} from '../services/security/securityService';

const store: Record<string, string> = {};
const settings = {
  get: jest.fn((key: string, defaultValue = '') => store[key] ?? defaultValue),
  set: jest.fn((key: string, value: string) => { store[key] = value; }),
};
const deviceAuth = {
  getStatus: jest.fn(async () => ({ isAvailable: false, hasBiometrics: false, isDeviceSecure: false })),
  authenticate: jest.fn(async () => false),
  cancelAuthentication: jest.fn(async () => false),
  setSecureFlag: jest.fn(async () => false),
};
let security: ReturnType<typeof createSecurityService>;

describe('securityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(store).forEach(key => delete store[key]);
    security = createSecurityService(settings, deviceAuth);
  });

  describe('sha256', () => {
    it('produces standard SHA-256 hash output', () => {
      // Known standard SHA-256 test vectors:
      // sha256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
      expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

      // sha256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
      expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });
  });

  describe('generateSalt', () => {
    it('generates random alphanumeric string of requested length', () => {
      const salt1 = generateSalt(16);
      const salt2 = generateSalt(16);
      expect(salt1).toHaveLength(16);
      expect(salt2).toHaveLength(16);
      expect(salt1).not.toBe(salt2);
    });
  });

  describe('hashPin & verifyPinHash', () => {
    it('correctly hashes and verifies identical PIN with salt', () => {
      const salt = 'randomSalt123456';
      const pin = '1234';
      const hash = hashPin(pin, salt);

      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64);
      expect(verifyPinHash(pin, salt, hash)).toBe(true);
      expect(verifyPinHash('9999', salt, hash)).toBe(false);
      expect(verifyPinHash('', salt, hash)).toBe(false);
    });
  });

  describe('persistence functions', () => {
    it('saves PIN and sets app lock to true', () => {
      const { salt, hash } = security.savePin('4321');
      expect(salt).toBeDefined();
      expect(hash).toBeDefined();
      expect(settings.set).toHaveBeenCalledWith(SECURITY_SETTING_KEYS.APP_LOCK_PIN_SALT, salt);
      expect(settings.set).toHaveBeenCalledWith(SECURITY_SETTING_KEYS.APP_LOCK_PIN_HASH, hash);
      expect(settings.set).toHaveBeenCalledWith(SECURITY_SETTING_KEYS.APP_LOCK_ENABLED, 'true');

      const loaded = security.loadPersistedSecuritySettings();
      expect(loaded.hasPinSet).toBe(true);
      expect(loaded.isAppLockEnabled).toBe(true);
      expect(loaded.pinSalt).toBe(salt);
      expect(loaded.pinHash).toBe(hash);
      expect(loaded.lockTimeout).toBe(DEFAULT_LOCK_TIMEOUT_MS);
    });

    it('clears PIN and disables app lock', () => {
      security.savePin('1234');
      security.clearPin();

      const loaded = security.loadPersistedSecuritySettings();
      expect(loaded.hasPinSet).toBe(false);
      expect(loaded.isAppLockEnabled).toBe(false);
      expect(loaded.isBiometricEnabled).toBe(false);
    });

    it('toggles biometric and timeout settings', () => {
      security.setBiometricSetting(true);
      expect(settings.set).toHaveBeenCalledWith(SECURITY_SETTING_KEYS.APP_LOCK_BIOMETRIC_ENABLED, 'true');

      security.setLockTimeoutSetting(60000);
      expect(settings.set).toHaveBeenCalledWith(SECURITY_SETTING_KEYS.APP_LOCK_TIMEOUT_MS, '60000');

      const loaded = security.loadPersistedSecuritySettings();
      expect(loaded.isBiometricEnabled).toBe(true);
      expect(loaded.lockTimeout).toBe(60000);
    });
  });

  describe('native biometric graceful fallback', () => {
    it('returns false/unavailable when SecurityModule is not present', async () => {
      const status = await security.checkDeviceAuthAvailable();
      expect(status.isAvailable).toBe(false);

      const authResult = await security.authenticateWithBiometrics();
      expect(authResult).toBe(false);
    });
  });
});
