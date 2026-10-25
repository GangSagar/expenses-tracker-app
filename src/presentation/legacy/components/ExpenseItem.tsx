import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Expense } from '../../../types/expense';
import { formatAmount } from '../../../utils/formatHelpers';

interface ExpenseItemProps {
  item: Expense;
  onPress: () => void;
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

export default function ExpenseItem({ item, onPress }: ExpenseItemProps) {
  const isCredit = item.transactionType === 'credit';

  return (
    <TouchableOpacity style={styles.expenseItem} onPress={onPress}>
      <View style={styles.expenseLeft}>
        <Text style={styles.merchant}>{item.merchant || 'Unknown'}</Text>
        <Text style={styles.category}>{item.category}</Text>
        <Text style={styles.dateText}>{formatDate(item.timestamp)}</Text>
        {item.splits && item.splits.length > 0 && (
          <View style={styles.splitBadgeContainer}>
            <Text style={styles.splitBadgeText}>
              👥 Split: {item.splits.map(s => `${s.contactName} (₹${s.amount})`).join(', ')}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.expenseRight}>
        <Text style={[styles.amount, isCredit ? styles.credit : styles.debit]}>
          {isCredit ? '+' : '-'}
          {formatAmount(item.amount)}
        </Text>
        <View style={styles.badges}>
          {item.bank && <Text style={styles.bankBadge}>{item.bank}</Text>}
          {item.paymentMode && <Text style={styles.paymentMode}>{item.paymentMode}</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
  dateText: {
    fontSize: 10,
    color: '#9cc0e0',
    marginTop: 4,
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
});
