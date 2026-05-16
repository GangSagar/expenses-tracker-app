import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { Category, Expense, PaymentMode } from '../types/expense';

import { CATEGORIES, PAYMENT_MODES } from '../constants/appOptions';

interface Props {
  expense: Expense | null;
  visible: boolean;
  onClose: () => void;
  onSave: (id: number, alias: string | undefined, merchant: string, category: Category, bank?: string, paymentMode?: string) => void;
}

export default function EditTransactionModal({ expense, visible, onClose, onSave }: Props) {
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState<Category>('Other');
  const [bank, setBank] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('unknown');

  useEffect(() => {
    if (expense) {
      setMerchant(expense.merchant);
      setCategory(expense.category);
      setBank(expense.bank || '');
      setPaymentMode(expense.paymentMode || 'unknown');
    }
  }, [expense]);

  if (!expense) return null;

  const handleSave = () => {
    onSave(expense.id!, expense.alias, merchant.trim(), category, bank.trim() || undefined, paymentMode);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.popup}>
          <Text style={styles.title}>Edit Transaction</Text>
          <Text style={styles.amount}>₹{expense.amount.toLocaleString('en-IN')}</Text>
          {expense.alias && expense.alias !== merchant && (
            <Text style={styles.aliasSubtitle}>Original Name: {expense.alias}</Text>
          )}

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Merchant Name</Text>
            <TextInput
              style={styles.input}
              value={merchant}
              onChangeText={setMerchant}
              placeholder="e.g. Swiggy, Amazon"
            />

            <Text style={styles.label}>Bank</Text>
            <TextInput
              style={styles.input}
              value={bank}
              onChangeText={setBank}
              placeholder="e.g. HDFC, SBI"
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
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveText}>Save Changes</Text>
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
  amount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a73e8',
    marginBottom: 4,
  },
  aliasSubtitle: {
    fontSize: 13,
    color: '#999',
    marginBottom: 20,
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
  chipText: {
    fontSize: 13,
    color: '#333',
  },
  chipTextActive: {
    color: '#fff',
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
});
