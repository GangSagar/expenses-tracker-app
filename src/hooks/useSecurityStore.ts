import { create } from 'zustand';
import {
  loadPersistedSecuritySettings,
  savePin,
  clearPin,
  verifyPinHash,
  setBiometricSetting,
  setLockTimeoutSetting,
  setAppLockEnabledSetting,
  checkDeviceAuthAvailable,
  authenticateWithBiometrics,
  DeviceAuthStatus,
  DEFAULT_LOCK_TIMEOUT_MS,
} from '../services/securityService';

interface SecurityState {
  isLocked: boolean;
  isAppLockEnabled: boolean;
  hasPinSet: boolean;
  isBiometricEnabled: boolean;
  lockTimeout: number; // in milliseconds
  deviceAuthStatus: DeviceAuthStatus;
  lastBackgroundTime: number | null;
  initialized: boolean;

  // Actions
  initSecurity: () => Promise<void>;
  unlockWithPin: (pin: string) => boolean;
  unlockWithBiometrics: () => Promise<boolean>;
  setNewPin: (pin: string) => void;
  enableAppLock: () => void;
  changePin: (currentPin: string, newPin: string) => boolean;
  disableAppLock: (currentPin: string) => boolean;
  toggleBiometric: (enabled: boolean) => void;
  setLockTimeout: (timeoutMs: number) => void;
  lockApp: () => void;
  recordBackgroundTime: () => void;
  checkAutoLockOnResume: () => void;
}

const getInitialSettings = () => {
  try {
    return loadPersistedSecuritySettings();
  } catch {
    return {
      isAppLockEnabled: false,
      hasPinSet: false,
      isBiometricEnabled: false,
      lockTimeout: DEFAULT_LOCK_TIMEOUT_MS,
      pinHash: '',
      pinSalt: '',
    };
  }
};

const initialSettings = getInitialSettings();

export const useSecurityStore = create<SecurityState>((set, get) => ({
  isLocked: initialSettings.isAppLockEnabled && initialSettings.hasPinSet,
  isAppLockEnabled: initialSettings.isAppLockEnabled,
  hasPinSet: initialSettings.hasPinSet,
  isBiometricEnabled: initialSettings.isBiometricEnabled,
  lockTimeout: initialSettings.lockTimeout,
  deviceAuthStatus: {
    isAvailable: false,
    hasBiometrics: false,
    isDeviceSecure: false,
  },
  lastBackgroundTime: null,
  initialized: true,

  initSecurity: async () => {
    const settings = loadPersistedSecuritySettings();
    const deviceAuth = await checkDeviceAuthAvailable();

    set((state) => ({
      isAppLockEnabled: settings.isAppLockEnabled,
      hasPinSet: settings.hasPinSet,
      isBiometricEnabled: settings.isBiometricEnabled,
      lockTimeout: settings.lockTimeout,
      // Retain lock status if already locked or lock if required
      isLocked: settings.isAppLockEnabled && settings.hasPinSet ? state.isLocked : false,
      deviceAuthStatus: deviceAuth,
      initialized: true,
    }));
  },

  unlockWithPin: (pin: string) => {
    const settings = loadPersistedSecuritySettings();
    if (!settings.hasPinSet) {
      set({ isLocked: false });
      return true;
    }

    const isValid = verifyPinHash(pin, settings.pinSalt, settings.pinHash);
    if (isValid) {
      set({ isLocked: false, lastBackgroundTime: null });
      return true;
    }
    return false;
  },

  unlockWithBiometrics: async () => {
    const { isBiometricEnabled, deviceAuthStatus } = get();
    if (!isBiometricEnabled || !deviceAuthStatus.isAvailable) {
      return false;
    }

    const success = await authenticateWithBiometrics(
      'Unlock SpendWise',
      'Use fingerprint, face, or phone screen lock',
    );

    if (success) {
      set({ isLocked: false, lastBackgroundTime: null });
      return true;
    }
    return false;
  },

  setNewPin: (pin: string) => {
    savePin(pin);
    set({
      hasPinSet: true,
      isAppLockEnabled: true,
      isLocked: false,
    });
  },

  enableAppLock: () => {
    setAppLockEnabledSetting(true);
    set({ isAppLockEnabled: true });
  },

  changePin: (currentPin: string, newPin: string) => {
    const settings = loadPersistedSecuritySettings();
    if (!settings.hasPinSet) return false;

    const isValid = verifyPinHash(currentPin, settings.pinSalt, settings.pinHash);
    if (!isValid) return false;

    savePin(newPin);
    set({
      hasPinSet: true,
      isAppLockEnabled: true,
    });
    return true;
  },

  disableAppLock: (currentPin: string) => {
    const settings = loadPersistedSecuritySettings();
    if (!settings.hasPinSet) {
      clearPin();
      set({
        isAppLockEnabled: false,
        hasPinSet: false,
        isBiometricEnabled: false,
        isLocked: false,
      });
      return true;
    }

    const isValid = verifyPinHash(currentPin, settings.pinSalt, settings.pinHash);
    if (!isValid) return false;

    clearPin();
    set({
      isAppLockEnabled: false,
      hasPinSet: false,
      isBiometricEnabled: false,
      isLocked: false,
    });
    return true;
  },

  toggleBiometric: (enabled: boolean) => {
    setBiometricSetting(enabled);
    set({ isBiometricEnabled: enabled });
  },

  setLockTimeout: (timeoutMs: number) => {
    setLockTimeoutSetting(timeoutMs);
    set({ lockTimeout: timeoutMs });
  },

  lockApp: () => {
    const { isAppLockEnabled, hasPinSet } = get();
    if (isAppLockEnabled && hasPinSet) {
      set({ isLocked: true });
    }
  },

  recordBackgroundTime: () => {
    set({ lastBackgroundTime: Date.now() });
  },

  checkAutoLockOnResume: () => {
    const { isAppLockEnabled, hasPinSet, isLocked, lockTimeout, lastBackgroundTime } = get();
    if (!isAppLockEnabled || !hasPinSet || isLocked) {
      return;
    }

    if (lastBackgroundTime !== null) {
      const elapsed = Date.now() - lastBackgroundTime;
      if (elapsed >= lockTimeout) {
        set({ isLocked: true });
      }
    }
    set({ lastBackgroundTime: null });
  },
}));
