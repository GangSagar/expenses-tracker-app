import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
} from 'react-native';
import { useSecurityStore } from '../../../hooks/useSecurityStore';

interface PinSetupModalProps {
  visible: boolean;
  mode: 'setup' | 'change' | 'disable';
  onClose: () => void;
  onSuccess?: () => void;
}

const PIN_LENGTH = 4;

export default function PinSetupModal({
  visible,
  mode,
  onClose,
  onSuccess,
}: PinSetupModalProps) {
  const { setNewPin, changePin, disableAppLock, unlockWithPin } = useSecurityStore();

  // Steps:
  // 'setup': 1 (enter new) -> 2 (confirm new)
  // 'change': 0 (enter current) -> 1 (enter new) -> 2 (confirm new)
  // 'disable': 0 (enter current)
  const initialStep = mode === 'setup' ? 1 : 0;
  const [step, setStep] = useState(initialStep);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const shakeAnim = useRef(new Animated.Value(0)).current;

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const resetState = () => {
    setStep(mode === 'setup' ? 1 : 0);
    setCurrentPinInput('');
    setNewPinInput('');
    setConfirmPinInput('');
    setErrorMsg('');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const getActivePin = () => {
    if (step === 0) return currentPinInput;
    if (step === 1) return newPinInput;
    return confirmPinInput;
  };

  const getStepTitle = () => {
    if (step === 0) {
      return mode === 'disable' ? 'Enter PIN to Disable Lock' : 'Enter Current PIN';
    }
    if (step === 1) {
      return mode === 'change' ? 'Enter New 4-Digit PIN' : 'Create a 4-Digit PIN';
    }
    return 'Confirm Your 4-Digit PIN';
  };

  const handleKeyPress = (num: string) => {
    const currentVal = getActivePin();
    if (currentVal.length >= PIN_LENGTH) return;
    const nextVal = currentVal + num;
    setErrorMsg('');

    if (step === 0) {
      setCurrentPinInput(nextVal);
      if (nextVal.length === PIN_LENGTH) {
        setTimeout(() => {
          // Verify current PIN
          const isValid = unlockWithPin(nextVal);
          if (!isValid) {
            triggerShake();
            setErrorMsg('Current PIN is incorrect');
            setTimeout(() => setCurrentPinInput(''), 300);
          } else {
            if (mode === 'disable') {
              disableAppLock(nextVal);
              Alert.alert('App Lock Disabled', 'Security lock has been turned off.');
              handleClose();
              onSuccess?.();
            } else {
              setStep(1);
            }
          }
        }, 50);
      }
    } else if (step === 1) {
      setNewPinInput(nextVal);
      if (nextVal.length === PIN_LENGTH) {
        setTimeout(() => {
          setStep(2);
        }, 150);
      }
    } else if (step === 2) {
      setConfirmPinInput(nextVal);
      if (nextVal.length === PIN_LENGTH) {
        setTimeout(() => {
          if (nextVal !== newPinInput) {
            triggerShake();
            setErrorMsg('PINs do not match. Please try again.');
            setTimeout(() => {
              setNewPinInput('');
              setConfirmPinInput('');
              setStep(1);
            }, 500);
          } else {
            // Success! Save PIN
            if (mode === 'setup') {
              setNewPin(nextVal);
              Alert.alert('PIN Created', 'Your personal app lock PIN is now active.');
            } else if (mode === 'change') {
              changePin(currentPinInput, nextVal);
              Alert.alert('PIN Changed', 'Your personal app lock PIN has been updated.');
            }
            handleClose();
            onSuccess?.();
          }
        }, 50);
      }
    }
  };

  const handleDelete = () => {
    if (step === 0 && currentPinInput.length > 0) {
      setCurrentPinInput(currentPinInput.slice(0, -1));
    } else if (step === 1 && newPinInput.length > 0) {
      setNewPinInput(newPinInput.slice(0, -1));
    } else if (step === 2 && confirmPinInput.length > 0) {
      setConfirmPinInput(confirmPinInput.slice(0, -1));
    }
    setErrorMsg('');
  };

  const activePin = getActivePin();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{getStepTitle()}</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Dots Indicator */}
          <Animated.View
            style={[
              styles.dotsContainer,
              { transform: [{ translateX: shakeAnim }] },
            ]}
          >
            {Array.from({ length: PIN_LENGTH }).map((_, index) => {
              const isFilled = index < activePin.length;
              return (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    isFilled && styles.dotFilled,
                    Boolean(errorMsg) && styles.dotError,
                  ]}
                />
              );
            })}
          </Animated.View>

          {errorMsg ? (
            <Text style={styles.errorText}>{errorMsg}</Text>
          ) : (
            <Text style={styles.subtext}>
              {step === 2 ? 'Re-enter your PIN to verify' : 'Remember this PIN to unlock SpendWise'}
            </Text>
          )}

          {/* Numpad */}
          <View style={styles.keypad}>
            {[
              ['1', '2', '3'],
              ['4', '5', '6'],
              ['7', '8', '9'],
              ['', '0', '⌫'],
            ].map((row, rIdx) => (
              <View key={rIdx} style={styles.keypadRow}>
                {row.map((item, cIdx) => {
                  if (item === '') {
                    return <View key={cIdx} style={styles.keyEmpty} />;
                  }
                  if (item === '⌫') {
                    return (
                      <TouchableOpacity
                        key={cIdx}
                        style={[styles.keyButton, styles.deleteKey]}
                        activeOpacity={0.6}
                        onPress={handleDelete}
                      >
                        <Text style={styles.deleteText}>⌫</Text>
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity
                      key={cIdx}
                      style={styles.keyButton}
                      activeOpacity={0.6}
                      onPress={() => handleKeyPress(item)}
                    >
                      <Text style={styles.keyText}>{item}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingBottom: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#374151',
  },
  header: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f9fafb',
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 18,
    color: '#9ca3af',
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    marginVertical: 12,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginHorizontal: 10,
    borderWidth: 2,
    borderColor: '#4b5563',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: '#1a73e8',
    borderColor: '#60a5fa',
    transform: [{ scale: 1.1 }],
  },
  dotError: {
    backgroundColor: '#ef4444',
    borderColor: '#f87171',
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 16,
  },
  subtext: {
    color: '#9ca3af',
    fontSize: 13,
    marginBottom: 16,
  },
  keypad: {
    width: '100%',
    maxWidth: 290,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  keyButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#1f2937',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteKey: {
    backgroundColor: 'transparent',
  },
  keyEmpty: {
    width: 68,
    height: 68,
  },
  keyText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#f9fafb',
  },
  deleteText: {
    fontSize: 20,
    color: '#9ca3af',
    fontWeight: '700',
  },
});
