import React, { useEffect, useRef, useState } from 'react';
import { View, Text, AppState, AppStateStatus, StyleSheet } from 'react-native';
import { useSecurityStore } from '../../../hooks/useSecurityStore';
import LockScreen from './LockScreen';

interface SecurityGateProps {
  children: React.ReactNode;
}

export default function SecurityGate({ children }: SecurityGateProps) {
  const {
    isAppLockEnabled,
    isLocked,
    initSecurity,
    recordBackgroundTime,
    checkAutoLockOnResume,
  } = useSecurityStore();

  const [isBackgrounded, setIsBackgrounded] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState || 'active');

  // Initialize security settings on app launch
  useEffect(() => {
    initSecurity();
  }, [initSecurity]);

  // Handle app lifecycle for auto-lock and privacy obscuring
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const prevAppState = appStateRef.current;
      const isNextBackground = typeof nextAppState === 'string' && /inactive|background/.test(nextAppState);
      const isPrevActive = prevAppState === 'active';

      if (isNextBackground) {
        // App went to background / recent apps switcher
        setIsBackgrounded(true);
        if (isPrevActive) {
          recordBackgroundTime();
        }
      } else if (nextAppState === 'active') {
        // App returned to foreground
        setIsBackgrounded(false);
        checkAutoLockOnResume();
      }

      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [recordBackgroundTime, checkAutoLockOnResume]);

  return (
    <View style={styles.container}>
      {/* App content: hidden from rendering and accessibility when locked */}
      <View
        style={[
          styles.contentContainer,
          isAppLockEnabled && isLocked && styles.hiddenContent,
        ]}
        pointerEvents={isAppLockEnabled && isLocked ? 'none' : 'auto'}
        accessibilityElementsHidden={isAppLockEnabled && isLocked}
        importantForAccessibility={isAppLockEnabled && isLocked ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>

      {/* Privacy shield for Recent Apps switcher when app is in background and unlocked */}
      {isAppLockEnabled && !isLocked && isBackgrounded && (
        <View style={styles.privacyShield}>
          <View style={styles.shieldIconCircle}>
            <Text style={styles.shieldIcon}>🔒</Text>
          </View>
          <Text style={styles.shieldTitle}>SpendWise</Text>
        </View>
      )}

      {/* Interactive lock screen overlay when app is locked */}
      {isAppLockEnabled && isLocked && <LockScreen />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
  },
  hiddenContent: {
    display: 'none',
  },
  privacyShield: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0a101d',
    zIndex: 999999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shieldIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(26, 115, 232, 0.2)',
    borderWidth: 1.5,
    borderColor: 'rgba(26, 115, 232, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  shieldIcon: {
    fontSize: 32,
  },
  shieldTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
