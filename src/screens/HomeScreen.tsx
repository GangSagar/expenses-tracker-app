import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useExpenseStore } from '../hooks/useExpenses';
import { Expense } from '../types/expense';
import EditTransactionModal from '../components/EditTransactionModal';
import ExpenseItem from '../components/ExpenseItem';
import { formatAmount, getCategoryColor, getBankColor } from '../utils/formatHelpers';
import { getSetting } from '../database/expenseRepo';
import { generateBudgetInsights } from '../services/advisorService';

export default function HomeScreen() {
  const { expenses, loading, loadExpenses, updateExpense, addManualExpense } = useExpenseStore();
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isAddMode, setIsAddMode] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const isFocused = useIsFocused();
  const navigation = useNavigation<any>();
  const [budgetLimit, setBudgetLimit] = useState(20000);
  const [hiddenAccounts, setHiddenAccounts] = useState<string[]>([]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  useEffect(() => {
    if (isFocused) {
      const saved = getSetting('monthly_budget_limit', '20000');
      setBudgetLimit(Number(saved) || 20000);

      try {
        const savedHidden = getSetting('hidden_accounts', '[]');
        setHiddenAccounts(JSON.parse(savedHidden));
      } catch (e) {
        console.error('Failed to parse hidden accounts', e);
      }
    }
  }, [isFocused]);

  const activeExpenses = expenses.filter(e => !e.isInvalid);

  const totalCredits = activeExpenses
    .filter(e => e.transactionType === 'credit')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const totalDebits = activeExpenses
    .filter(e => e.transactionType === 'debit')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const currentBalance = totalCredits - totalDebits;

  // 1. Calculate Account Balances for Carousel (using live math delta logic)
  const accountGroups: Record<string, Expense[]> = {};
  for (const e of activeExpenses) {
    if (!e.bank || !e.account) continue;
    const key = `${e.bank}::${e.account}`;
    if (hiddenAccounts.includes(key)) continue; // Completely hide from calculations and UI
    if (!accountGroups[key]) accountGroups[key] = [];
    accountGroups[key].push(e);
  }

  const accountsList: { bank: string; account: string; balance: number; cardType: 'cc' | 'debit' }[] = [];
  for (const [key, list] of Object.entries(accountGroups)) {
    const [bank, account] = key.split('::');
    const sorted = [...list].sort((a, b) => a.timestamp - b.timestamp);
    const latestWithBal = [...sorted]
      .reverse()
      .find(e => e.availableBalance !== undefined && e.availableBalance !== null);

    if (latestWithBal && latestWithBal.availableBalance !== undefined) {
      let balance = latestWithBal.availableBalance;
      const latestIdx = sorted.indexOf(latestWithBal);
      for (let idx = latestIdx + 1; idx < sorted.length; idx++) {
        const subsequent = sorted[idx];
        if (subsequent.transactionType === 'debit') {
          balance -= subsequent.amount;
        } else {
          balance += subsequent.amount;
        }
      }

      // Check persisted cardType override or auto default
      const typeKey = `account_type::${bank}::${account}`;
      const saved = getSetting(typeKey);
      const hasCCMode = list.some(e => e.paymentMode === 'cc' || /credit\s*card|cc\b/i.test(e.rawMessage));
      const cardType = (saved || (hasCCMode ? 'cc' : 'debit')) as 'cc' | 'debit';

      accountsList.push({ bank, account, balance, cardType });
    }
  }

  // 2. Calculate Category Insights (Top 3 Debits)
  const categoryTotals = activeExpenses
    .filter(e => e.transactionType === 'debit')
    .reduce((acc, e) => {
      const cat = e.category || 'Other';
      acc[cat] = (acc[cat] || 0) + e.amount;
      return acc;
    }, {} as Record<string, number>);

  const totalDebit = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0);

  const topCategories = Object.entries(categoryTotals)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: totalDebit > 0 ? (amount / totalDebit) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);



  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setIsAddMode(false);
    setModalVisible(true);
  };

  const handleAddCash = () => {
    setEditingExpense(null);
    setIsAddMode(true);
    setModalVisible(true);
  };

  const handleAddSplit = () => {
    // Intelligently pre-populate one empty split contact to trigger Splits mode in modal
    setEditingExpense({
      amount: 0,
      merchant: '',
      category: 'Other',
      source: 'manual',
      transactionType: 'debit',
      splits: [{ contactName: '', amount: 0 }],
    } as any);
    setIsAddMode(true);
    setModalVisible(true);
  };

  const insights = generateBudgetInsights(expenses, budgetLimit);
  const recentExpenses = activeExpenses.slice(0, 5);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a73e8" />
      
      {/* Fixed Header Section at the Top */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Dashboard</Text>
        <View style={styles.totalCard}>
          <View style={styles.cardContainerRow}>
            {/* Left Column: Total bank balance */}
            <View style={styles.mainBalanceCol}>
              <Text style={styles.totalLabel}>TOTAL BANK BALANCE</Text>
              <Text style={styles.totalAmount}>
                {formatAmount(
                  accountsList.filter(acc => acc.cardType === 'debit').length > 0
                    ? accountsList.filter(acc => acc.cardType === 'debit').reduce((sum, acc) => sum + acc.balance, 0)
                    : currentBalance
                )}
              </Text>
            </View>

            {/* Vertical Divider */}
            <View style={styles.verticalDividerHeader} />

            {/* Right Column: Spent / Received side stats */}
            <View style={styles.statsColHeader}>
              <View style={styles.statItemHeader}>
                <Text style={styles.statLabelHeader}>↗ RECEIVED</Text>
                <Text style={styles.incomeAmountHeader}>+{formatAmount(totalCredits)}</Text>
              </View>
              <View style={styles.statItemHeaderSpacer} />
              <View style={styles.statItemHeader}>
                <Text style={styles.statLabelHeader}>↘ SPENT</Text>
                <Text style={styles.expenseAmountHeader}>-{formatAmount(totalDebits)}</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Scrollable Dashboard Context */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadExpenses} />
        }
      >

        {/* AI Budget Insights Glassmorphic Card */}
        <View style={styles.aiInsightsCard}>
          <View style={styles.insightsHeader}>
            <Text style={styles.insightsHeading}>✨ SMART AI ADVISOR</Text>
            <View style={[
              styles.insightsBadge,
              insights.status === 'good' ? styles.insightsBadgeGood :
              insights.status === 'warning' ? styles.insightsBadgeWarning :
              styles.insightsBadgeDanger
            ]}>
              <Text style={[
                styles.insightsBadgeText,
                insights.status === 'good' ? styles.badgeTextGood :
                insights.status === 'warning' ? styles.badgeTextWarning :
                styles.badgeTextDanger
              ]}>
                {insights.status === 'good' ? 'ON TRACK' :
                 insights.status === 'warning' ? 'WARNING' : 'CRITICAL'}
              </Text>
            </View>
          </View>
          <Text style={styles.insightsHeadline}>{insights.headline}</Text>
          <Text style={styles.insightsMessage}>{insights.message}</Text>
          
          {budgetLimit > 0 && insights.dailyBurnRate > 0 && (
            <View style={styles.insightsStats}>
              <View style={styles.insightsStatItem}>
                <Text style={styles.insightsStatLabel}>BURN RATE</Text>
                <Text style={styles.insightsStatVal}>₹{insights.dailyBurnRate}/day</Text>
              </View>
              <View style={styles.insightsStatDivider} />
              <View style={styles.insightsStatItem}>
                <Text style={styles.insightsStatLabel}>PROJECTED</Text>
                <Text style={[
                  styles.insightsStatVal,
                  insights.projectedExpense > budgetLimit ? styles.textDanger : styles.textSuccess
                ]}>₹{insights.projectedExpense.toLocaleString('en-IN')}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Quick Actions Shortcuts */}
        <View style={styles.quickActionCard}>
          <Text style={styles.sectionHeading}>Quick Actions</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleAddCash}>
              <Text style={styles.actionIcon}>💵</Text>
              <Text style={styles.actionText}>Add Cash</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={handleAddSplit}>
              <Text style={styles.actionIcon}>👥</Text>
              <Text style={styles.actionText}>Split Bill</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Accounts')}>
              <Text style={styles.actionIcon}>🏦</Text>
              <Text style={styles.actionText}>Accounts</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Miniature Bank Cards Carousel */}
        {accountsList.length > 0 && (
          <View style={styles.carouselContainer}>
            <Text style={styles.sectionHeading}>Your Bank Accounts</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carouselScroll}
            >
              {accountsList.map((acc) => {
                const colors = getBankColor(acc.bank);
                return (
                  <TouchableOpacity
                    key={`${acc.bank}-${acc.account}`}
                    style={[styles.bankMiniCard, { backgroundColor: colors[0] }]}
                    onPress={() => navigation.navigate('Accounts')}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.bankName}>{acc.bank}</Text>
                    <Text style={styles.bankNumber}>•••• {acc.account}</Text>
                    <View style={styles.cardBalanceRow}>
                      <Text style={styles.bankBalanceLabel}>Balance</Text>
                      <Text style={styles.bankBalance}>{formatAmount(acc.balance)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Top Spending Analytics */}
        {topCategories.length > 0 && (
          <View style={styles.insightsCard}>
            <Text style={styles.sectionHeading}>Spending Insights</Text>
            <View style={styles.insightsList}>
              {topCategories.map((cat, index) => {
                const color = getCategoryColor(cat.category, index);
                return (
                  <View key={cat.category} style={styles.insightItem}>
                    <View style={styles.insightHeader}>
                      <Text style={styles.insightCategory}>{cat.category}</Text>
                      <Text style={styles.insightAmount}>
                        ₹{cat.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({cat.percentage.toFixed(2)}%)
                      </Text>
                    </View>
                    <View style={styles.progressBg}>
                      <View
                        style={[
                          styles.progressFill,
                          { backgroundColor: color, width: `${cat.percentage}%` },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Recent Activity Section */}
        <View style={styles.recentActivityHeader}>
          <Text style={styles.sectionHeading}>Recent Transactions</Text>
          {expenses.length > 5 && (
            <TouchableOpacity onPress={() => navigation.navigate('History')}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          )}
        </View>

        {recentExpenses.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No transactions yet</Text>
            <Text style={styles.emptySubtext}>Your recent activity will be listed here.</Text>
          </View>
        ) : (
          <View style={styles.recentList}>
            {recentExpenses.map(item => (
              <ExpenseItem
                key={String(item.id)}
                item={item}
                onPress={() => handleEditExpense(item)}
              />
            ))}
          </View>
        )}

        {recentExpenses.length > 0 && (
          <TouchableOpacity
            style={styles.viewHistoryBtn}
            onPress={() => navigation.navigate('History')}
            activeOpacity={0.8}
          >
            <Text style={styles.viewHistoryBtnText}>View Full Ledger History →</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Manual Transaction Float Trigger */}
      <TouchableOpacity style={styles.fab} onPress={handleAddCash} activeOpacity={0.8}>
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      <EditTransactionModal
        expense={editingExpense}
        visible={modalVisible}
        onClose={() => {
          setEditingExpense(null);
          setModalVisible(false);
        }}
        onSave={updateExpense}
        onAddManual={addManualExpense}
        isAddMode={isAddMode}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    backgroundColor: '#1a73e8',
    paddingTop: 48,
    paddingBottom: 24,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  totalCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cardContainerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mainBalanceCol: {
    flex: 1.3,
    justifyContent: 'center',
  },
  totalLabel: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginTop: 2,
    letterSpacing: -0.5,
  },
  verticalDividerHeader: {
    width: 1,
    height: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginHorizontal: 8,
  },
  statsColHeader: {
    flex: 1,
    justifyContent: 'center',
  },
  statItemHeader: {
    alignItems: 'flex-start',
  },
  statItemHeaderSpacer: {
    height: 6,
  },
  statLabelHeader: {
    fontSize: 8,
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  incomeAmountHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#a5d6a7',
    marginTop: 1,
  },
  expenseAmountHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ef9a9a',
    marginTop: 1,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#202124',
    marginBottom: 12,
  },
  quickActionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e8eaed',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  actionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5f6368',
  },
  carouselContainer: {
    marginTop: 20,
    paddingLeft: 16,
  },
  carouselScroll: {
    paddingRight: 16,
    gap: 12,
  },
  bankMiniCard: {
    width: 160,
    height: 100,
    borderRadius: 14,
    padding: 12,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  bankName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
    opacity: 0.95,
  },
  bankNumber: {
    fontSize: 10,
    color: '#fff',
    opacity: 0.7,
    marginTop: -16,
  },
  cardBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  bankBalanceLabel: {
    fontSize: 8,
    color: '#fff',
    opacity: 0.8,
    textTransform: 'uppercase',
  },
  bankBalance: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  insightsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e8eaed',
  },
  insightsList: {
    gap: 12,
  },
  insightItem: {
    width: '100%',
  },
  insightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  insightCategory: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3c4043',
  },
  insightAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#202124',
  },
  progressBg: {
    height: 6,
    backgroundColor: '#f1f3f4',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  recentActivityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 10,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a73e8',
  },
  recentList: {
    marginHorizontal: 16,
    gap: 8,
  },
  expenseItem: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e8eaed',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  expenseLeft: {
    flex: 1,
  },
  expenseRight: {
    alignItems: 'flex-end',
  },
  merchant: {
    fontSize: 14,
    fontWeight: '600',
    color: '#202124',
  },
  category: {
    fontSize: 11,
    color: '#5f6368',
    marginTop: 2,
  },
  date: {
    fontSize: 10,
    color: '#9cc0e0',
    marginTop: 4,
    display: 'none', // Hide standard simple date, we place formatting
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
  },
  debit: {
    color: '#d93025',
  },
  credit: {
    color: '#188038',
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  bankBadge: {
    fontSize: 9,
    backgroundColor: '#e8f0fe',
    color: '#1a73e8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '700',
  },
  paymentMode: {
    fontSize: 9,
    backgroundColor: '#f1f3f4',
    color: '#5f6368',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  splitBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f4ea',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  splitBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#137333',
  },
  viewHistoryBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#1a73e8',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 16,
  },
  viewHistoryBtnText: {
    color: '#1a73e8',
    fontSize: 13,
    fontWeight: '700',
  },
  empty: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e8eaed',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5f6368',
  },
  emptySubtext: {
    fontSize: 11,
    color: '#80868b',
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    backgroundColor: '#1a73e8',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabIcon: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '700',
    marginTop: -2,
  },
  aiInsightsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e8eaed',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  insightsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  insightsHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#5f6368',
    letterSpacing: 0.5,
  },
  insightsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  insightsBadgeGood: {
    backgroundColor: '#e6f4ea',
  },
  insightsBadgeWarning: {
    backgroundColor: '#fef7e0',
  },
  insightsBadgeDanger: {
    backgroundColor: '#fce8e6',
  },
  insightsBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  badgeTextGood: {
    color: '#137333',
  },
  badgeTextWarning: {
    color: '#b06000',
  },
  badgeTextDanger: {
    color: '#c5221f',
  },
  insightsHeadline: {
    fontSize: 15,
    fontWeight: '700',
    color: '#202124',
    marginBottom: 6,
  },
  insightsMessage: {
    fontSize: 13,
    color: '#5f6368',
    lineHeight: 18,
  },
  insightsStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
  },
  insightsStatItem: {
    flex: 1,
  },
  insightsStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#80868b',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  insightsStatVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#202124',
  },
  insightsStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#dadce0',
    marginHorizontal: 16,
  },
  textDanger: {
    color: '#c5221f',
  },
  textSuccess: {
    color: '#137333',
  },
});
