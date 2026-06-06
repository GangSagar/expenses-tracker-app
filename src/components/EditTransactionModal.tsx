import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  FlatList,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import Contacts from 'react-native-contacts';
import { Category, Expense, PaymentMode, ExpenseSplit } from '../types/expense';
import { CATEGORIES, PAYMENT_MODES } from '../constants/appOptions';
import { useExpenseStore } from '../hooks/useExpenses';
import { getSetting, setSetting } from '../database/expenseRepo';

interface RecentContact {
  displayName: string;
  phone?: string;
  recordID?: string;
}

interface Props {
  expense: Expense | null;
  visible: boolean;
  onClose: () => void;
  onSave: (
    id: number,
    alias: string | undefined,
    merchant: string,
    category: Category,
    bank?: string,
    paymentMode?: string,
    amount?: number,
    splits?: ExpenseSplit[],
    transactionType?: 'debit' | 'credit',
  ) => void;
  onAddManual?: (expense: Omit<Expense, 'id'>) => void;
  isAddMode?: boolean;
}

export default function EditTransactionModal({
  expense,
  visible,
  onClose,
  onSave,
  onAddManual,
  isAddMode = false,
}: Props) {
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState<Category>('Other');
  const [bank, setBank] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('unknown');
  const [amountStr, setAmountStr] = useState('');
  const [isSplit, setIsSplit] = useState(false);
  const [splits, setSplits] = useState<ExpenseSplit[]>([]);
  const [owedByMe, setOwedByMe] = useState(false);
  const [transactionType, setTransactionType] = useState<'debit' | 'credit'>('debit');

  // Contact Picker States
  const [contacts, setContacts] = useState<any[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [activeSplitIndex, setActiveSplitIndex] = useState<number | null>(null);
  const [recentContacts, setRecentContacts] = useState<RecentContact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<any[]>([]);
  const [selectedContactKeys, setSelectedContactKeys] = useState<string[]>([]);

  const requestContactsPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
          {
            title: 'Contacts Permission',
            message: 'This app needs access to your contacts to split bills easily.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true;
  };

  const saveSelectedContactToRecent = (contact: any) => {
    const name = contact.displayName || `${contact.givenName || ''} ${contact.familyName || ''}`.trim() || 'Unknown';
    const phone = contact.phoneNumbers && contact.phoneNumbers.length > 0 ? contact.phoneNumbers[0].number : '';
    const recordID = contact.recordID || '';

    let recent: RecentContact[] = [];
    try {
      const raw = getSetting('recent_split_contacts', '[]');
      recent = JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse recent contacts', e);
    }

    recent = recent.filter(c => c.displayName !== name);
    recent.unshift({ displayName: name, phone, recordID });
    recent = recent.slice(0, 10);

    setSetting('recent_split_contacts', JSON.stringify(recent));
  };

  const handleOpenContactPicker = async (index: number | null) => {
    setActiveSplitIndex(index);
    setSelectedContacts([]);
    setSelectedContactKeys([]);
    setSearchQuery('');

    // Load recent contacts from setting
    try {
      const raw = getSetting('recent_split_contacts', '[]');
      const parsedRecent = JSON.parse(raw) as RecentContact[];
      setRecentContacts(parsedRecent);
    } catch (e) {
      console.error('Failed to load recent contacts', e);
      setRecentContacts([]);
    }

    const hasPermission = await requestContactsPermission();
    if (hasPermission) {
      setContactModalVisible(true);
      Contacts.getAll()
        .then((allContacts) => {
          const sorted = allContacts.sort((a, b) =>
            (a.displayName || '').localeCompare(b.displayName || '')
          );
          setContacts(sorted);
          setFilteredContacts(sorted);
        })
        .catch((e) => {
          Alert.alert('Error', 'Failed to load contacts');
          console.error(e);
        });
    } else {
      Alert.alert('Permission Denied', 'Access to contacts is required to select a person.');
    }
  };

  const handleSearchContacts = (text: string) => {
    setSearchQuery(text);
    if (!text) {
      setFilteredContacts(contacts);
      return;
    }
    const filtered = contacts.filter((c) => {
      const name = (c.displayName || `${c.givenName || ''} ${c.familyName || ''}`).toLowerCase();
      const phone = c.phoneNumbers && c.phoneNumbers.length > 0 ? c.phoneNumbers[0].number : '';
      return name.includes(text.toLowerCase()) || phone.includes(text);
    });
    setFilteredContacts(filtered);
  };

  const toggleSelectContact = (contact: any) => {
    const name = contact.displayName || `${contact.givenName || ''} ${contact.familyName || ''}`.trim() || 'Unknown';
    const key = contact.recordID || name;
    if (selectedContactKeys.includes(key)) {
      setSelectedContactKeys(selectedContactKeys.filter(k => k !== key));
      setSelectedContacts(selectedContacts.filter(c => {
        const cName = c.displayName || `${c.givenName || ''} ${c.familyName || ''}`.trim() || 'Unknown';
        return (c.recordID || cName) !== key;
      }));
    } else {
      setSelectedContactKeys([...selectedContactKeys, key]);
      setSelectedContacts([...selectedContacts, contact]);
    }
  };

  const handleConfirmContacts = () => {
    if (selectedContacts.length === 0) {
      setContactModalVisible(false);
      return;
    }

    // Save all selected contacts to recent history
    selectedContacts.forEach(saveSelectedContactToRecent);

    let updatedSplits = [...splits];

    selectedContacts.forEach((contact, idx) => {
      const name = contact.displayName || `${contact.givenName || ''} ${contact.familyName || ''}`.trim() || 'Unknown';
      
      if (activeSplitIndex !== null && idx === 0) {
        // Populate the active split row
        updatedSplits[activeSplitIndex] = {
          ...updatedSplits[activeSplitIndex],
          contactName: name,
        };
      } else {
        // Append as a new split row
        updatedSplits.push({
          contactName: name,
          amount: 0,
          owedByMe,
        });
      }
    });

    setSplits(updatedSplits);
    setContactModalVisible(false);
    setSelectedContacts([]);
    setSelectedContactKeys([]);
    setSearchQuery('');
  };

  const getContactsListData = () => {
    if (searchQuery.trim().length > 0) {
      // Searching: just show filtered list of all contacts
      return filteredContacts;
    }
    
    const listData: any[] = [];
    if (recentContacts.length > 0) {
      listData.push({ isHeader: true, title: 'Recent Contacts' });
      listData.push(
        ...recentContacts.map(rc => ({
          recordID: rc.recordID,
          displayName: rc.displayName,
          phoneNumbers: rc.phone ? [{ label: 'mobile', number: rc.phone }] : [],
          isRecent: true,
        }))
      );
    }
    
    if (filteredContacts.length > 0) {
      listData.push({ isHeader: true, title: 'All Contacts' });
      listData.push(...filteredContacts);
    }
    
    return listData;
  };

  useEffect(() => {
    if (visible) {
      if (isAddMode || !expense) {
        // Initialize new manual cash expense
        setMerchant(expense?.merchant || '');
        setCategory(expense?.category || 'Other');
        setBank(expense?.bank || '');
        setPaymentMode(expense?.paymentMode || 'cash');
        setAmountStr(expense?.amount ? String(expense.amount) : '');
        setIsSplit(false);
        setSplits([]);
        setOwedByMe(false);
        setTransactionType(expense?.transactionType || 'debit');
      } else {
        // Edit existing expense
        setMerchant(expense.merchant);
        setCategory(expense.category);
        setBank(expense.bank || '');
        setPaymentMode(expense.paymentMode || 'unknown');
        setAmountStr(String(expense.amount));
        setIsSplit(!!expense.splits && expense.splits.length > 0);
        setSplits(expense.splits || []);
        const initialOwedByMe = expense.splits && expense.splits.length > 0 ? !!expense.splits[0].owedByMe : false;
        setOwedByMe(initialOwedByMe);
        setTransactionType(expense.transactionType);
      }
    }
  }, [expense, visible, isAddMode]);

  if (!visible) return null;

  const isLocked = !isAddMode && expense && (expense.source === 'sms' || expense.source === 'notification');
  const parsedTotal = parseFloat(amountStr) || 0;
  const splitsSum = splits.reduce((sum, s) => sum + s.amount, 0);

  const handleDelete = () => {
    if (!expense?.id) return;
    Alert.alert(
      '🗑️ Delete Transaction',
      'Are you sure you want to permanently delete this manual transaction?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            useExpenseStore.getState().deleteExpense(expense.id!);
            onClose();
          }
        }
      ]
    );
  };

  const handleTrash = () => {
    if (!expense?.id) return;
    const movingToTrash = !expense.isInvalid;
    
    Alert.alert(
      movingToTrash ? '🗑️ Move to Trash' : '🔄 Restore Transaction',
      movingToTrash 
        ? 'Moving this transaction to Trash will exclude it from all active dashboard calculations, reports, and accounts. You can restore it at any time.'
        : 'Are you sure you want to restore this transaction back to your active lists?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: movingToTrash ? 'Move to Trash' : 'Restore',
          style: movingToTrash ? 'destructive' : 'default',
          onPress: () => {
            useExpenseStore.getState().invalidateExpense(expense.id!, movingToTrash);
            onClose();
          }
        }
      ]
    );
  };

  const handleSave = () => {
    const finalMerchant = merchant.trim() || 'Manual Expense';
    const finalAmount = parseFloat(amountStr) || 0;

    if (finalAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than 0.');
      return;
    }

    if (isSplit) {
      if (splits.some(s => !s.contactName.trim())) {
        Alert.alert('Missing Contact Name', 'Please fill in names for all split contacts.');
        return;
      }
      if (splitsSum > finalAmount) {
        Alert.alert('Invalid Splits', 'Split amounts cannot exceed the total transaction amount.');
        return;
      }
    }

    const finalSplits = isSplit ? splits.filter(s => s.contactName.trim() && s.amount > 0) : undefined;

    if (isAddMode || !expense?.id) {
      // Adding a new manual cash transaction
      if (onAddManual) {
        onAddManual({
          amount: finalAmount,
          merchant: finalMerchant,
          alias: finalMerchant,
          category,
          confidence: 1.0,
          timestamp: Date.now(),
          source: 'manual',
          rawMessage: `Manual Cash Transaction: ${finalMerchant}`,
          transactionType,
          bank: bank.trim() || undefined,
          paymentMode,
          splits: finalSplits,
        });
      }
    } else {
      // Saving edits on an existing transaction
      onSave(
        expense.id,
        expense.alias,
        finalMerchant,
        category,
        bank.trim() || undefined,
        paymentMode,
        isLocked ? undefined : finalAmount,
        finalSplits,
        transactionType,
      );
    }
    onClose();
  };

  const addSplit = () => {
    setSplits([...splits, { contactName: '', amount: 0, owedByMe }]);
  };

  const removeSplit = (index: number) => {
    setSplits(splits.filter((_, i) => i !== index));
  };

  const updateSplit = (index: number, key: keyof ExpenseSplit, value: any) => {
    setSplits(
      splits.map((s, i) => (i === index ? { ...s, [key]: value } : s))
    );
  };

  const splitEqually = () => {
    if (parsedTotal <= 0) return;
    const totalPeople = splits.length + 1; // You + contacts
    const equalShare = Math.round((parsedTotal / totalPeople) * 100) / 100;
    
    // Assign equal share to everyone, adjustments on the last person or your share will absorb rounding
    setSplits(
      splits.map(s => ({ ...s, amount: equalShare }))
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.popup}>
          <Text style={styles.title}>{isAddMode ? 'Add Transaction' : 'Edit Transaction'}</Text>

          {isLocked ? (
            <View style={styles.lockedAmountContainer}>
              <Text style={styles.amount}>₹{expense?.amount.toLocaleString('en-IN')}</Text>
              <View style={styles.lockBadge}>
                <Text style={styles.lockBadgeText}>🔒 Auto-Synced</Text>
              </View>
            </View>
          ) : (
            <View style={styles.amountInputContainer}>
              <Text style={styles.currencySymbol}>₹</Text>
              <TextInput
                style={styles.amountInput}
                value={amountStr}
                onChangeText={setAmountStr}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor="#999"
              />
            </View>
          )}

          {expense?.alias && expense.alias !== merchant && (
            <Text style={styles.aliasSubtitle}>Original: {expense.alias}</Text>
          )}

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Merchant / Description</Text>
            <TextInput
              style={styles.input}
              value={merchant}
              onChangeText={setMerchant}
              placeholder="e.g. Swiggy, Cash spent"
              placeholderTextColor="#999"
            />

            <Text style={styles.label}>Transaction Type</Text>
            <View style={styles.grid}>
              <TouchableOpacity
                style={[
                  styles.chip,
                  transactionType === 'debit' && styles.chipActiveDebit,
                ]}
                onPress={() => setTransactionType('debit')}
              >
                <Text
                  style={[
                    styles.chipText,
                    transactionType === 'debit' && styles.chipTextActiveDebit,
                  ]}
                >
                  Expense (Sent)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.chip,
                  transactionType === 'credit' && styles.chipActiveCredit,
                ]}
                onPress={() => setTransactionType('credit')}
              >
                <Text
                  style={[
                    styles.chipText,
                    transactionType === 'credit' && styles.chipTextActiveCredit,
                  ]}
                >
                  Income (Received)
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Bank / Card (Optional)</Text>
            <TextInput
              style={styles.input}
              value={bank}
              onChangeText={setBank}
              placeholder="e.g. Cash, HDFC, SBI"
              placeholderTextColor="#999"
            />

            <Text style={styles.label}>Category</Text>
            <View style={styles.grid}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.chip, category === cat && styles.chipActive]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Payment Method</Text>
            <View style={styles.grid}>
              {PAYMENT_MODES.map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.chip, paymentMode === mode && styles.chipActive]}
                  onPress={() => setPaymentMode(mode)}
                >
                  <Text style={[styles.chipText, paymentMode === mode && styles.chipTextActive]}>
                    {mode.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Split Expense Feature */}
            <View style={styles.splitHeader}>
              <Text style={styles.label}>Split with Contacts</Text>
              <TouchableOpacity
                style={[styles.splitToggle, isSplit && styles.splitToggleActive]}
                onPress={() => setIsSplit(!isSplit)}
              >
                <Text style={[styles.splitToggleText, isSplit && styles.splitToggleTextActive]}>
                  {isSplit ? 'ON' : 'OFF'}
                </Text>
              </TouchableOpacity>
            </View>

            {isSplit && (
              <View style={styles.splitBox}>
                {/* Global Direction Toggle Pill */}
                <View style={styles.globalDirectionRow}>
                  <Text style={styles.globalDirectionLabel}>Overall Split Direction:</Text>
                  <TouchableOpacity
                    style={[
                      styles.directionPill,
                      owedByMe ? styles.directionOwedByMe : styles.directionOwedToMe
                    ]}
                    onPress={() => {
                      const val = !owedByMe;
                      setOwedByMe(val);
                      setSplits(splits.map(s => ({ ...s, owedByMe: val })));
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.directionText, owedByMe ? styles.textOwedByMe : styles.textOwedToMe]}>
                      {owedByMe ? '🔴 You owe them' : '🟢 They owe you'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {splits.map((s, index) => (
                  <View key={index} style={styles.splitCard}>
                    <View style={styles.splitRow}>
                      <TextInput
                        style={[styles.input, styles.splitNameInput]}
                        value={s.contactName}
                        onChangeText={val => updateSplit(index, 'contactName', val)}
                        placeholder="Contact Name"
                        placeholderTextColor="#999"
                      />
                      <TouchableOpacity
                        style={styles.contactPickerBtn}
                        onPress={() => handleOpenContactPicker(index)}
                      >
                        <Text style={styles.contactPickerText}>👤</Text>
                      </TouchableOpacity>
                      <TextInput
                        style={[styles.input, styles.splitAmountInput]}
                        value={s.amount > 0 ? String(s.amount) : ''}
                        onChangeText={val => updateSplit(index, 'amount', parseFloat(val) || 0)}
                        keyboardType="numeric"
                        placeholder="₹ Amount"
                        placeholderTextColor="#999"
                      />
                      <TouchableOpacity style={styles.deleteSplitBtn} onPress={() => removeSplit(index)}>
                        <Text style={styles.deleteSplitText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                <View style={styles.splitActions}>
                  <TouchableOpacity style={styles.addSplitBtn} onPress={addSplit}>
                    <Text style={styles.addSplitBtnText}>+ Add Empty</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.addContactsBtn} onPress={() => handleOpenContactPicker(null)}>
                    <Text style={styles.addContactsBtnText}>👤 Select Contacts</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.splitEquallyBtn} onPress={splitEqually}>
                    <Text style={styles.splitEquallyBtnText}>Split Equally</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.splitSummary}>
                  <Text style={styles.summaryText}>
                    Total: ₹{parsedTotal}  |  Shared: ₹{splitsSum}  |  You: ₹{(parsedTotal - splitsSum).toFixed(2)}
                  </Text>
                  {splitsSum > parsedTotal && (
                    <Text style={styles.validationError}>
                      ⚠️ Splits exceed the total transaction amount!
                    </Text>
                  )}
                </View>
              </View>
            )}
          </ScrollView>

          {!isAddMode && expense && (
            expense.source === 'manual' ? (
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} activeOpacity={0.8}>
                <Text style={styles.deleteText}>🗑️ Delete Transaction</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.deleteBtn,
                  {
                    backgroundColor: expense.isInvalid ? '#e6f4ea' : '#fce8e6',
                    borderColor: expense.isInvalid ? '#a3cfbb' : '#f5c2c2',
                  }
                ]}
                onPress={handleTrash}
                activeOpacity={0.8}
              >
                <Text style={[styles.deleteText, { color: expense.isInvalid ? '#137333' : '#c5221f' }]}>
                  {expense.isInvalid ? '🔄 Restore from Trash' : '🗑️ Move to Trash'}
                </Text>
              </TouchableOpacity>
            )
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, isSplit && splitsSum > parsedTotal && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={isSplit && splitsSum > parsedTotal}
            >
              <Text style={styles.saveText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Modern Searchable Contact Picker Modal */}
      <Modal
        visible={contactModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setContactModalVisible(false)}
      >
        <View style={styles.contactModalOverlay}>
          <View style={styles.contactModalBox}>
            <View style={styles.contactModalHeader}>
              <Text style={styles.contactModalTitle}>Select Contacts</Text>
              <TouchableOpacity
                onPress={() => {
                  setContactModalVisible(false);
                  setSelectedContacts([]);
                  setSelectedContactKeys([]);
                  setSearchQuery('');
                }}
              >
                <Text style={styles.contactCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.searchBarContainer}>
              <TextInput
                style={styles.contactSearchInput}
                value={searchQuery}
                onChangeText={handleSearchContacts}
                placeholder="Search contacts by name or phone..."
                placeholderTextColor="#999"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  style={styles.clearSearchBtn}
                  onPress={() => handleSearchContacts('')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.clearSearchText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={getContactsListData()}
              keyExtractor={(item, index) => item.isHeader ? `header_${index}` : (item.recordID || `${item.displayName}_${index}`)}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                if (item.isHeader) {
                  return (
                    <View style={styles.contactSectionHeader}>
                      <Text style={styles.contactSectionHeaderText}>{item.title}</Text>
                    </View>
                  );
                }

                const name = item.displayName || `${item.givenName || ''} ${item.familyName || ''}`.trim() || 'Unknown';
                const initial = name.charAt(0).toUpperCase();
                const phone = item.phoneNumbers && item.phoneNumbers.length > 0 ? item.phoneNumbers[0].number : '';
                const key = item.recordID || name;
                const isSelected = selectedContactKeys.includes(key);

                return (
                  <TouchableOpacity
                    style={[styles.contactItem, isSelected && styles.contactItemSelected]}
                    onPress={() => toggleSelectContact(item)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.contactAvatar, isSelected && styles.contactAvatarSelected]}>
                      {isSelected ? (
                        <Text style={styles.contactAvatarText}>✓</Text>
                      ) : (
                        <Text style={styles.contactAvatarText}>{initial}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.contactName}>{name}</Text>
                      {phone ? <Text style={styles.contactPhone}>{phone}</Text> : null}
                    </View>
                    <View style={[styles.checkboxCircle, isSelected && styles.checkboxCircleSelected]}>
                      {isSelected && <View style={styles.checkboxInnerCircle} />}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.contactEmpty}>
                  <Text style={styles.contactEmptyText}>No contacts found</Text>
                </View>
              }
            />

            <View style={styles.contactModalFooter}>
              <TouchableOpacity
                style={styles.contactCancelBtn}
                onPress={() => {
                  setContactModalVisible(false);
                  setSelectedContacts([]);
                  setSelectedContactKeys([]);
                  setSearchQuery('');
                }}
              >
                <Text style={styles.contactCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.contactConfirmBtn,
                  selectedContacts.length === 0 && styles.contactConfirmBtnDisabled
                ]}
                onPress={handleConfirmContacts}
                disabled={selectedContacts.length === 0}
              >
                <Text style={styles.contactConfirmBtnText}>
                  Add Selected ({selectedContacts.length})
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  popup: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '85%',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  lockedAmountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  amount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a73e8',
  },
  lockBadge: {
    backgroundColor: '#e8f0fe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  lockBadgeText: {
    fontSize: 11,
    color: '#1a73e8',
    fontWeight: '600',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#1a73e8',
    marginBottom: 12,
    paddingBottom: 4,
  },
  currencySymbol: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a73e8',
    marginRight: 4,
  },
  amountInput: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a73e8',
    flex: 1,
    padding: 0,
  },
  aliasSubtitle: {
    fontSize: 13,
    color: '#999',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  scrollContent: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1a1a1a',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  chipActive: {
    backgroundColor: '#1a73e8',
  },
  chipActiveDebit: {
    backgroundColor: '#fce8e6',
    borderWidth: 1,
    borderColor: '#f5c2c2',
  },
  chipActiveCredit: {
    backgroundColor: '#e6f4ea',
    borderWidth: 1,
    borderColor: '#a3cfbb',
  },
  chipText: {
    fontSize: 13,
    color: '#333',
  },
  chipTextActive: {
    color: '#fff',
  },
  chipTextActiveDebit: {
    color: '#c5221f',
    fontWeight: '700',
  },
  chipTextActiveCredit: {
    color: '#137333',
    fontWeight: '700',
  },
  splitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  splitToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
  },
  splitToggleActive: {
    backgroundColor: '#34a853',
  },
  splitToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
  },
  splitToggleTextActive: {
    color: '#fff',
  },
  splitBox: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginTop: 4,
  },
  globalDirectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e8eaed',
    paddingBottom: 10,
  },
  globalDirectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5f6368',
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  splitCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e8eaed',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  directionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
    paddingTop: 6,
  },
  directionPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  directionOwedByMe: {
    backgroundColor: '#fce8e6',
  },
  directionOwedToMe: {
    backgroundColor: '#e6f4ea',
  },
  directionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  textOwedByMe: {
    color: '#c5221f',
  },
  textOwedToMe: {
    color: '#137333',
  },
  splitNameInput: {
    flex: 2,
    paddingVertical: 8,
    fontSize: 14,
  },
  splitAmountInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 14,
  },
  deleteSplitBtn: {
    padding: 8,
  },
  deleteSplitText: {
    fontSize: 16,
    color: '#d32f2f',
    fontWeight: '700',
  },
  splitActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  addSplitBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#e8f0fe',
    borderRadius: 8,
    alignItems: 'center',
  },
  addSplitBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a73e8',
  },
  splitEquallyBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#e6f4ea',
    borderRadius: 8,
    alignItems: 'center',
  },
  splitEquallyBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#34a853',
  },
  splitSummary: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 10,
  },
  summaryText: {
    fontSize: 12,
    color: '#5f6368',
    fontWeight: '600',
  },
  validationError: {
    fontSize: 12,
    color: '#d32f2f',
    fontWeight: '600',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  saveBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#1a73e8',
  },
  saveBtnDisabled: {
    backgroundColor: '#ccc',
  },
  deleteBtn: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#fce8e6',
    borderWidth: 1,
    borderColor: '#fad2cf',
    marginBottom: 12,
    marginTop: 8,
  },
  deleteText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#c5221f',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  contactPickerBtn: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e8f0fe',
    borderRadius: 8,
  },
  contactPickerText: {
    fontSize: 16,
  },
  contactModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactModalBox: {
    width: '90%',
    height: '75%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  contactModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  contactModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#202124',
  },
  contactCloseText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#666',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f3f4',
    borderRadius: 10,
    marginBottom: 16,
    paddingRight: 8,
  },
  contactSearchInput: {
    flex: 1,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 10,
    fontSize: 15,
    color: '#202124',
  },
  clearSearchBtn: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearSearchText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#5f6368',
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f4',
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a73e8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contactAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  contactName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#202124',
  },
  contactPhone: {
    fontSize: 12,
    color: '#5f6368',
    marginTop: 2,
  },
  contactEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  contactEmptyText: {
    fontSize: 14,
    color: '#9aa0a6',
  },
  addContactsBtn: {
    flex: 1.2,
    paddingVertical: 10,
    backgroundColor: '#e8f0fe',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d2e3fc',
  },
  addContactsBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a73e8',
  },
  contactSectionHeader: {
    backgroundColor: '#f1f3f4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 12,
    marginBottom: 6,
  },
  contactSectionHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5f6368',
    textTransform: 'uppercase',
  },
  contactItemSelected: {
    backgroundColor: '#f8f9fa',
  },
  contactAvatarSelected: {
    backgroundColor: '#34a853',
  },
  checkboxCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#dadce0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  checkboxCircleSelected: {
    borderColor: '#1a73e8',
    backgroundColor: '#1a73e8',
  },
  checkboxInnerCircle: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  contactModalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
    paddingTop: 12,
  },
  contactCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f1f3f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactCancelBtnText: {
    fontSize: 14,
    color: '#5f6368',
    fontWeight: '600',
  },
  contactConfirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1a73e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactConfirmBtnDisabled: {
    backgroundColor: '#dadce0',
  },
  contactConfirmBtnText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
});
