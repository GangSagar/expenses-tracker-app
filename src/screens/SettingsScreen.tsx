import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
} from 'react-native';
import { useExpenseStore } from '../hooks/useExpenses';
import {
  getSetting,
  setSetting,
  isDuplicateTransaction,
  insertExpense,
  clearAllExpenses,
} from '../database/expenseRepo';
import commonStyles from '../styles/commonStyles';
import CalendarModal from '../components/CalendarModal';
import { processIncomingMessage } from '../services/messageService';
import { processTransaction } from '../services/expenseService';
import { resetSpamClassifier } from '../core/classifier/spamClassifier';
import { resetMerchantMap } from '../core/classifier/merchantMap';

const { MessageModule } = NativeModules;

export default function SettingsScreen() {
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
  const [proposedTransactions, setProposedTransactions] = useState<any[]>([]);

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

    setSyncing(true);
    setSyncProgress('Querying SMS inbox...');

    try {
      // 2. Fetch all historical SMS messages since selected start date
      // This single fetch query is safe and fully compatible across all devices
      const pageJson = await MessageModule.fetchPastMessages(startTs);
      const rawList =
        typeof pageJson === 'string' ? JSON.parse(pageJson) : pageJson;

      if (!rawList || rawList.length === 0) {
        setSyncing(false);
        Alert.alert(
          'No Messages Found',
          'No messages were found from transactional senders in your SMS inbox.',
        );
        return;
      }

      setSyncProgress(`Parsing ${rawList.length} messages...`);

      const proposed: any[] = [];
      let tempCounter = 0;

      for (const msg of rawList) {
        const parsed = processIncomingMessage({
          body: msg.body,
          sender: msg.sender,
          source: 'sms',
        });

        if (parsed) {
          parsed.timestamp = msg.timestamp;

          const duplicate = isDuplicateTransaction(
            parsed.amount!,
            parsed.timestamp,
            parsed.referenceId || undefined,
            parsed.rawMessage || undefined,
          );

          if (!duplicate) {
            const processed = processTransaction(parsed);
            if (processed && processed.decision !== 'discard') {
              proposed.push({
                ...processed.expense,
                tempId: `temp_${Date.now()}_${tempCounter++}`,
                checked: true, // Default to checked
              });
            }
          }
        }
      }

      setSyncing(false);

      if (proposed.length === 0) {
        Alert.alert(
          'Already Synced',
          'No new transactions were found. All transactional records since this date are already in your ledger!',
        );
        return;
      }

      // Show preview
      setProposedTransactions(proposed);
      setPreviewVisible(true);
    } catch (err: any) {
      console.error('History sync failed:', err);
      setSyncing(false);
      Alert.alert(
        'Sync Failed',
        err.message || 'An error occurred during transaction sync.',
      );
    }
  };

  const handleApproveSync = () => {
    try {
      let importedCount = 0;
      for (const tx of proposedTransactions) {
        if (tx.checked) {
          const expenseData = { ...tx };
          delete (expenseData as any).tempId;
          delete (expenseData as any).checked;
          insertExpense(expenseData);
          importedCount++;
        }
      }

      loadExpenses();
      setPreviewVisible(false);
      setProposedTransactions([]);

      Alert.alert(
        'Sync Complete',
        `Successfully imported ${importedCount} transactions to your ledger!`,
      );
    } catch (err: any) {
      Alert.alert('Import Failed', err.message || 'Failed to save transactions.');
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
              {syncing ? (
                <View style={styles.loaderContainer}>
                  <Text style={styles.syncProgressTitle}>
                    Syncing SMS Ledger
                  </Text>
                  <Text style={styles.syncProgressSubtitle}>
                    {syncProgress}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.syncItem}
                  onPress={() => setCalendarVisible(true)}
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

const styles = StyleSheet.create({

  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  item: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  actionHalfBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  itemDescription: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  itemValue: {
    fontSize: 14,
    color: '#666',
  },
  arrow: {
    fontSize: 18,
    color: '#ccc',
  },
  actionIcon: {
    fontSize: 20,
  },
  actionIconLarge: {
    fontSize: 26,
    marginBottom: 6,
  },
  dangerItem: {
    borderWidth: 1,
    borderColor: '#fce8e6',
    backgroundColor: '#fff',
  },
  dangerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#d93025',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    width: '90%',
    height: '70%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#202124',
  },
  modalClose: {
    fontSize: 18,
    fontWeight: '700',
    color: '#666',
  },
  modalInstructions: {
    fontSize: 13,
    color: '#5f6368',
    lineHeight: 18,
    marginBottom: 16,
  },
  jsonTextInput: {
    flex: 1,
    backgroundColor: '#f1f3f4',
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: '#202124',
    textAlignVertical: 'top',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mergeBtn: {
    backgroundColor: '#e8f0fe',
  },
  mergeBtnText: {
    color: '#1a73e8',
    fontSize: 14,
    fontWeight: '600',
  },
  overwriteBtn: {
    backgroundColor: '#d93025',
  },
  overwriteBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadgeContainer: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f1f3f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  grantedText: {
    color: '#137333',
  },
  requestText: {
    color: '#1a73e8',
  },
  scratchpadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  savingText: {
    fontSize: 11,
    color: '#1a73e8',
    fontWeight: '500',
  },
  savedText: {
    fontSize: 11,
    color: '#137333',
    fontWeight: '500',
  },
  notepadContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8eaed',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  notepadInput: {
    fontSize: 14,
    color: '#202124',
    minHeight: 120,
    lineHeight: 20,
  },
  budgetContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8eaed',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  budgetInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f3f4',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 100,
    borderWidth: 1,
    borderColor: '#dadce0',
  },
  currencySymbol: {
    fontSize: 14,
    fontWeight: '700',
    color: '#202124',
    marginRight: 4,
  },
  budgetInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#202124',
    padding: 0,
  },
  syncContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8eaed',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  syncItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  loaderContainer: {
    paddingVertical: 8,
    alignItems: 'center',
    width: '100%',
  },
  syncProgressTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a73e8',
    marginBottom: 4,
  },
  syncProgressSubtitle: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  previewModalBox: {
    width: '90%',
    height: '80%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  selectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e8eaed',
    marginVertical: 12,
  },
  selectionInfo: {
    fontSize: 13,
    color: '#5f6368',
  },
  boldText: {
    fontWeight: '700',
    color: '#202124',
  },
  selectionActions: {
    flexDirection: 'row',
  },
  selectionActionText: {
    fontSize: 13,
    color: '#1a73e8',
    fontWeight: '600',
  },
  previewList: {
    flex: 1,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f4',
  },
  checkboxCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#dadce0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#1a73e8',
    borderColor: '#1a73e8',
  },
  checkMark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  categoryCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f3f4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryEmoji: {
    fontSize: 20,
  },
  previewDetails: {
    flex: 1,
  },
  previewMerchant: {
    fontSize: 14,
    fontWeight: '600',
    color: '#202124',
  },
  previewMeta: {
    fontSize: 11,
    color: '#5f6368',
    marginTop: 2,
  },
  previewBank: {
    fontSize: 9,
    color: '#9aa0a6',
    fontWeight: '500',
    marginTop: 2,
  },
  previewAmount: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
    marginLeft: 8,
  },
  amountCredit: {
    color: '#137333',
  },
  amountDebit: {
    color: '#202124',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
    paddingTop: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f1f3f4',
  },
  cancelBtnText: {
    color: '#5f6368',
    fontWeight: '600',
    fontSize: 14,
  },
  approveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#1a73e8',
  },
  approveBtnDisabled: {
    backgroundColor: '#dadce0',
  },
  approveBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
