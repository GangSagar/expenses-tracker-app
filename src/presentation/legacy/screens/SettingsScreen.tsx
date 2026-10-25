import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
  Modal,
  TextInput,
  Platform,
  PermissionsAndroid,
  KeyboardAvoidingView,
  NativeModules,
  Keyboard,
  Switch,
} from 'react-native';
import styles from '../styles/SettingsScreenStyles';
import { useExpenseStore } from '../../../hooks/useExpenses';
import { useSecurityStore } from '../../../hooks/useSecurityStore';
import { authenticateWithBiometrics } from '../../../services/securityService';
import PinSetupModal from '../components/PinSetupModal';

import {
  getSetting,
  setSetting,
} from '../../../database/expenseRepo';
import commonStyles from '../styles/commonStyles';
import CalendarModal from '../components/CalendarModal';
import {
  createTransactionDedupCache,
  clearTransactionData,
  importHistoricalTransactions,
  previewHistoricalMessage,
} from '../../../services/transactions/transactionApplication';
import { resetSpamClassifier } from '../../../core/classifier/spamClassifier';
import { resetMerchantMap } from '../../../core/classifier/merchantMap';

const { MessageModule } = NativeModules;

function toImportCandidate(transaction: any) {
  const candidate = { ...transaction };
  delete candidate.tempId;
  delete candidate.checked;
  delete candidate.decision;
  delete candidate.possibleDuplicate;
  delete candidate.duplicateMatch;
  return candidate;
}

export default function SettingsScreen() {
  const { exportExpenses, importExpenses, loadExpenses, runDeduplication } =
    useExpenseStore();
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [jsonInput, setJsonInput] = useState('');

  // Security & App Lock State
  const {
    isAppLockEnabled,
    hasPinSet,
    isBiometricEnabled,
    lockTimeout,
    deviceAuthStatus,
    toggleBiometric,
    setLockTimeout,
    enableAppLock,
  } = useSecurityStore();
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<'setup' | 'change' | 'disable'>('setup');

  const handleToggleAppLock = (enable: boolean) => {
    if (enable) {
      if (!hasPinSet) {
        setPinModalMode('setup');
        setPinModalVisible(true);
      } else {
        enableAppLock();
      }
    } else {
      setPinModalMode('disable');
      setPinModalVisible(true);
    }
  };

  const handleToggleBiometric = async (enable: boolean) => {
    if (enable) {
      const verified = await authenticateWithBiometrics(
        'Verify Identity',
        'Confirm fingerprint, face, or phone lock to enable',
      );
      if (verified) {
        toggleBiometric(true);
      } else {
        Alert.alert('Verification Failed', 'Could not verify biometric credentials.');
      }
    } else {
      toggleBiometric(false);
    }
  };

  // SMS History Sync State
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [keyboardSpace, setKeyboardSpace] = useState(0);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [proposedTransactions, setProposedTransactions] = useState<any[]>([]);

  // Real-time terminal logging states for past sync flow
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [syncProgressPct, setSyncProgressPct] = useState(0);
  const [processedCounts, setProcessedCounts] = useState({ found: 0, dups: 0, junk: 0 });
  const [syncStatus, setSyncStatus] = useState<'idle' | 'scanning' | 'scan_done' | 'importing' | 'import_done'>('idle');
  const logsScrollViewRef = React.useRef<ScrollView>(null);

  const requestSmsPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    try {
      const hasPermission = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_SMS,
      );
      if (hasPermission) return true;

      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_SMS,
        {
          title: 'SMS Permission Required',
          message:
            'Expense Tracker needs access to your SMS to import past transactions.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn(err);
      return false;
    }
  };

  const handleProceedToPreview = () => {
    setSyncing(false);
    setPreviewVisible(true);
  };

  const handleCloseScanner = () => {
    setSyncing(false);
    setSyncStatus('idle');
    setSyncLogs([]);
  };

  const handleFinishImport = () => {
    setSyncing(false);
    setSyncStatus('idle');
    setSyncLogs([]);
    setProposedTransactions([]);
  };

  const handleSyncHistory = async (startTs: number | null) => {
    setCalendarVisible(false);
    if (!startTs) return;

    // 1. Request SMS Permission
    const hasSmsPermission = await requestSmsPermission();
    if (!hasSmsPermission) {
      Alert.alert(
        'Permission Denied',
        'SMS reading permission is required to import past transactions.',
      );
      return;
    }

    const startDateString = new Date(startTs).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    setSyncing(true);
    setSyncStatus('scanning');
    setSyncProgress('Querying SMS inbox...');
    setSyncProgressPct(0);
    setSyncLogs([
      `🔍 Initializing secure ledger scanner...`,
      `📅 Target: Fetching inbox messages since ${startDateString}`,
    ]);
    setProcessedCounts({ found: 0, dups: 0, junk: 0 });

    try {
      // 2. Fetch all historical SMS messages since selected start date
      // This single fetch query is safe and fully compatible across all devices
      const pageJson = await MessageModule.fetchPastMessages(startTs);
      const rawList =
        typeof pageJson === 'string' ? JSON.parse(pageJson) : pageJson;

      if (!rawList || rawList.length === 0) {
        if (__DEV__) {
          setSyncStatus('scan_done');
          setSyncProgressPct(100);
          setSyncProgress('Inbox query complete.');
          setSyncLogs(prev => [
            ...prev,
            `⚠️ No transactional SMS messages found in the selected date range.`,
          ]);
        } else {
          setSyncing(false);
          setSyncStatus('idle');
          Alert.alert(
            'Already Synced',
            'No transactional SMS messages found in your inbox for this date range.',
          );
        }
        return;
      }

      setSyncProgress(`Preparing scan...`);
      if (__DEV__) {
        setSyncLogs(prev => [
          ...prev,
          `📥 Inbox scanned successfully. Found ${rawList.length} messages.`,
          `⚙️ Running transaction extraction algorithms...`,
        ]);
      }

      // High-performance in-memory deduplication index (1 SQL query instead of 3 queries per SMS)
      const dedupCache = createTransactionDedupCache();

      const proposed: any[] = [];
      let tempCounter = 0;
      let found = 0;
      let dups = 0;
      let junk = 0;

      const appendLog = (logText: string) => {
        if (!__DEV__) return;
        setSyncLogs(prev => {
          const next = [...prev, logText];
          return next.length > 50 ? next.slice(-40) : next;
        });
      };

      for (let i = 0; i < rawList.length; i++) {
        const msg = rawList[i];
        const isLast = i === rawList.length - 1;

        // Yield to event loop and update progress every 40 messages to maintain fluid 60 FPS
        if (i % 40 === 0 || isLast) {
          const progressPct = Math.round(((i + 1) / rawList.length) * 100);
          setSyncProgressPct(progressPct);
          setSyncProgress(`Scanning: ${i + 1} of ${rawList.length} (${progressPct}%)`);
          setProcessedCounts({ found, dups, junk });
          await new Promise<void>(resolve => setTimeout(resolve, 0));
        }

        const processed = await previewHistoricalMessage({
          body: msg.body,
          sender: msg.sender,
          source: 'sms',
          timestamp: msg.timestamp,
        }, dedupCache);
        const candidate = processed.candidate;

        if (candidate && processed.decision.kind !== 'reject') {

          // O(1) in-memory check (0.0001 ms)
          if (processed.duplicate) {
            dups++;
            if (i % 5 === 0) {
              appendLog(`🛡️ Dup: Skip ₹${candidate.amount.toFixed(2)} at ${candidate.merchant || 'Merchant'}`);
            }
          } else {
            proposed.push({
              ...candidate,
              tempId: `temp_${Date.now()}_${tempCounter++}`,
              checked: !processed.possibleDuplicate,
              possibleDuplicate: processed.possibleDuplicate,
              decision: processed.decision.kind,
            });
            found++;
            appendLog(`✅ Found: ₹${candidate.amount.toFixed(2)} at ${candidate.merchant} (${candidate.bank || 'Bank'})`);
          }
        } else {
          junk++;
          if (i % 20 === 0) {
            appendLog(`⏭️ Skip: Non-transactional alert from ${msg.sender}`);
          }
        }
      }

      setProposedTransactions(proposed);

      if (__DEV__) {
        setSyncProgressPct(100);
        setSyncProgress(`Scan complete. ${found} new transactions ready for preview.`);
        setSyncLogs(prev => [
          ...prev,
          `\n🎉 Scanning Complete!`,
          `📊 Summary: Found ${found} new, filtered ${dups} duplicates, skipped ${junk} non-txn items.`,
        ]);
        setSyncStatus('scan_done');
      } else {
        // Instant skip in production!
        setSyncing(false);
        setSyncStatus('idle');
        if (proposed.length === 0) {
          Alert.alert(
            'Already Synced',
            'No new transactions were found. All transactional records since this date are already in your ledger!',
          );
        } else {
          setPreviewVisible(true);
        }
      }
    } catch (err: any) {
      console.error('History sync failed:', err);
      if (__DEV__) {
        setSyncProgress('Scan failed.');
        setSyncLogs(prev => [
          ...prev,
          `\n❌ Scan process aborted with error: ${err.message || 'Unknown error'}`,
        ]);
        setSyncStatus('scan_done');
      } else {
        setSyncing(false);
        setSyncStatus('idle');
        Alert.alert(
          'Sync Failed',
          err.message || 'An error occurred during transaction sync.',
        );
      }
    }
  };

  const handleApproveSync = async () => {
    setPreviewVisible(false);

    if (!__DEV__) {
      // Instant SQLite writes in production!
      try {
        const toImport = proposedTransactions.filter(tx => tx.checked).map(toImportCandidate);
        setSyncing(true);
        const results = await importHistoricalTransactions(toImport);
        const importedCount = results.filter(row => row.status === 'imported').length;
        const failedCount = results.filter(row => row.status === 'failed').length;
        const failedCandidates = results.filter(row => row.status === 'failed').map(row => row.candidate);
        loadExpenses();
        setProposedTransactions(failedCount ? proposedTransactions.filter(tx =>
          failedCandidates.some(candidate => candidate.rawMessage === tx.rawMessage && candidate.timestamp === tx.timestamp),
        ).map(tx => ({ ...tx, checked: true })) : []);
        setPreviewVisible(failedCount > 0);
        setSyncing(false);
        Alert.alert(
          failedCount ? 'Sync Partially Complete' : 'Sync Complete',
          `Imported ${importedCount} transactions${failedCount ? `; ${failedCount} failed and can be retried` : ''}.`,
        );
      } catch (err: any) {
        setSyncing(false);
        Alert.alert('Import Failed', err.message || 'Failed to save transactions.');
      }
      return;
    }

    // Interactive CLI terminal stream in development!
    setSyncing(true);
    setSyncStatus('importing');
    setSyncProgressPct(0);
    setSyncProgress('Preparing SQLite transaction import...');

    try {
      const toImport = proposedTransactions.filter(tx => tx.checked);
      setSyncLogs(prev => [
        ...prev,
        `\n💾 COMMITTING ${toImport.length} SELECTED TRANSACTIONS TO SQLITE DATABASE...`,
      ]);

      const candidates = toImport.map(toImportCandidate);
      let count = 0;
      const results = await importHistoricalTransactions(candidates, (row, completed, total) => {
        if (row.status === 'imported') count++;
        const pct = total ? Math.round((completed / total) * 100) : 100;
        setSyncProgressPct(pct);
        setSyncProgress(`Processed: ${completed} of ${total}; ${count} imported (${pct}%)`);
        if (row.status === 'failed') setSyncLogs(prev => [...prev, `❌ Failed ₹${row.candidate.amount} at ${row.candidate.merchant}: ${row.message}`]);
        else if (row.status === 'imported') setSyncLogs(prev => [...prev, `💾 Saved ₹${row.candidate.amount} at ${row.candidate.merchant}`]);
      });
      const failures = results.filter(row => row.status === 'failed').length;
      const failedCandidates = results.filter(row => row.status === 'failed').map(row => row.candidate);
      setProposedTransactions(failures ? proposedTransactions.filter(tx =>
        failedCandidates.some(candidate => candidate.rawMessage === tx.rawMessage && candidate.timestamp === tx.timestamp),
      ).map(tx => ({ ...tx, checked: true })) : []);
      setPreviewVisible(failures > 0);

      setSyncLogs(prev => [
        ...prev,
        `\n🎉 TRANSACTION IMPORT SUCCESSFUL!`,
        `✅ ${count} records synchronized; ${failures} rows failed and may be retried.`,
      ]);

      loadExpenses();
      setSyncing(false);
      setSyncStatus('import_done');
    } catch (err: any) {
      setSyncing(false);
      setSyncLogs(prev => [
        ...prev,
        `\n❌ Database transaction import failed: ${err.message || 'Unknown SQLite error'}`,
      ]);
      setSyncStatus('import_done');
    }
  };

  const toggleSelectTransaction = (tempId: string) => {
    setProposedTransactions(prev =>
      prev.map(tx => (tx.tempId === tempId ? { ...tx, checked: !tx.checked } : tx)),
    );
  };

  const toggleSelectAll = (select: boolean) => {
    setProposedTransactions(prev => prev.map(tx => ({ ...tx, checked: select })));
  };

  // Contacts permission, scratchpad notes, and smart budget state
  const [_contactsPermission, setContactsPermission] = useState<
    'granted' | 'denied' | 'checking'
  >('checking');
  const [note, setNote] = useState('');
  const [budget, setBudget] = useState('20000');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    checkContactsPermission();
    // Load persisted scratchpad note
    const savedNote = getSetting('future_updates_note', '');
    setNote(savedNote);
    // Load persisted budget limit
    const savedBudget = getSetting('monthly_budget_limit', '20000');
    setBudget(savedBudget);
  }, []);

  useEffect(() => {
    // Save note after 1s of inactivity
    const timeout = setTimeout(() => {
      if (note !== getSetting('future_updates_note', '')) {
        setIsSaving(true);
        setSetting('future_updates_note', note);
        setTimeout(() => setIsSaving(false), 500);
      }
    }, 1000);
    return () => clearTimeout(timeout);
  }, [note]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', e => {
      if (Platform.OS === 'android') {
        setKeyboardSpace(e.endCoordinates.height);
      }
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardSpace(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const checkContactsPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const hasIt = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
        );
        setContactsPermission(hasIt ? 'granted' : 'denied');
      } catch (err) {
        console.warn(err);
        setContactsPermission('denied');
      }
    } else {
      setContactsPermission('granted');
    }
  };

  // contact permission request handled inline where needed

  const handleBudgetChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    setBudget(cleaned);
    setSetting('monthly_budget_limit', cleaned);
  };

  // notification settings helper removed (unused)

  const handleExport = async () => {
    try {
      const data = exportExpenses();
      if (!data || data.length === 0) {
        Alert.alert('No Data', 'You do not have any expenses to export.');
        return;
      }
      const jsonString = JSON.stringify(data, null, 2);

      const result = await Share.share({
        message: jsonString,
        title: 'Expense Tracker Backup',
      });

      if (result.action === Share.sharedAction) {
        Alert.alert('Export Successful', 'Your expense data has been shared.');
      }
    } catch (error: any) {
      Alert.alert(
        'Export Error',
        error.message || 'An error occurred during export.',
      );
    }
  };

  const handleDeduplicate = () => {
    Alert.alert(
      'Deduplicate Records',
      'This will scan your entire database and automatically move identical duplicate transactions (same amount, merchant, and time) to the Trash Bin. Do you want to proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Run Deduplication',
          style: 'destructive',
          onPress: () => {
            const count = runDeduplication();
            Alert.alert(
              'Deduplication Complete',
              `Found and moved ${count} duplicate transactions to the Trash Bin.`,
            );
          },
        },
      ],
    );
  };

  const handleDeleteAllData = () => {
    Alert.alert(
      'Delete All Data',
      'Are you sure you want to delete all transaction data? This action cannot be undone, but permissions and app settings will remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: () => {
            try {
              clearTransactionData();
              resetSpamClassifier();
              resetMerchantMap();
              loadExpenses();
              Alert.alert(
                'Data Deleted',
                'All transaction data and dynamic AI models have been permanently reset.',
              );
            } catch (error) {
              Alert.alert(
                'Delete Failed',
                error instanceof Error ? error.message : 'Could not delete transaction data.',
              );
            }
          },
        },
      ],
    );
  };

  const handleImport = (overwrite: boolean) => {
    if (!jsonInput.trim()) {
      Alert.alert('Empty Input', 'Please paste the backup JSON data first.');
      return;
    }

    try {
      const parsed = JSON.parse(jsonInput);
      if (!Array.isArray(parsed)) {
        throw new Error('Backup data must be a JSON array of transactions.');
      }

      Alert.alert(
        overwrite ? 'Overwrite Data?' : 'Merge Data?',
        overwrite
          ? 'This will completely delete your current local expenses and restore the backup. This cannot be undone. Are you sure?'
          : `This will import ${parsed.length} transaction records and merge them with your current list. Are you sure?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: overwrite ? 'Yes, Overwrite' : 'Yes, Merge',
            style: overwrite ? 'destructive' : 'default',
            onPress: () => {
              try {
                importExpenses(parsed, overwrite);
                Alert.alert(
                  'Import Success',
                  'Expense data has been successfully imported.',
                );
                setImportModalVisible(false);
                setJsonInput('');
              } catch (e: any) {
                Alert.alert(
                  'Import Failed',
                  e.message || 'The data structure is invalid.',
                );
              }
            },
          },
        ],
      );
    } catch {
      Alert.alert(
        'Invalid Format',
        'Failed to parse JSON. Please make sure you copied the correct backup string.',
      );
    }
  };

  const scrollViewRef = React.useRef<ScrollView>(null);

  const handleNoteFocus = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 150);
  };

  const getCategoryEmoji = (category: string) => {
    switch (category) {
      case 'Food & Dining': return '🍔';
      case 'Travel': return '🚗';
      case 'Shopping': return '🛍️';
      case 'Groceries': return '🛒';
      case 'Bills & Recharge': return '📱';
      case 'Entertainment': return '🎬';
      case 'Health': return '🏥';
      case 'Finance': return '💳';
      case 'Education': return '📚';
      case 'Self-transfers': return '🔄';
      case 'Transfers': return '💸';
      case 'Games': return '🎮';
      default: return '📦';
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const selectedCount = proposedTransactions.filter(t => t.checked).length;

  return (
    <View style={commonStyles.container}>
      <View style={commonStyles.header}>
        <Text style={commonStyles.headerTitle}>Settings</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 100}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: keyboardSpace > 0 ? keyboardSpace + 20 : 16 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Permissions section removed as requested - permissions are handled dynamically */}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Smart Budget Settings</Text>
            <View style={styles.budgetContainer}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.itemTitle}>Monthly Budget Limit</Text>
                <Text style={styles.itemDescription}>
                  Sets your target monthly expense limit for AI projections
                </Text>
              </View>
              <View style={styles.budgetInputWrapper}>
                <Text style={styles.currencySymbol}>₹</Text>
                <TextInput
                  style={styles.budgetInput}
                  keyboardType="numeric"
                  value={budget}
                  onChangeText={handleBudgetChange}
                  placeholder="20000"
                  placeholderTextColor="#999"
                  maxLength={7}
                />
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SMS Transaction Sync</Text>
            <View style={styles.syncContainer}>
              {syncing && !__DEV__ ? (
                <View style={styles.loaderContainer}>
                  <Text style={styles.syncProgressTitle}>
                    🔄 Syncing SMS Ledger...
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.syncItem}
                  onPress={() => setCalendarVisible(true)}
                  disabled={syncing}
                >
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.itemTitle}>Sync Past Transactions</Text>
                    <Text style={styles.itemDescription}>
                      Scan past bank SMS messages starting from a custom date to
                      securely backfill your ledger
                    </Text>
                  </View>
                  <Text style={styles.actionIcon}>🔄</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Security & App Lock Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Security & App Lock</Text>

            <View style={styles.item}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.itemTitle}>App Lock (PIN)</Text>
                <Text style={styles.itemDescription}>
                  {hasPinSet && isAppLockEnabled
                    ? '4-digit personal passcode is active'
                    : 'Require a PIN to access SpendWise'}
                </Text>
              </View>
              <Switch
                value={isAppLockEnabled}
                onValueChange={handleToggleAppLock}
                trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                thumbColor={isAppLockEnabled ? '#1a73e8' : '#f4f3f4'}
              />
            </View>

            {isAppLockEnabled && (
              <>
                <TouchableOpacity
                  style={styles.item}
                  onPress={() => {
                    setPinModalMode('change');
                    setPinModalVisible(true);
                  }}
                >
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.itemTitle}>Change App PIN</Text>
                    <Text style={styles.itemDescription}>
                      Update your 4-digit personal passcode
                    </Text>
                  </View>
                  <Text style={styles.actionIcon}>🔑</Text>
                </TouchableOpacity>

                <View style={styles.item}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.itemTitle}>Biometrics & Phone Screen Lock</Text>
                    <Text style={styles.itemDescription}>
                      {deviceAuthStatus.isAvailable
                        ? 'Unlock with Fingerprint, Face ID, or Phone Screen Lock'
                        : 'Biometric / Screen Lock is not enrolled on this device'}
                    </Text>
                  </View>
                  <Switch
                    value={isBiometricEnabled}
                    disabled={!deviceAuthStatus.isAvailable}
                    onValueChange={handleToggleBiometric}
                    trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                    thumbColor={isBiometricEnabled ? '#1a73e8' : '#f4f3f4'}
                  />
                </View>

                <View style={[styles.item, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                  <Text style={styles.itemTitle}>Auto-Lock Timeout</Text>
                  <Text style={[styles.itemDescription, { marginBottom: 12 }]}>
                    Lock app when backgrounded or inactive
                  </Text>
                  <View style={styles.timeoutRow}>
                    {[
                      { label: 'Immediate', value: 0 },
                      { label: '30s', value: 30000 },
                      { label: '1m', value: 60000 },
                      { label: '5m', value: 300000 },
                    ].map((option) => {
                      const isSelected = lockTimeout === option.value;
                      return (
                        <TouchableOpacity
                          key={option.value}
                          style={[
                            styles.timeoutChip,
                            isSelected && styles.timeoutChipActive,
                          ]}
                          onPress={() => setLockTimeout(option.value)}
                        >
                          <Text
                            style={[
                              styles.timeoutChipText,
                              isSelected && styles.timeoutChipTextActive,
                            ]}
                          >
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data Management</Text>

            <TouchableOpacity style={styles.item} onPress={handleDeduplicate}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.itemTitle}>Deduplicate Data</Text>
                <Text style={styles.itemDescription}>
                  Scan and automatically move duplicate transactions to Trash
                </Text>
              </View>
              <Text style={styles.actionIcon}>🧹</Text>
            </TouchableOpacity>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.actionHalfBtn}
                onPress={handleExport}
              >
                <Text style={styles.actionIconLarge}>📤</Text>
                <Text style={styles.itemTitle}>Export Backup</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionHalfBtn}
                onPress={() => setImportModalVisible(true)}
              >
                <Text style={styles.actionIconLarge}>📥</Text>
                <Text style={styles.itemTitle}>Import Backup</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.scratchpadHeader}>
              <Text style={styles.sectionTitle}>
                💡 Feature Ideas & Scratchpad
              </Text>
              {isSaving && <Text style={styles.savingText}>Saving...</Text>}
              {!isSaving && note.length > 0 && (
                <Text style={styles.savedText}>Auto-saved</Text>
              )}
            </View>
            <View style={styles.notepadContainer}>
              <TextInput
                style={styles.notepadInput}
                multiline
                numberOfLines={6}
                value={note}
                onChangeText={setNote}
                onFocus={handleNoteFocus}
                placeholder="Jot down future updates, feature ideas, or items you want to work on next..."
                placeholderTextColor="#999"
                textAlignVertical="top"
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Danger Zone</Text>

            <TouchableOpacity
              style={[styles.item, styles.dangerItem]}
              onPress={handleDeleteAllData}
            >
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.dangerTitle}>Delete All Data</Text>
                <Text style={styles.itemDescription}>
                  Permanently erase all your transaction records
                </Text>
              </View>
              <Text style={styles.actionIcon}>⚠️</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <View style={styles.item}>
              <Text style={styles.itemTitle}>Version</Text>
              <Text style={styles.itemValue}>1.3.0</Text>
            </View>
          </View>
        </ScrollView>

        {/* Import Modal */}
        <Modal
          visible={importModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => {
            setImportModalVisible(false);
            setJsonInput('');
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Import Backup Data</Text>
                <TouchableOpacity
                  onPress={() => {
                    setImportModalVisible(false);
                    setJsonInput('');
                  }}
                >
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.modalInstructions}>
                Paste your exported JSON backup text below to restore your
                transaction records:
              </Text>

              <TextInput
                style={styles.jsonTextInput}
                multiline
                value={jsonInput}
                onChangeText={setJsonInput}
                placeholder='[{"amount": 500, "merchant": "Uber", ...}]'
                placeholderTextColor="#999"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.mergeBtn]}
                  onPress={() => handleImport(false)}
                >
                  <Text style={styles.mergeBtnText}>Merge Backup</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtn, styles.overwriteBtn]}
                  onPress={() => handleImport(true)}
                >
                  <Text style={styles.overwriteBtnText}>
                    Overwrite / Restore
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Calendar Modal for Sync Date Selection */}
        <Modal
          visible={calendarVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setCalendarVisible(false)}
        >
          <CalendarModal
            startDate={null}
            endDate={null}
            onClose={() => setCalendarVisible(false)}
            onApply={(start, _end) => {
              handleSyncHistory(start);
            }}
          />
        </Modal>

        {/* Sync Progress CLI Overlay Modal */}
        <Modal
          visible={syncing && __DEV__}
          transparent
          animationType="fade"
          onRequestClose={() => {}}
        >
          <View style={styles.terminalOverlay}>
            <View style={styles.terminalBox}>
              <Text style={styles.terminalHeaderTitle}>🤖 LEDGER CO-PROCESSOR ACTIVE</Text>
              <Text style={styles.terminalHeaderSubtitle}>
                {syncProgress}
              </Text>
              
              {/* Progress Bar Container */}
              <View style={styles.progressBarBg}>
                <View style={[
                  styles.progressBarFill, 
                  { 
                    width: `${syncProgressPct}%`,
                    backgroundColor: syncStatus === 'importing' || syncStatus === 'import_done' ? '#33b3ff' : '#00ff00' 
                  }
                ]} />
              </View>

              {/* Scrolling Terminal View */}
              <ScrollView
                ref={logsScrollViewRef}
                style={styles.terminalScroll}
                contentContainerStyle={styles.terminalScrollContent}
                onContentSizeChange={() => logsScrollViewRef.current?.scrollToEnd({ animated: true })}
                showsVerticalScrollIndicator={true}
              >
                {syncLogs.map((log, idx) => {
                  let logColor = '#00ff00'; // Green default for Found
                  if (log.startsWith('🛡️') || log.startsWith('⚠️')) logColor = '#ffb300'; // Orange for Dup / Warning
                  if (log.startsWith('🗑️') || log.startsWith('❌')) logColor = '#ff3333'; // Red/Gray for Junk/Error
                  if (log.startsWith('⏭️')) logColor = '#888888'; // Gray for Skip
                  if (log.startsWith('🔍') || log.startsWith('📥') || log.startsWith('⚙️') || log.startsWith('💾')) logColor = '#33b3ff'; // Light blue for Info/Import
                  
                  return (
                    <Text key={idx} style={[styles.terminalText, { color: logColor }]}>
                      {log}
                    </Text>
                  );
                })}
              </ScrollView>

              {/* Real-time counters or Phase Action Buttons depending on status */}
              {syncStatus === 'scanning' && (
                <View style={styles.statsSummary}>
                  <View style={styles.statBox}>
                    <Text style={styles.statCount}>{processedCounts.found}</Text>
                    <Text style={styles.statLabel}>Found</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={[styles.statCount, { color: '#ffb300' }]}>{processedCounts.dups}</Text>
                    <Text style={styles.statLabel}>Duplicates</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={[styles.statCount, { color: '#888888' }]}>{processedCounts.junk}</Text>
                    <Text style={styles.statLabel}>Junk/Skip</Text>
                  </View>
                </View>
              )}

              {syncStatus === 'scan_done' && (
                <View style={styles.terminalActions}>
                  {proposedTransactions.length > 0 ? (
                    <TouchableOpacity
                      style={styles.terminalBtnPrimary}
                      onPress={handleProceedToPreview}
                    >
                      <Text style={styles.terminalBtnTextPrimary}>
                        Review & Import {proposedTransactions.length} Transactions ➔
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.terminalBtnSecondary}
                      onPress={handleCloseScanner}
                    >
                      <Text style={styles.terminalBtnTextSecondary}>
                        Close Scanner
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {syncStatus === 'importing' && (
                <View style={styles.statsSummary}>
                  <View style={[styles.statBox, { borderColor: '#33b3ff' }]}>
                    <Text style={[styles.statCount, { color: '#33b3ff' }]}>
                      {proposedTransactions.filter(tx => tx.checked).length}
                    </Text>
                    <Text style={styles.statLabel}>Total Selected</Text>
                  </View>
                  <View style={[styles.statBox, { borderColor: '#33b3ff' }]}>
                    <Text style={[styles.statCount, { color: '#33b3ff' }]}>
                      {syncLogs.filter(l => l.includes('Saved:')).length}
                    </Text>
                    <Text style={styles.statLabel}>Committed</Text>
                  </View>
                </View>
              )}

              {syncStatus === 'import_done' && (
                <View style={styles.terminalActions}>
                  <TouchableOpacity
                    style={styles.terminalBtnSuccess}
                    onPress={handleFinishImport}
                  >
                    <Text style={styles.terminalBtnTextSuccess}>
                      Sync Ledger & Close ➔
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </Modal>

        {/* Sync Preview Modal */}
        <Modal
          visible={previewVisible}
          transparent
          animationType="slide"
          onRequestClose={() => {
            setPreviewVisible(false);
            setProposedTransactions([]);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.previewModalBox}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.modalTitle}>Sync Preview</Text>
                  <Text style={styles.modalSubtitle}>
                    Select the transactions you want to import
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setPreviewVisible(false);
                    setProposedTransactions([]);
                  }}
                >
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Selection Bar */}
              <View style={styles.selectionBar}>
                <Text style={styles.selectionInfo}>
                  Selected: <Text style={styles.boldText}>{selectedCount}</Text> of{' '}
                  {proposedTransactions.length}
                </Text>
                <View style={styles.selectionActions}>
                  {selectedCount === proposedTransactions.length ? (
                    <TouchableOpacity onPress={() => toggleSelectAll(false)}>
                      <Text style={styles.selectionActionText}>Deselect All</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => toggleSelectAll(true)}>
                      <Text style={styles.selectionActionText}>Select All</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Transactions List */}
              <ScrollView style={styles.previewList}>
                {proposedTransactions.map(tx => {
                  const emoji = getCategoryEmoji(tx.category);
                  return (
                    <TouchableOpacity
                      key={tx.tempId}
                      style={styles.previewRow}
                      onPress={() => toggleSelectTransaction(tx.tempId)}
                      activeOpacity={0.8}
                    >
                      {/* Checkbox */}
                      <View
                        style={[
                          styles.checkboxCircle,
                          tx.checked && styles.checkboxChecked,
                        ]}
                      >
                        {tx.checked && <Text style={styles.checkMark}>✓</Text>}
                      </View>

                      {/* Category Icon */}
                      <View style={styles.categoryCircle}>
                        <Text style={styles.categoryEmoji}>{emoji}</Text>
                      </View>

                      {/* Details */}
                      <View style={styles.previewDetails}>
                        <Text style={styles.previewMerchant} numberOfLines={1}>
                          {tx.merchant}
                        </Text>
                        <Text style={styles.previewMeta}>
                          {tx.category} • {formatDate(tx.timestamp)}
                        </Text>
                        {tx.possibleDuplicate && (
                          <Text style={styles.previewMeta}>Possible duplicate — review before importing</Text>
                        )}
                        {tx.bank && (
                          <Text style={styles.previewBank}>
                            {tx.paymentMode?.toUpperCase()} • {tx.bank}
                          </Text>
                        )}
                      </View>

                      {/* Amount */}
                      <Text
                        style={[
                          styles.previewAmount,
                          tx.transactionType === 'credit'
                            ? styles.amountCredit
                            : styles.amountDebit,
                        ]}
                      >
                        {tx.transactionType === 'credit' ? '+' : '-'} ₹
                        {tx.amount.toFixed(2)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Footer */}
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => {
                    setPreviewVisible(false);
                    setProposedTransactions([]);
                  }}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.approveBtn,
                    selectedCount === 0 && styles.approveBtnDisabled,
                  ]}
                  onPress={handleApproveSync}
                  disabled={selectedCount === 0}
                >
                  <Text style={styles.approveBtnText}>
                    Import Selected ({selectedCount})
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* PIN Setup / Change / Disable Modal */}
        <PinSetupModal
          visible={pinModalVisible}
          mode={pinModalMode}
          onClose={() => setPinModalVisible(false)}
        />
      </KeyboardAvoidingView>
    </View>
  );
}

