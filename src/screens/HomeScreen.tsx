import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
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
import { formatAmount, getCategoryColor } from '../utils/formatHelpers';
import BankCard from '../components/BankCard';
import { getSetting } from '../database/expenseRepo';
import { generateBudgetInsights } from '../services/advisorService';
import commonStyles from '../styles/commonStyles';
import styles from '../styles/HomeScreenStyles';


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

    let balance = 0;
    if (latestWithBal && latestWithBal.availableBalance !== undefined) {
      balance = latestWithBal.availableBalance;
      const latestIdx = sorted.indexOf(latestWithBal);
      for (let idx = latestIdx + 1; idx < sorted.length; idx++) {
        const subsequent = sorted[idx];
        if (subsequent.transactionType === 'debit') {
          balance -= subsequent.amount;
        } else {
          balance += subsequent.amount;
        }
      }
    } else {
      // Fallback: Accumulate transaction deltas to get dynamic balance flow.
      for (const item of sorted) {
        if (item.transactionType === 'debit') {
          balance -= item.amount;
        } else {
          balance += item.amount;
        }
      }
    }

    // Check persisted cardType override or auto default
    const typeKey = `account_type::${bank}::${account}`;
    const saved = getSetting(typeKey);
    const hasCCMode = list.some(e => e.paymentMode === 'cc' || /credit\s*card|cc\b/i.test(e.rawMessage));
    const cardType = (saved || (hasCCMode ? 'cc' : 'debit')) as 'cc' | 'debit';

    accountsList.push({ bank, account, balance, cardType });
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
    <View style={commonStyles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a73e8" />
      
      {/* Fixed Header Section at the Top */}
      <View style={commonStyles.header}>
        <Text style={commonStyles.headerTitle}>Dashboard</Text>
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
          <Text style={commonStyles.sectionHeading}>Quick Actions</Text>
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
            <Text style={commonStyles.sectionHeading}>Your Bank Accounts</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carouselScroll}
            >
              {accountsList.map((acc) => (
                <BankCard
                  key={`${acc.bank}-${acc.account}`}
                  bank={acc.bank}
                  account={acc.account}
                  balance={acc.balance}
                  cardType={acc.cardType}
                  variant="mini"
                  onPress={() => navigation.navigate('Accounts')}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Top Spending Analytics */}
        {topCategories.length > 0 && (
          <View style={styles.insightsCard}>
            <Text style={commonStyles.sectionHeading}>Spending Insights</Text>
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
          <Text style={commonStyles.sectionHeading}>Recent Transactions</Text>
          {expenses.length > 5 && (
            <TouchableOpacity onPress={() => navigation.navigate('History')}>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          )}
        </View>

        {recentExpenses.length === 0 ? (
          <View style={commonStyles.empty}>
            <Text style={commonStyles.emptyText}>No transactions yet</Text>
            <Text style={commonStyles.emptySubtext}>Your recent activity will be listed here.</Text>
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
      <TouchableOpacity style={commonStyles.fab} onPress={handleAddCash} activeOpacity={0.8}>
        <Text style={commonStyles.fabIcon}>+</Text>
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

