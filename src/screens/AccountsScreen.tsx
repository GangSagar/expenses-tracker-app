import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useExpenseStore } from '../hooks/useExpenses';
import { Expense } from '../types/expense';
import EditTransactionModal from '../components/EditTransactionModal';
import { formatAmount } from '../utils/formatHelpers';
import { getSetting, setSetting } from '../database/expenseRepo';

interface AccountSummary {
  bank: string;
  account: string;
  latestBalance: number;
  lastUpdated: number;
}

interface MissingAnomaly {
  bank: string;
  account: string;
  expectedBalance: number;
  actualBalance: number;
  missingAmount: number;
  type: 'debit' | 'credit';
  startDate: number;
  endDate: number;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

const CARD_PALETTES = [
  ['#1a73e8', '#1557b0'], // Indigo/Blue
  ['#009688', '#00796b'], // Teal
  ['#2c3e50', '#1a252f'], // Dark Slate
  ['#7b1fa2', '#4a148c'], // Rich Purple
  ['#e65100', '#b53d00'], // Bright Orange
  ['#c2185b', '#880e4f'], // Deep Pink
  ['#1b5e20', '#0d3c12'], // Forest Green
  ['#29b6f6', '#0288d1'], // Light Blue
  ['#ec407a', '#c2185b'], // Coral Pink
  ['#f4511e', '#b71c1c'], // Vermilion
  ['#3f51b5', '#1a237e'], // Royal Indigo
  ['#43a047', '#1b5e20'], // Emerald Green
  ['#ab47bc', '#7b1fa2'], // Amethyst Purple
  ['#d81b60', '#ad1457'], // Ruby Red
  ['#00acc1', '#00838f'], // Cyan
  ['#ffb300', '#ff6f00'], // Amber Gold
];

export default function AccountsScreen() {
  const { expenses, addManualExpense } = useExpenseStore();
  const [selectedPrefill, setSelectedPrefill] = useState<Expense | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Local state overrides for card type toggles, filter selection, and ignored anomalies
  const [accountTypesOverride, setAccountTypesOverride] = useState<Record<string, 'cc' | 'debit'>>({});
  const [selectedFilter, setSelectedFilter] = useState<'All' | 'debit' | 'cc'>('All');
  const [ignoredSignatures, setIgnoredSignatures] = useState<string[]>([]);

  const flatListRef = useRef<FlatList<AccountSummary>>(null);

  // Reset scroll position when filter changes
  useEffect(() => {
    if (flatListRef.current) {
      try {
        flatListRef.current.scrollToOffset({ offset: 0, animated: false });
      } catch (e) {
        console.warn('Failed to scroll FlatList', e);
      }
    }
  }, [selectedFilter]);

  // Load ignored anomalies on mount
  useEffect(() => {
    try {
      const saved = getSetting('ignored_anomalies', '[]');
      setIgnoredSignatures(JSON.parse(saved));
    } catch (e) {
      console.error('Failed to parse ignored anomalies', e);
    }
  }, []);

  const activeExpenses = expenses.filter(e => !e.isInvalid);

  // Group by unique bank + account pairs
  const accountGroups: Record<string, Expense[]> = {};
  for (const e of activeExpenses) {
    if (!e.bank || !e.account) continue;
    const key = `${e.bank}::${e.account}`;
    if (!accountGroups[key]) accountGroups[key] = [];
    accountGroups[key].push(e);
  }

  // Calculate summaries & anomalies
  const accounts: AccountSummary[] = [];
  const anomalies: MissingAnomaly[] = [];

  for (const [key, list] of Object.entries(accountGroups)) {
    const [bank, account] = key.split('::');
    // Sort transactions chronological (oldest to newest)
    const sorted = [...list].sort((a, b) => a.timestamp - b.timestamp);

    // Latest Available Balance checkpoint
    const latestWithBal = [...sorted]
      .reverse()
      .find(e => e.availableBalance !== undefined && e.availableBalance !== null);

    if (latestWithBal && latestWithBal.availableBalance !== undefined) {
      let latestBalance = latestWithBal.availableBalance;
      const latestIdx = sorted.indexOf(latestWithBal);
      
      // Apply subsequent transaction deltas to compute true current balance
      for (let idx = latestIdx + 1; idx < sorted.length; idx++) {
        const subsequent = sorted[idx];
        if (subsequent.transactionType === 'debit') {
          latestBalance -= subsequent.amount;
        } else {
          latestBalance += subsequent.amount;
        }
      }

      accounts.push({
        bank,
        account,
        latestBalance,
        lastUpdated: sorted[sorted.length - 1].timestamp,
      });
    }

    // Run reconciliation checks to identify missing transactions
    let lastCheckpointBal: number | null = null;
    let lastCheckpointIdx = -1;

    for (let i = 0; i < sorted.length; i++) {
      const e = sorted[i];
      if (e.availableBalance !== undefined && e.availableBalance !== null) {
        if (lastCheckpointBal !== null) {
          // Add up net balance change between last checkpoint and current checkpoint
          let runningChange = 0;
          for (let j = lastCheckpointIdx + 1; j < i; j++) {
            const intermediate = sorted[j];
            const amt = intermediate.amount;
            if (intermediate.transactionType === 'debit') {
              runningChange -= amt;
            } else {
              runningChange += amt;
            }
          }

          // Factor in current transaction amount
          const curAmt = e.amount;
          if (e.transactionType === 'debit') {
            runningChange -= curAmt;
          } else {
            runningChange += curAmt;
          }

          const expectedBalance = lastCheckpointBal + runningChange;
          const actualBalance = e.availableBalance;
          const diff = actualBalance - expectedBalance;

          // Discrepancy > 0.05
          if (Math.abs(diff) > 0.05) {
            anomalies.push({
              bank,
              account,
              expectedBalance,
              actualBalance,
              missingAmount: Math.abs(diff),
              type: diff < 0 ? 'debit' : 'credit',
              startDate: sorted[lastCheckpointIdx].timestamp,
              endDate: e.timestamp,
            });
          }
        }
        lastCheckpointBal = e.availableBalance;
        lastCheckpointIdx = i;
      }
    }
  }

  // Handle toggling CC vs Debit
  const toggleAccountType = (bank: string, account: string) => {
    const key = `account_type::${bank}::${account}`;
    const saved = getSetting(key);
    
    // Auto-detect default if no override exists
    const list = accountGroups[`${bank}::${account}`] || [];
    const hasCCMode = list.some(e => e.paymentMode === 'cc' || /credit\s*card|cc\b/i.test(e.rawMessage));
    const defaultType = hasCCMode ? 'cc' : 'debit';
    
    const currentType = accountTypesOverride[key] || saved || defaultType;
    const nextType = currentType === 'cc' ? 'debit' : 'cc';
    
    setSetting(key, nextType);
    setAccountTypesOverride(prev => ({ ...prev, [key]: nextType }));
  };

  // Helper to retrieve live card type
  const getLiveCardType = (bank: string, account: string) => {
    const key = `account_type::${bank}::${account}`;
    const saved = getSetting(key);
    const list = accountGroups[`${bank}::${account}`] || [];
    const hasCCMode = list.some(e => e.paymentMode === 'cc' || /credit\s*card|cc\b/i.test(e.rawMessage));
    const defaultType = hasCCMode ? 'cc' : 'debit';
    return accountTypesOverride[key] || saved || defaultType;
  };

  // Separate Debit vs Credit Cards


  // Ignored Anomalies Actions
  const handleIgnoreAnomaly = (anomaly: MissingAnomaly) => {
    const sig = `${anomaly.bank}::${anomaly.account}::${anomaly.startDate}::${anomaly.endDate}`;
    const newList = [...ignoredSignatures, sig];
    setIgnoredSignatures(newList);
    setSetting('ignored_anomalies', JSON.stringify(newList));
  };

  const handleIgnoreAllAnomalies = () => {
    const newSigs = anomalies.map(item => `${item.bank}::${item.account}::${item.startDate}::${item.endDate}`);
    const newList = Array.from(new Set([...ignoredSignatures, ...newSigs]));
    setIgnoredSignatures(newList);
    setSetting('ignored_anomalies', JSON.stringify(newList));
  };

  const handleResetIgnoredAnomalies = () => {
    setIgnoredSignatures([]);
    setSetting('ignored_anomalies', '[]');
  };

  // Filter calculated anomalies to get visible/active ones
  const visibleAnomalies = anomalies.filter(item => {
    const sig = `${item.bank}::${item.account}::${item.startDate}::${item.endDate}`;
    return !ignoredSignatures.includes(sig);
  });

  const handleLogAnomaly = (anomaly: MissingAnomaly) => {
    const prefill: Expense = {
      amount: anomaly.missingAmount,
      merchant: `Missing ${anomaly.type === 'debit' ? 'Debit' : 'Credit'} Recovery`,
      alias: 'Manual Recovery',
      category: 'Other',
      confidence: 1.0,
      timestamp: Date.now(),
      source: 'manual',
      rawMessage: `Reconciliation Recovery: Missing ${anomaly.type === 'debit' ? 'debit' : 'credit'} of ${anomaly.missingAmount}`,
      transactionType: anomaly.type,
      bank: anomaly.bank,
      account: anomaly.account,
      paymentMode: 'cash',
    };
    setSelectedPrefill(prefill);
    setModalVisible(true);
  };

  const getCardColor = (bankName: string, accountNumber: string, type: 'cc' | 'debit') => {
    const name = bankName.toUpperCase();
    if (name.includes('ICICI')) return ['#4a148c', '#8e24aa']; // Purple
    if (name.includes('HDFC')) return ['#0d47a1', '#1976d2']; // Royal Blue
    if (name.includes('SBI')) return ['#006064', '#0097a7']; // Cyan/Teal
    if (name.includes('BOB')) return ['#e65100', '#f57c00']; // Orange
    if (name.includes('BOI')) return ['#1b5e20', '#388e3c']; // Green
    if (type === 'cc') return ['#111111', '#2c3e50']; // Sleek credit dark blue/black

    // Dynamic Hashing for unique debit card colors
    const str = `${bankName}::${accountNumber}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % CARD_PALETTES.length;
    return CARD_PALETTES[idx];
  };

  const renderCard = ({ item }: { item: AccountSummary }) => {
    const cardType = getLiveCardType(item.bank, item.account);
    const colors = getCardColor(item.bank, item.account, cardType);
    return (
      <View style={[styles.card, { backgroundColor: colors[0], borderColor: cardType === 'cc' ? '#c5a059' : 'transparent', borderWidth: cardType === 'cc' ? 1.5 : 0 }]}>
        <View style={styles.cardHeader}>
          <Text style={styles.bankName}>{item.bank.toUpperCase()}</Text>
          
          {/* Interactive Toggle Capsule */}
          <TouchableOpacity 
            style={[styles.toggleBadge, cardType === 'cc' ? styles.toggleBadgeCc : styles.toggleBadgeDebit]}
            onPress={() => toggleAccountType(item.bank, item.account)}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleBadgeText, cardType === 'cc' && styles.toggleBadgeTextCc]}>
              {cardType === 'cc' ? '💳 CREDIT CARD' : '🏦 DEBIT CARD'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.balance}>{formatAmount(item.latestBalance)}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.accountNumber}>A/C: •••• {item.account}</Text>
          <Text style={styles.lastUpdated}>Updated: {formatDate(item.lastUpdated)}</Text>
        </View>
      </View>
    );
  };

  // Filter accounts list side-by-side dynamically
  const displayedAccounts = accounts.filter(a => {
    const cardType = getLiveCardType(a.bank, a.account);
    if (selectedFilter === 'All') return true;
    return cardType === selectedFilter;
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Bank Sync & Ledger Accounts</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {accounts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No Bank Accounts Detected</Text>
            <Text style={styles.emptySubtext}>
              Once bank transactions with balance checkpoints are processed from SMS, your digital cards will appear here automatically.
            </Text>
          </View>
        ) : (
          <View>
            {/* Interactive Tab Switcher above the side-by-side list */}
            <View style={styles.filterTabs}>
              {[
                { id: 'All', label: 'All Cards' },
                { id: 'debit', label: 'Debit Cards' },
                { id: 'cc', label: 'Credit Cards' },
              ].map(tab => (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.filterTabBtn, selectedFilter === tab.id && styles.filterTabBtnActive]}
                  onPress={() => setSelectedFilter(tab.id as any)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterTabBtnText, selectedFilter === tab.id && styles.filterTabBtnTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Single Unified Card Slider (side-by-side) */}
            {displayedAccounts.length > 0 ? (
              <FlatList
                ref={flatListRef}
                data={displayedAccounts}
                keyExtractor={item => `${item.bank}-${item.account}`}
                renderItem={renderCard}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.cardList}
              />
            ) : (
              <View style={styles.emptyContainerCard}>
                <Text style={styles.emptyTextCard}>No cards match this filter</Text>
              </View>
            )}
          </View>
        )}

        {/* Anomalies Section */}
        {visibleAnomalies.length > 0 && (
          <View style={styles.anomalySection}>
            <View style={styles.anomalySectionHeader}>
              <Text style={styles.sectionTitleAnomaly}>⚠️ Reconciliation Discrepancies</Text>
              
              {/* Ignore All Option */}
              <TouchableOpacity style={styles.ignoreAllBtn} onPress={handleIgnoreAllAnomalies} activeOpacity={0.7}>
                <Text style={styles.ignoreAllBtnText}>Ignore All</Text>
              </TouchableOpacity>
            </View>

            {visibleAnomalies.map((item, idx) => (
              <View key={idx} style={styles.anomalyCard}>
                <View style={styles.anomalyHeader}>
                  <Text style={styles.anomalyTitle}>
                    Discrepancy in {item.bank} (•••• {item.account})
                  </Text>
                  <View style={[styles.badge, item.type === 'debit' ? styles.debitBadge : styles.creditBadge]}>
                    <Text style={styles.badgeText}>MISSING {item.type.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.anomalyDescription}>
                  Your latest balance reports are off by <Text style={styles.anomalyBold}>{formatAmount(item.missingAmount)}</Text>. 
                  Expected: <Text style={styles.expectedText}>{formatAmount(item.expectedBalance)}</Text> but bank reported: <Text style={styles.actualText}>{formatAmount(item.actualBalance)}</Text>.
                </Text>
                <Text style={styles.anomalyMeta}>
                  Between {new Date(item.startDate).toLocaleDateString()} and {new Date(item.endDate).toLocaleDateString()}
                </Text>

                <View style={styles.anomalyActionsRow}>
                  {/* Ignore Button */}
                  <TouchableOpacity
                    style={styles.ignoreSingleBtn}
                    onPress={() => handleIgnoreAnomaly(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.ignoreSingleText}>Ignore</Text>
                  </TouchableOpacity>

                  {/* Log Button */}
                  <TouchableOpacity
                    style={styles.logBtn}
                    onPress={() => handleLogAnomaly(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.logBtnText}>Log Missing Transaction</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Reconciled / Re-activate ignored stats */}
        {accounts.length > 0 && visibleAnomalies.length === 0 && (
          <View style={styles.reconciledState}>
            <Text style={styles.reconciledIcon}>✓</Text>
            <Text style={styles.reconciledText}>All Accounts Fully Reconciled</Text>
            <Text style={styles.reconciledSubtext}>
              Every bank balance reports are perfectly aligned with recorded expenses. No missing transactions detected.
            </Text>
          </View>
        )}

        {/* Option to Reset Ignored Anomalies if any exist */}
        {ignoredSignatures.length > 0 && (
          <TouchableOpacity 
            style={styles.resetIgnoredBtn} 
            onPress={handleResetIgnoredAnomalies}
            activeOpacity={0.7}
          >
            <Text style={styles.resetIgnoredBtnText}>🔄 Reset & Show {ignoredSignatures.length} Ignored Anomalies</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <EditTransactionModal
        expense={selectedPrefill}
        visible={modalVisible}
        onClose={() => {
          setSelectedPrefill(null);
          setModalVisible(false);
        }}
        onSave={() => {}}
        onAddManual={addManualExpense}
        isAddMode={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#1a73e8',
    paddingTop: 48,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  ccSectionContainer: {
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#202124',
    marginHorizontal: 16,
    marginTop: 22,
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  filterTabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 16,
    backgroundColor: '#e8eaed',
    borderRadius: 12,
    padding: 3,
  },
  filterTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  filterTabBtnActive: {
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 1.5,
  },
  filterTabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5f6368',
  },
  filterTabBtnTextActive: {
    color: '#1a73e8',
  },
  emptyContainerCard: {
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#dadce0',
    borderStyle: 'dashed',
    borderRadius: 16,
  },
  emptyTextCard: {
    fontSize: 13,
    color: '#80868b',
    fontWeight: '600',
  },
  anomalySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 10,
  },
  sectionTitleAnomaly: {
    fontSize: 15,
    fontWeight: '800',
    color: '#202124',
    letterSpacing: 0.2,
  },
  ignoreAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#f1f3f4',
    borderWidth: 1,
    borderColor: '#dadce0',
  },
  ignoreAllBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5f6368',
  },
  cardList: {
    paddingLeft: 16,
    paddingRight: 8,
  },
  card: {
    width: 280,
    height: 160,
    borderRadius: 16,
    padding: 20,
    marginRight: 12,
    justifyContent: 'space-between',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bankName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  toggleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  toggleBadgeDebit: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  toggleBadgeCc: {
    backgroundColor: 'rgba(197, 160, 89, 0.15)',
    borderColor: 'rgba(197, 160, 89, 0.4)',
  },
  toggleBadgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  toggleBadgeTextCc: {
    color: '#c5a059',
  },
  balance: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    marginVertical: 10,
    letterSpacing: -0.5,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accountNumber: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.95,
  },
  lastUpdated: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 10,
  },
  anomalySection: {
    marginTop: 8,
  },
  anomalyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#f4b400',
  },
  anomalyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  anomalyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#202124',
    flex: 1,
    marginRight: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  debitBadge: {
    backgroundColor: '#fce8e6',
  },
  creditBadge: {
    backgroundColor: '#e6f4ea',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  anomalyDescription: {
    fontSize: 13,
    color: '#5f6368',
    lineHeight: 18,
  },
  anomalyBold: {
    fontWeight: '800',
    color: '#202124',
  },
  expectedText: {
    color: '#c5221f',
    fontWeight: '700',
  },
  actualText: {
    color: '#137333',
    fontWeight: '700',
  },
  anomalyMeta: {
    fontSize: 11,
    color: '#9aa0a6',
    marginTop: 6,
    marginBottom: 14,
  },
  anomalyActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  ignoreSingleBtn: {
    flex: 1,
    backgroundColor: '#f1f3f4',
    borderWidth: 1,
    borderColor: '#dadce0',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ignoreSingleText: {
    color: '#5f6368',
    fontSize: 13,
    fontWeight: '700',
  },
  logBtn: {
    flex: 2.2,
    backgroundColor: '#1a73e8',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#fff',
    borderRadius: 16,
    margin: 16,
    elevation: 1,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#5f6368',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#9aa0a6',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  reconciledState: {
    alignItems: 'center',
    padding: 32,
    margin: 16,
  },
  reconciledIcon: {
    fontSize: 48,
    color: '#34a853',
    fontWeight: '700',
    marginBottom: 12,
  },
  reconciledText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#202124',
    marginBottom: 6,
  },
  reconciledSubtext: {
    fontSize: 13,
    color: '#5f6368',
    textAlign: 'center',
    lineHeight: 18,
  },
  resetIgnoredBtn: {
    marginTop: 10,
    marginHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#e8f0fe',
    borderWidth: 1,
    borderColor: '#1a73e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetIgnoredBtnText: {
    color: '#1a73e8',
    fontSize: 12,
    fontWeight: '700',
  },
});
