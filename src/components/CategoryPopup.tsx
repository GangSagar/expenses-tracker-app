import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Category, Expense } from '../types/expense';
import { useExpenseStore } from '../hooks/useExpenses';
import { saveExpense } from '../services/expenseService';
import { setMerchantMapping } from '../core/classifier';
import { saveMerchantCategory } from '../database/expenseRepo';

import { CATEGORIES } from '../constants/appOptions';

function formatAmount(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export default function CategoryPopup() {
  const pendingExpenses = useExpenseStore(state => state.pendingExpenses);
  const popPendingExpense = useExpenseStore(state => state.popPendingExpense);
  const addExpense = useExpenseStore(state => state.addExpense);

  const pendingExpense = pendingExpenses[0];

  if (!pendingExpense) {
    return null;
  }

  const handleCategorySelect = (category: Category) => {
    const updated = { ...pendingExpense, category };

    // Save to DB
    const id = saveExpense(updated);
    if (id !== null) {
      addExpense({ ...updated, id } as Expense);
    }

    // Update merchant map for future auto-classification using alias
    const effectiveAlias = pendingExpense.alias || pendingExpense.merchant;
    if (effectiveAlias && effectiveAlias !== 'Unknown') {
      saveMerchantCategory(effectiveAlias, category, pendingExpense.merchant);
      setMerchantMapping(effectiveAlias, category, pendingExpense.merchant);
    }

    popPendingExpense();
  };

  const handleDismiss = () => {
    popPendingExpense();
  };

  return (
    <Modal visible transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.popup}>
          <Text style={styles.title}>New Transaction</Text>
          <Text style={styles.amount}>
            {formatAmount(pendingExpense.amount)} at {pendingExpense.merchant}
          </Text>

          <Text style={styles.subtitle}>Select Category:</Text>
          <ScrollView style={styles.categoryList}>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map(category => (
                <TouchableOpacity
                  key={category}
                  style={[
                    styles.categoryButton,
                    pendingExpense.category === category &&
                      styles.categoryActive,
                  ]}
                  onPress={() => handleCategorySelect(category)}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      pendingExpense.category === category &&
                        styles.categoryTextActive,
                    ]}
                  >
                    {category}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <TouchableOpacity
            style={styles.dismissButton}
            onPress={handleDismiss}
          >
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
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
    maxHeight: '70%',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  amount: {
    fontSize: 16,
    color: '#333',
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  categoryList: {
    maxHeight: 250,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  categoryActive: {
    backgroundColor: '#1a73e8',
  },
  categoryText: {
    fontSize: 13,
    color: '#333',
  },
  categoryTextActive: {
    color: '#fff',
  },
  dismissButton: {
    marginTop: 16,
    alignItems: 'center',
    padding: 12,
  },
  dismissText: {
    fontSize: 14,
    color: '#999',
  },
});
