import React, { useState } from 'react';
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
  });
}

export default function AccountsScreen() {
  const { expenses, addManualExpense } = useExpenseStore();
  const [selectedPrefill, setSelectedPrefill] = useState<Expense | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

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

          // Factor in the current transaction's amount too, since availableBalance checkpoint
          // reflects the balance *after* the current transaction has posted.
          const curAmt = e.amount;
          if (e.transactionType === 'debit') {
            runningChange -= curAmt;
          } else {
            runningChange += curAmt;
          }

          const expectedBalance = lastCheckpointBal + runningChange;
          const actualBalance = e.availableBalance;
          const diff = actualBalance - expectedBalance;

          // Discrepancy > 0.05 (to account for rounding errors)
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

  const handleLogAnomaly = (anomaly: MissingAnomaly) => {
    // Generate a pre-filled expense object
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

  const getCardColor = (bankName: string) => {
    const name = bankName.toUpperCase();
    if (name.includes('ICICI')) return ['#4a148c', '#8e24aa']; // Purple
    if (name.includes('HDFC')) return ['#0d47a1', '#1976d2']; // Royal Blue
    if (name.includes('SBI')) return ['#006064', '#0097a7']; // Cyan/Teal
    if (name.includes('BOB')) return ['#e65100', '#f57c00']; // Orange
    if (name.includes('BOI')) return ['#1b5e20', '#388e3c']; // Green
    return ['#212121', '#424242']; // Sleek Dark Gray
  };

  const renderCard = ({ item }: { item: AccountSummary }) => {
    const colors = getCardColor(item.bank);
    return (
      <View style={[styles.card, { backgroundColor: colors[0] }]}>
        <View style={styles.cardHeader}>
          <Text style={styles.bankName}>{item.bank.toUpperCase()}</Text>
          <Text style={styles.cardType}>ACCOUNT LEDGER</Text>
        </View>
        <Text style={styles.balance}>{formatAmount(item.latestBalance)}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.accountNumber}>A/C: •••• {item.account}</Text>
          <Text style={styles.lastUpdated}>Updated: {formatDate(item.lastUpdated)}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Bank Sync & Reconciliation</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {accounts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No Bank Accounts Detected</Text>
            <Text style={styles.emptySubtext}>
              Once bank transactions with balance checkpoints are processed from SMS, your digital cards will appear here.
            </Text>
          </View>
        ) : (
          <View>
            <Text style={styles.sectionTitle}>My Digital Cards</Text>
            <FlatList
              data={accounts}
              keyExtractor={item => `${item.bank}-${item.account}`}
              renderItem={renderCard}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cardList}
            />
          </View>
        )}

        {anomalies.length > 0 && (
          <View style={styles.anomalySection}>
            <Text style={styles.sectionTitle}>⚠️ Reconciliation Anomalies Detected</Text>
            {anomalies.map((item, idx) => (
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
                <TouchableOpacity
                  style={styles.logBtn}
                  onPress={() => handleLogAnomaly(item)}
                >
                  <Text style={styles.logBtnText}>Log Missing Transaction</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {accounts.length > 0 && anomalies.length === 0 && (
          <View style={styles.reconciledState}>
            <Text style={styles.reconciledIcon}>✓</Text>
            <Text style={styles.reconciledText}>All Accounts Fully Reconciled</Text>
            <Text style={styles.reconciledSubtext}>
              Every bank balance reports are perfectly aligned with recorded expenses. No missing transactions detected.
            </Text>
          </View>
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
    fontWeight: '600',
    color: '#fff',
  },
  scrollContent: {
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#202124',
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 12,
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
    fontSize: 16,
    fontWeight: '700',
  },
  cardType: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 10,
    fontWeight: '700',
  },
  balance: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    marginVertical: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accountNumber: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  lastUpdated: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 10,
  },
  anomalySection: {
    marginTop: 16,
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
    fontWeight: '700',
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
    fontWeight: '700',
  },
  anomalyDescription: {
    fontSize: 13,
    color: '#5f6368',
    lineHeight: 18,
  },
  anomalyBold: {
    fontWeight: '700',
    color: '#202124',
  },
  expectedText: {
    color: '#c5221f',
    fontWeight: '600',
  },
  actualText: {
    color: '#137333',
    fontWeight: '600',
  },
  anomalyMeta: {
    fontSize: 11,
    color: '#9aa0a6',
    marginTop: 6,
    marginBottom: 12,
  },
  logBtn: {
    backgroundColor: '#1a73e8',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  logBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
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
    fontSize: 16,
    fontWeight: '700',
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
    fontWeight: '700',
    color: '#202124',
    marginBottom: 6,
  },
  reconciledSubtext: {
    fontSize: 13,
    color: '#5f6368',
    textAlign: 'center',
    lineHeight: 18,
  },
});
