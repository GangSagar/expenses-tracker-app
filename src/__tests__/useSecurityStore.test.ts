import { useSecurityStore } from '../hooks/useSecurityStore';
import * as securityService from '../services/securityService';

jest.mock('../database/expenseRepo', () => {
  const store: Record<string, string> = {};
  return {
    getSetting: jest.fn((key: string, defaultValue: string = '') => {
      return store[key] !== undefined ? store[key] : defaultValue;
    }),
    setSetting: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    __store: store,
  };
});

describe('useSecurityStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const repo = require('../database/expenseRepo');
    for (const key of Object.keys(repo.__store)) {
      delete repo.__store[key];
    }
    useSecurityStore.setState({
      isLocked: false,
      isAppLockEnabled: false,
      hasPinSet: false,
      isBiometricEnabled: false,
      lockTimeout: 30000,
      lastBackgroundTime: null,
      initialized: false,
    });
  });

  it('initializes with default unlocked state when no PIN is stored', async () => {
    await useSecurityStore.getState().initSecurity();
    const state = useSecurityStore.getState();
    expect(state.initialized).toBe(true);
    expect(state.isAppLockEnabled).toBe(false);
    expect(state.hasPinSet).toBe(false);
    expect(state.isLocked).toBe(false);
  });

  it('sets new PIN and enables lock', () => {
    useSecurityStore.getState().setNewPin('1234');
    const state = useSecurityStore.getState();
    expect(state.hasPinSet).toBe(true);
    expect(state.isAppLockEnabled).toBe(true);
    expect(state.isLocked).toBe(false);

    // Verify unlockWithPin
    expect(useSecurityStore.getState().unlockWithPin('1234')).toBe(true);
    expect(useSecurityStore.getState().unlockWithPin('9999')).toBe(false);
  });

  it('locks the app on lockApp call when lock is enabled', () => {
    useSecurityStore.getState().setNewPin('5555');
    useSecurityStore.getState().lockApp();
    expect(useSecurityStore.getState().isLocked).toBe(true);

    // Unlock with valid PIN
    const unlocked = useSecurityStore.getState().unlockWithPin('5555');
    expect(unlocked).toBe(true);
    expect(useSecurityStore.getState().isLocked).toBe(false);
  });

  it('changes PIN when current PIN matches', () => {
    useSecurityStore.getState().setNewPin('1111');
    const failChange = useSecurityStore.getState().changePin('9999', '2222');
    expect(failChange).toBe(false);

    const successChange = useSecurityStore.getState().changePin('1111', '2222');
    expect(successChange).toBe(true);

    expect(useSecurityStore.getState().unlockWithPin('1111')).toBe(false);
    expect(useSecurityStore.getState().unlockWithPin('2222')).toBe(true);
  });

  it('disables app lock only with correct current PIN', () => {
    useSecurityStore.getState().setNewPin('4444');
    expect(useSecurityStore.getState().isAppLockEnabled).toBe(true);

    const failDisable = useSecurityStore.getState().disableAppLock('0000');
    expect(failDisable).toBe(false);
    expect(useSecurityStore.getState().isAppLockEnabled).toBe(true);

    const successDisable = useSecurityStore.getState().disableAppLock('4444');
    expect(successDisable).toBe(true);
    expect(useSecurityStore.getState().isAppLockEnabled).toBe(false);
    expect(useSecurityStore.getState().hasPinSet).toBe(false);
  });

  it('handles auto-lock timeout calculation properly', () => {
    useSecurityStore.getState().setNewPin('1234');
    useSecurityStore.getState().setLockTimeout(30000); // 30 seconds

    // 1. Sent to background 10 seconds ago (elapsed < timeout)
    useSecurityStore.setState({ lastBackgroundTime: Date.now() - 10000, isLocked: false });
    useSecurityStore.getState().checkAutoLockOnResume();
    expect(useSecurityStore.getState().isLocked).toBe(false);

    // 2. Sent to background 35 seconds ago (elapsed >= timeout)
    useSecurityStore.setState({ lastBackgroundTime: Date.now() - 35000, isLocked: false });
    useSecurityStore.getState().checkAutoLockOnResume();
    expect(useSecurityStore.getState().isLocked).toBe(true);
  });

  it('locks immediately when timeout is 0 (Immediate)', () => {
    useSecurityStore.getState().setNewPin('1234');
    useSecurityStore.getState().setLockTimeout(0); // Immediate

    useSecurityStore.setState({ lastBackgroundTime: Date.now() - 10, isLocked: false });
    useSecurityStore.getState().checkAutoLockOnResume();
    expect(useSecurityStore.getState().isLocked).toBe(true);
  });
});
