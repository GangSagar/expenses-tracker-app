import React from 'react';
import { View, Text, TextInput } from 'react-native';
import styles from '../../../styles/SettingsScreenStyles';

/**
 * ProfileStats component renders the budget settings inputs and labels.
 */
export default function ProfileStats({ budget, onBudgetChange }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Smart Budget Settings</Text>
      <View style={styles.budgetContainer}>
        <View style={styles.budgetLabelContainer}>
          <Text style={styles.itemTitle}>Monthly Budget Limit</Text>
          <Text style={styles.itemDescription}>
            Sets your target monthly expense limit for AI projections
          </Text>
        </View>
        <View style={styles.budgetInputWrapper}>
          <Text style={styles.currencySymbol}>₹</Text>
          <TextInput
            style={styles.budgetInput}
            keyboardType="numeric"
            value={budget}
            onChangeText={onBudgetChange}
            placeholder="20000"
            placeholderTextColor="#999"
            maxLength={7}
          />
        </View>
      </View>
    </View>
  );
}
