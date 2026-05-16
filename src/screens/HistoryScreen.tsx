import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SectionList } from 'react-native';
import { useExpenseStore } from '../hooks/useExpenses';
import { Expense } from '../types/expense';

interface Section {
  title: string;
  data: Expense[];
  total: number;
}

function groupByDate(expenses: Expense[]): Section[] {
  const groups: Record<string, Expense[]> = {};

  for (const expense of expenses) {
    const date = new Date(expense.timestamp);
    const key = date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(expense);
  }

  return Object.entries(groups).map(([title, data]) => ({
    title,
    data,
    total: data.reduce((sum, e) => {
      const amt = Number(e.amount) || 0;
      return e.transactionType === 'credit' ? sum + amt : sum - amt;
    }, 0),
  }));
}

function formatAmount(amount: number): string {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const formatted = absAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${isNegative ? '-' : ''}₹${formatted}`;
}

export default function HistoryScreen() {
  const { expenses, loadExpenses } = useExpenseStore();
  const [sections, setSections] = useState<Section[]>([]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  useEffect(() => {
    setSections(groupByDate(expenses));
  }, [expenses]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={item => String(item.id)}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionTotal}>
              {formatAmount(section.total)}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={styles.itemLeft}>
              <Text style={styles.merchant}>{item.merchant}</Text>
              <Text style={styles.category}>{item.category}</Text>
            </View>
            <Text
              style={[
                styles.amount,
                item.transactionType === 'credit'
                  ? styles.credit
                  : styles.debit,
              ]}
            >
              {item.transactionType === 'credit' ? '+' : '-'}
              {formatAmount(item.amount)}
            </Text>
          </View>
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No transaction history</Text>
          </View>
        }
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
  list: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  sectionTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a73e8',
  },
  item: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemLeft: {
    flex: 1,
  },
  merchant: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  category: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
  },
  debit: {
    color: '#d32f2f',
  },
  credit: {
    color: '#2e7d32',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});
