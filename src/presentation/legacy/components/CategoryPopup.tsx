import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Category } from '../../../types/expense';
import { useExpenseStore } from '../../../hooks/useExpenses';
import { saveExpense } from '../../../services/expenseService';
import { setMerchantMapping } from '../../../core/classifier';
import { CATEGORIES } from '../../../constants/appOptions';
import { formatAmount } from '../../../utils/formatHelpers';
import { defaultLearningEngine } from '../../../core/parser/learning';

export default function CategoryPopup() {
  const pendingExpenses = useExpenseStore(state => state.pendingExpenses);
  const popPendingExpense = useExpenseStore(state => state.popPendingExpense);
  const addExpense = useExpenseStore(state => state.addExpense);
  const { expenses, loadExpenses } = useExpenseStore();

  const pendingExpense = pendingExpenses[0];

  const [selectedCategory, setSelectedCategory] = useState<Category>('Other');
  const [showRawSMS, setShowRawSMS] = useState(false);

  // Sync state with incoming pending transaction
  useEffect(() => {
    if (pendingExpense) {
      setSelectedCategory(pendingExpense.category);
      setShowRawSMS(false);
    }
  }, [pendingExpense]);

  // Load history for context
  useEffect(() => {
    if (pendingExpense && expenses.length === 0) {
      loadExpenses();
    }
  }, [pendingExpense, expenses.length, loadExpenses]);

  if (!pendingExpense) {
    return null;
  }

  const handleApprove = () => {
    const updated = { ...pendingExpense, category: selectedCategory };

    // Save to SQLite
    const saved = saveExpense(updated);
    if (saved.status === 'saved') {
      addExpense(saved.transaction, saved.repaymentUpdates);
    } else if (saved.status === 'failed') {
      console.error('Failed to persist reviewed transaction:', saved.message);
      return;
    }

    // Save mapping to classifier so we learn user preference
    const effectiveAlias = pendingExpense.alias || pendingExpense.merchant;
    if (
      effectiveAlias &&
      effectiveAlias !== 'Unknown' &&
      pendingExpense.category !== selectedCategory
    ) {
      setMerchantMapping(effectiveAlias, selectedCategory, pendingExpense.merchant);
      defaultLearningEngine.learn(effectiveAlias, pendingExpense.merchant, selectedCategory);
    }

    popPendingExpense();
  };

  const handleDismiss = () => {
    popPendingExpense();
  };

  const recentContext = expenses.filter(e => !e.isInvalid).slice(0, 3);

  const isCredit = pendingExpense.transactionType === 'credit';
  const displayTime = new Date(pendingExpense.timestamp).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const displayDate = new Date(pendingExpense.timestamp).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });

  return (
    <Modal visible transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.popup}>
          {/* Grab Bar Indicator */}
          <View style={styles.grabBar} />

          <Text style={styles.title}>✨ Approve Transaction</Text>
          <Text style={styles.helperText}>Confirm and categorize this transaction before it's saved.</Text>

          {/* Core Transaction Card */}
          <View style={[styles.mainCard, isCredit ? styles.cardCredit : styles.cardDebit]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardBank}>{pendingExpense.bank || 'Unknown Bank'}</Text>
              <Text style={styles.cardMeta}>{displayDate} • {displayTime}</Text>
            </View>

            <View style={styles.amountRow}>
              <Text style={[styles.amountText, isCredit ? styles.amountCredit : styles.amountDebit]}>
                {isCredit ? '+' : '-'}{formatAmount(pendingExpense.amount)}
              </Text>
              <Text style={styles.merchantText}>{pendingExpense.merchant || 'Unknown Merchant'}</Text>
            </View>

            <View style={styles.cardFooter}>
              <Text style={styles.cardAccount}>A/C: •••• {pendingExpense.account || 'N/A'}</Text>
              <Text style={styles.cardSource}>
                {pendingExpense.source === 'sms' ? '💬 SMS Intercept' : '🔔 System Alert'}
              </Text>
            </View>
          </View>

          {/* Raw SMS Message Collapsible */}
          {pendingExpense.rawMessage ? (
            <View style={styles.rawSmsContainer}>
              <TouchableOpacity
                onPress={() => setShowRawSMS(!showRawSMS)}
                style={styles.rawSmsToggle}
                activeOpacity={0.7}
              >
                <Text style={styles.rawSmsToggleText}>
                  {showRawSMS ? '📖 Hide original text' : '📖 View original message'}
                </Text>
              </TouchableOpacity>
              {showRawSMS && (
                <View style={styles.rawSmsBox}>
                  <Text style={styles.rawSmsText}>{pendingExpense.rawMessage}</Text>
                </View>
              )}
            </View>
          ) : null}

          {/* Recent History Context */}
          <View style={styles.historyContextSection}>
            <Text style={styles.sectionHeader}>📜 Recent History Context</Text>
            {recentContext.length === 0 ? (
              <Text style={styles.emptyHistoryContext}>No prior history for reference</Text>
            ) : (
              <View style={styles.historyList}>
                {recentContext.map((item, idx) => (
                  <View key={item.id || idx} style={styles.historyItem}>
                    <View style={styles.historyLeft}>
                      <Text style={styles.historyMerchant}>{item.merchant}</Text>
                      <Text style={styles.historyCategory}>{item.category}</Text>
                    </View>
                    <View style={styles.historyRight}>
                      <Text style={[
                        styles.historyAmount,
                        item.transactionType === 'credit' ? styles.historyAmtCredit : styles.historyAmtDebit
                      ]}>
                        {item.transactionType === 'credit' ? '+' : '-'}{formatAmount(item.amount)}
                      </Text>
                      <Text style={styles.historyDate}>
                        {new Date(item.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Category Selector */}
          <Text style={styles.sectionHeader}>📂 Choose Category</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={styles.categoryScroll}
          >
            {CATEGORIES.map(category => {
              const isActive = selectedCategory === category;
              return (
                <TouchableOpacity
                  key={category}
                  style={[styles.categoryPill, isActive && styles.categoryPillActive]}
                  onPress={() => setSelectedCategory(category)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.categoryPillText, isActive && styles.categoryPillTextActive]}>
                    {category}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Persistent Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.dismissButton}
              onPress={handleDismiss}
              activeOpacity={0.8}
            >
              <Text style={styles.dismissButtonText}>Ignore / Dismiss</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.approveButton}
              onPress={handleApprove}
              activeOpacity={0.8}
            >
              <Text style={styles.approveButtonText}>Approve & Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  popup: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 24,
  },
  grabBar: {
    width: 40,
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: '#202124',
    textAlign: 'center',
  },
  helperText: {
    fontSize: 12,
    color: '#5f6368',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  mainCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardDebit: {
    backgroundColor: '#fce8e6',
    borderColor: '#fad2cf',
  },
  cardCredit: {
    backgroundColor: '#e6f4ea',
    borderColor: '#ceead6',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardBank: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3c4043',
    textTransform: 'uppercase',
  },
  cardMeta: {
    fontSize: 11,
    color: '#5f6368',
    fontWeight: '500',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  amountText: {
    fontSize: 26,
    fontWeight: '800',
  },
  amountDebit: {
    color: '#c5221f',
  },
  amountCredit: {
    color: '#137333',
  },
  merchantText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#202124',
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    paddingTop: 8,
  },
  cardAccount: {
    fontSize: 12,
    color: '#5f6368',
    fontWeight: '600',
  },
  cardSource: {
    fontSize: 10,
    color: '#80868b',
    fontWeight: '700',
  },
  rawSmsContainer: {
    marginTop: 8,
  },
  rawSmsToggle: {
    paddingVertical: 6,
    alignSelf: 'center',
  },
  rawSmsToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1a73e8',
  },
  rawSmsBox: {
    backgroundColor: '#f1f3f4',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e8eaed',
    marginTop: 4,
  },
  rawSmsText: {
    fontSize: 11,
    color: '#5f6368',
    fontStyle: 'italic',
    lineHeight: 15,
  },
  historyContextSection: {
    marginVertical: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e8eaed',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: '#3c4043',
    letterSpacing: 0.3,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  emptyHistoryContext: {
    fontSize: 12,
    color: '#9aa0a6',
    textAlign: 'center',
    paddingVertical: 10,
  },
  historyList: {
    gap: 10,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyLeft: {
    flex: 1,
  },
  historyMerchant: {
    fontSize: 13,
    fontWeight: '700',
    color: '#202124',
  },
  historyCategory: {
    fontSize: 11,
    color: '#5f6368',
    marginTop: 1,
  },
  historyRight: {
    alignItems: 'flex-end',
  },
  historyAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  historyAmtDebit: {
    color: '#c5221f',
  },
  historyAmtCredit: {
    color: '#137333',
  },
  historyDate: {
    fontSize: 10,
    color: '#9aa0a6',
    marginTop: 1,
  },
  categoryScroll: {
    paddingBottom: 6,
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f3f4',
    borderWidth: 1,
    borderColor: '#dadce0',
  },
  categoryPillActive: {
    backgroundColor: '#e8f0fe',
    borderColor: '#1a73e8',
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5f6368',
  },
  categoryPillTextActive: {
    color: '#1a73e8',
    fontWeight: '700',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  dismissButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#f1f3f4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5f6368',
  },
  approveButton: {
    flex: 1.5,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#1a73e8',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#1a73e8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  approveButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
