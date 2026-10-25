import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
  Alert,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSecurityStore } from '../hooks/useSecurityStore';

const PIN_LENGTH = 4;

export default function LockScreen() {
  const insets = useSafeAreaInsets();
  const {
    isBiometricEnabled,
    deviceAuthStatus,
    unlockWithPin,
    unlockWithBiometrics,
  } = useSecurityStore();

  const [enteredPin, setEnteredPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const hasAttemptedBiometrics = useRef(false);
  const isAuthenticatingRef = useRef(false);

  // Prevent hardware Back button from navigating back into the app while locked
  useEffect(() => {
    const onBackPress = () => {
      BackHandler.exitApp();
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, []);

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleBiometricAuth = useCallback(async () => {
    if (!isBiometricEnabled || !deviceAuthStatus.isAvailable || isAuthenticatingRef.current) return;
    try {
      isAuthenticatingRef.current = true;
      const success = await unlockWithBiometrics();
      if (success) {
        setErrorMessage('');
      }
    } catch (e) {
      console.log('[LockScreen] Biometric auth handled:', e);
    } finally {
      isAuthenticatingRef.current = false;
    }
  }, [isBiometricEnabled, deviceAuthStatus.isAvailable, unlockWithBiometrics]);

  // Auto-prompt biometrics once on mount if enabled and available
  useEffect(() => {
    if (isBiometricEnabled && deviceAuthStatus.isAvailable && !hasAttemptedBiometrics.current) {
      hasAttemptedBiometrics.current = true;
      const timer = setTimeout(() => {
        handleBiometricAuth();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isBiometricEnabled, deviceAuthStatus.isAvailable, handleBiometricAuth]);

  const handleKeyPress = (num: string) => {
    if (enteredPin.length >= PIN_LENGTH) return;
    const newPin = enteredPin + num;
    setEnteredPin(newPin);
    setErrorMessage('');

    if (newPin.length === PIN_LENGTH) {
      // Validate PIN
      setTimeout(() => {
        const success = unlockWithPin(newPin);
        if (!success) {
          triggerShake();
          setErrorMessage('Incorrect PIN. Please try again.');
          setTimeout(() => {
            setEnteredPin('');
          }, 350);
        }
      }, 50);
    }
  };

  const handleDelete = () => {
    if (enteredPin.length > 0) {
      setEnteredPin(enteredPin.slice(0, -1));
      setErrorMessage('');
    }
  };

  const handleForgotPin = () => {
    if (isBiometricEnabled && deviceAuthStatus.isAvailable) {
      handleBiometricAuth();
    } else {
      Alert.alert(
        'Forgot PIN?',
        'If you forgot your PIN, you can unlock using your phone screen lock or biometric credentials if enabled. Otherwise, reinstalling the app or contacting support will reset settings.',
        [{ text: 'OK' }],
      );
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0a101d" />

      {/* Brand Header */}
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconEmoji}>🔒</Text>
        </View>
        <Text style={styles.appName}>SpendWise</Text>
        <Text style={styles.lockTitle}>Enter Your 4-Digit PIN</Text>
      </View>

      {/* PIN Dots Indicator */}
      <View style={styles.dotsSection}>
        <Animated.View
          style={[
            styles.dotsContainer,
            { transform: [{ translateX: shakeAnim }] },
          ]}
        >
          {Array.from({ length: PIN_LENGTH }).map((_, index) => {
            const isFilled = index < enteredPin.length;
            const isError = Boolean(errorMessage);
            return (
              <View
                key={index}
                style={[
                  styles.dot,
                  isFilled && styles.dotFilled,
                  isError && styles.dotError,
                ]}
              />
            );
          })}
        </Animated.View>

        {errorMessage ? (
          <Text style={styles.errorText}>{errorMessage}</Text>
        ) : (
          <Text style={styles.hintText}>Keep your financial data safe</Text>
        )}
      </View>

      {/* Numpad */}
      <View style={styles.keypad}>
        {/* Row 1 */}
        <View style={styles.keypadRow}>
          {['1', '2', '3'].map((num) => (
            <TouchableOpacity
              key={num}
              style={styles.keyButton}
              activeOpacity={0.65}
              onPress={() => handleKeyPress(num)}
            >
              <Text style={styles.keyText}>{num}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Row 2 */}
        <View style={styles.keypadRow}>
          {['4', '5', '6'].map((num) => (
            <TouchableOpacity
              key={num}
              style={styles.keyButton}
              activeOpacity={0.65}
              onPress={() => handleKeyPress(num)}
            >
              <Text style={styles.keyText}>{num}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Row 3 */}
        <View style={styles.keypadRow}>
          {['7', '8', '9'].map((num) => (
            <TouchableOpacity
              key={num}
              style={styles.keyButton}
              activeOpacity={0.65}
              onPress={() => handleKeyPress(num)}
            >
              <Text style={styles.keyText}>{num}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Row 4 */}
        <View style={styles.keypadRow}>
          {isBiometricEnabled && deviceAuthStatus.isAvailable ? (
            <TouchableOpacity
              style={[styles.keyButton, styles.specialKeyButton]}
              activeOpacity={0.65}
              onPress={handleBiometricAuth}
            >
              <Text style={styles.biometricIcon}>👆</Text>
              <Text style={styles.biometricSubtext}>Biometric</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.keyButtonEmpty} />
          )}

          <TouchableOpacity
            style={styles.keyButton}
            activeOpacity={0.65}
            onPress={() => handleKeyPress('0')}
          >
            <Text style={styles.keyText}>0</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.keyButton, styles.specialKeyButton]}
            activeOpacity={0.65}
            onPress={handleDelete}
          >
            <Text style={styles.deleteIcon}>⌫</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom links */}
      <View style={styles.footer}>
        <TouchableOpacity onPress={handleForgotPin} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.forgotText}>
            {isBiometricEnabled && deviceAuthStatus.isAvailable
              ? 'Unlock using Device Screen Lock'
              : 'Forgot PIN?'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0a101d',
    zIndex: 99999,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginTop: 24,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(26, 115, 232, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(26, 115, 232, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconEmoji: {
    fontSize: 28,
  },
  appName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  lockTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94a3b8',
    marginTop: 6,
  },
  dotsSection: {
    alignItems: 'center',
    marginVertical: 12,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginHorizontal: 12,
    borderWidth: 2,
    borderColor: '#475569',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: '#1a73e8',
    borderColor: '#60a5fa',
    transform: [{ scale: 1.15 }],
  },
  dotError: {
    backgroundColor: '#ef4444',
    borderColor: '#f87171',
  },
  errorText: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
    color: '#f87171',
  },
  hintText: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748b',
  },
  keypad: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
  },
  keyButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  specialKeyButton: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
  },
  keyButtonEmpty: {
    width: 76,
    height: 76,
  },
  keyText: {
    fontSize: 28,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  biometricIcon: {
    fontSize: 26,
  },
  biometricSubtext: {
    fontSize: 9,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '600',
  },
  deleteIcon: {
    fontSize: 24,
    color: '#94a3b8',
    fontWeight: '700',
  },
  footer: {
    marginTop: 8,
    alignItems: 'center',
  },
  forgotText: {
    fontSize: 13,
    color: '#60a5fa',
    fontWeight: '600',
  },
});
