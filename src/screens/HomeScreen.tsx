import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { useExpenseStore } from '../hooks/useExpenses';
import { Expense } from '../types/expense';
import EditTransactionModal from '../components/EditTransactionModal';

function formatAmount(amount: number): string {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const formatted = absAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${isNegative ? '-' : ''}₹${formatted}`;
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

function ExpenseItem({ item, onPress }: { item: Expense, onPress: () => void }) {
  const isCredit = item.transactionType === 'credit';

  return (
    <TouchableOpacity style={styles.expenseItem} onPress={onPress}>
      <View style={styles.expenseLeft}>
        <Text style={styles.merchant}>{item.merchant}</Text>
        <Text style={styles.category}>{item.category}</Text>
        <Text style={styles.date}>{formatDate(item.timestamp)}</Text>
      </View>
      <View style={styles.expenseRight}>
        <Text style={[styles.amount, isCredit ? styles.credit : styles.debit]}>
          {isCredit ? '+' : '-'}
          {formatAmount(item.amount)}
        </Text>
        <View style={styles.badges}>
          {item.bank && <Text style={styles.bankBadge}>{item.bank}</Text>}
          <Text style={styles.paymentMode}>{item.paymentMode || ''}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const { expenses, loading, loadExpenses, updateExpense } = useExpenseStore();
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  const totalCredits = expenses
    .filter(e => e.transactionType === 'credit')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const totalDebits = expenses
    .filter(e => e.transactionType === 'debit')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const currentBalance = totalCredits - totalDebits;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Expense Tracker</Text>
        <View style={styles.totalCard}>
          <View style={styles.balanceSection}>
            <Text style={styles.totalLabel}>Current Balance</Text>
            <Text style={styles.totalAmount}>{formatAmount(currentBalance)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Income</Text>
              <Text style={styles.incomeAmount}>+{formatAmount(totalCredits)}</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Expense</Text>
              <Text style={styles.expenseAmount}>-{formatAmount(totalDebits)}</Text>
            </View>
          </View>
        </View>
      </View>

      <FlatList
        data={expenses}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => <ExpenseItem item={item} onPress={() => setEditingExpense(item)} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadExpenses} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No expenses yet</Text>
            <Text style={styles.emptySubtext}>
              Transactions will appear here automatically
            </Text>
          </View>
        }
      />

      <EditTransactionModal
        expense={editingExpense}
        visible={!!editingExpense}
        onClose={() => setEditingExpense(null)}
        onSave={updateExpense}
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
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  totalCard: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: 16,
  },
  totalLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  totalAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginTop: 2,
  },
  balanceSection: {
    marginBottom: 4,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginVertical: 10,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statCol: {
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
  },
  incomeAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#a5d6a7',
    marginTop: 1,
  },
  expenseAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ef9a9a',
    marginTop: 1,
  },
  list: {
    padding: 16,
  },
  expenseItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  expenseLeft: {
    flex: 1,
  },
  expenseRight: {
    alignItems: 'flex-end',
  },
  merchant: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  category: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  date: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
  },
  debit: {
    color: '#d32f2f',
  },
  credit: {
    color: '#2e7d32',
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  bankBadge: {
    fontSize: 10,
    backgroundColor: '#e3f2fd',
    color: '#1a73e8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '600',
    overflow: 'hidden',
  },
  paymentMode: {
    fontSize: 10,
    backgroundColor: '#f5f5f5',
    color: '#666',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    overflow: 'hidden',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
});
