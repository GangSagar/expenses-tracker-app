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
  KeyboardAvoidingView,
  NativeModules,
  Keyboard,
} from 'react-native';
import styles from '../../styles/SettingsScreenStyles';
import commonStyles from '../../styles/commonStyles';
import { useExpenseStore } from '../../hooks/useExpenses';

import {
  isDuplicateTransaction,
  insertExpense,
  clearAllExpenses,
} from '../../database/expenseRepo';
import CalendarModal from '../../components/CalendarModal';
import { processIncomingMessage } from '../../services/messageService';
import { processTransaction } from '../../services/expenseService';
import { resetSpamClassifier } from '../../core/classifier/spamClassifier';
import { resetMerchantMap } from '../../core/classifier/merchantMap';

import ProfileAvatar from './components/ProfileAvatar';
import ProfileStats from './components/ProfileStats';
import { useProfileData } from './hooks/useProfileData';

const { MessageModule } = NativeModules;

export default function ProfileScreen() {
  const { exportExpenses, importExpenses, loadExpenses, runDeduplication } =
    useExpenseStore();
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [jsonInput, setJsonInput] = useState('');

  // SMS History Sync State
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [keyboardSpace, setKeyboardSpace] = useState(0);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [proposedTransactions, setProposedTransactions] = useState([]);

  // Real-time terminal logging states for past sync flow
  const [syncLogs, setSyncLogs] = useState([]);
  const [syncProgressPct, setSyncProgressPct] = useState(0);
  const [processedCounts, setProcessedCounts] = useState({ found: 0, dups: 0, junk: 0 });
  const [syncStatus, setSyncStatus] = useState('idle');
  const logsScrollViewRef = React.useRef(null);

  const { budget, handleBudgetChange, note, setNote, isSaving } = useProfileData();

  const requestSmsPermission = async () => {
    if (Platform.OS !== 'android') return true;
    try {
      const { PermissionsAndroid } = require('react-native');
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

  const handleSyncHistory = async (startTs) => {
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

      // Calculate dynamic delay per message scan so total sync animation takes ~3.5 seconds
      const delay = __DEV__ 
        ? Math.max(2, Math.min(40, Math.floor(3500 / rawList.length)))
        : 0;

      const proposed = [];
      let tempCounter = 0;
      let found = 0;
      let dups = 0;
      let junk = 0;

      for (let i = 0; i < rawList.length; i++) {
        const msg = rawList[i];
        
        // Wait to allow React rendering log stream
        if (__DEV__) {
          await new Promise(resolve => setTimeout(() => resolve(), delay));
          const progressPct = Math.round(((i + 1) / rawList.length) * 100);
          setSyncProgressPct(progressPct);
          setSyncProgress(`Scanning: ${i + 1} of ${rawList.length} (${progressPct}%)`);
        }

        const parsed = processIncomingMessage({
          body: msg.body,
          sender: msg.sender,
          source: 'sms',
        });

        if (parsed) {
          parsed.timestamp = msg.timestamp;

          const duplicate = isDuplicateTransaction(
            parsed.amount,
            parsed.timestamp,
            parsed.referenceId || undefined,
            parsed.rawMessage || undefined,
          );

          if (duplicate) {
            dups++;
            if (__DEV__) {
              setProcessedCounts({ found, dups, junk });
              setSyncLogs(prev => [
                ...prev,
                `🛡️ Dup: Skip ₹${parsed.amount?.toFixed(2)} at ${parsed.merchant || 'Merchant'} (already recorded)`,
              ]);
            }
          } else {
            const processed = processTransaction(parsed);
            if (processed && processed.decision !== 'discard') {
              proposed.push({
                ...processed.expense,
                tempId: `temp_${Date.now()}_${tempCounter++}`,
                checked: true, // Default to checked
              });
              found++;
              if (__DEV__) {
                setProcessedCounts({ found, dups, junk });
                setSyncLogs(prev => [
                  ...prev,
                  `✅ Found: Extracted ₹${parsed.amount?.toFixed(2)} spent at ${processed.expense.merchant} (${parsed.bank || 'Bank'})`,
                ]);
              }
            } else {
              junk++;
              if (__DEV__) {
                setProcessedCounts({ found, dups, junk });
                setSyncLogs(prev => [
                  ...prev,
                  `🗑️ Junk: Filtered non-txn message from ${msg.sender}`,
                ]);
              }
            }
          }
        } else {
          junk++;
          if (__DEV__) {
            setProcessedCounts({ found, dups, junk });
            // Log only 1 of 8 skipped non-txn messages to prevent terminal clutter
            if (i % 8 === 0) {
              setSyncLogs(prev => [
                ...prev,
                `⏭️ Skip: Non-transactional alert from ${msg.sender}`,
              ]);
            }
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
    } catch (err) {
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
        let importedCount = 0;
        for (const tx of proposedTransactions) {
          if (tx.checked) {
            const expenseData = { ...tx };
            delete expenseData.tempId;
            delete expenseData.checked;
            insertExpense(expenseData);
            importedCount++;
          }
        }
        loadExpenses();
        setProposedTransactions([]);
        Alert.alert(
          'Sync Complete',
          `Successfully imported ${importedCount} transactions to your ledger!`,
        );
      } catch (err) {
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

      let count = 0;
      for (const tx of toImport) {
        // Wait 150ms per transaction for a high-fidelity visual committing stream
        await new Promise(resolve => setTimeout(() => resolve(), 150));
        
        const expenseData = { ...tx };
        delete expenseData.tempId;
        delete expenseData.checked;
        insertExpense(expenseData);
        count++;

        const pct = Math.round((count / toImport.length) * 100);
        setSyncProgressPct(pct);
        setSyncProgress(`Imported: ${count} of ${toImport.length} (${pct}%)`);
        
        setSyncLogs(prev => [
          ...prev,
          `💾 [${count}/${toImport.length}] Saved: ₹${expenseData.amount.toFixed(2)} spent at ${expenseData.merchant} to history`,
        ]);
      }

      setSyncLogs(prev => [
        ...prev,
        `\n🎉 TRANSACTION IMPORT SUCCESSFUL!`,
        `✅ ${count} records permanently synchronized and indexed in your local ledger.`,
      ]);

      loadExpenses();
      setSyncStatus('import_done');
    } catch (err) {
      setSyncLogs(prev => [
        ...prev,
        `\n❌ Database transaction import failed: ${err.message || 'Unknown SQLite error'}`,
      ]);
      setSyncStatus('import_done');
    }
  };

  const toggleSelectTransaction = (tempId) => {
    setProposedTransactions(prev =>
      prev.map(tx => (tx.tempId === tempId ? { ...tx, checked: !tx.checked } : tx)),
    );
  };

  const toggleSelectAll = (select) => {
    setProposedTransactions(prev => prev.map(tx => ({ ...tx, checked: select })));
  };

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
    } catch (error) {
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
            clearAllExpenses();
            resetSpamClassifier();
            resetMerchantMap();
            loadExpenses(); // Reload to reflect empty state
            Alert.alert(
              'Data Deleted',
              'All transaction data and dynamic AI models have been permanently reset.',
            );
          },
        },
      ],
    );
  };

  const handleImport = (overwrite) => {
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
              } catch (e) {
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

  const getCategoryEmoji = (category) => {
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

  const formatDate = (ts) => {
    return new Date(ts).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const selectedCount = proposedTransactions.filter(t => t.checked).length;
  const scrollViewRef = React.useRef(null);

  const handleNoteFocus = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 150);
  };

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

  const scrollPadding = { paddingBottom: keyboardSpace > 0 ? keyboardSpace + 20 : 16 };
  const progressFillStyle = {
    width: `${syncProgressPct}%`,
    backgroundColor: syncStatus === 'importing' || syncStatus === 'import_done' ? '#33b3ff' : '#00ff00'
  };

  return (
    <View style={commonStyles.container}>
      <ProfileAvatar />

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 100}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            styles.content,
            scrollPadding,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <ProfileStats budget={budget} onBudgetChange={handleBudgetChange} />

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
                  <View style={styles.flexLabelContainer}>
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

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data Management</Text>

            <TouchableOpacity style={styles.item} onPress={handleDeduplicate}>
              <View style={styles.flexLabelContainer}>
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
              <View style={styles.flexLabelContainer}>
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
                  progressFillStyle
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
                    <Text style={[styles.statCount, styles.statCountWarning]}>{processedCounts.dups}</Text>
                    <Text style={styles.statLabel}>Duplicates</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={[styles.statCount, styles.statCountJunk]}>{processedCounts.junk}</Text>
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
                  <View style={[styles.statBox, styles.statBoxInfo]}>
                    <Text style={[styles.statCount, styles.statCountInfo]}>
                      {proposedTransactions.filter(tx => tx.checked).length}
                    </Text>
                    <Text style={styles.statLabel}>Total Selected</Text>
                  </View>
                  <View style={[styles.statBox, styles.statBoxInfo]}>
                    <Text style={[styles.statCount, styles.statCountInfo]}>
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
                <View style={styles.flexLabelContainer}>
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
      </KeyboardAvoidingView>
    </View>
  );
}
