import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import theme from '../styles/theme';
import { formatAmount } from '../../../utils/formatHelpers';

export interface BankCardProps {
  bank: string;
  account: string;
  balance: number;
  cardType: 'cc' | 'debit';
  variant?: 'mini' | 'full';
  lastUpdated?: number;
  onToggleCardType?: () => void;
  onOptionsPress?: () => void;
  onPress?: () => void;
}

export function getCardColor(bankName: string, accountNumber: string, type: 'cc' | 'debit'): readonly [string, string] {
  const name = (bankName || '').toUpperCase();
  if (name.includes('ICICI')) return ['#4a148c', '#8e24aa']; // Purple
  if (name.includes('HDFC')) return ['#0d47a1', '#1976d2']; // Royal Blue
  if (name.includes('SBI')) return ['#006064', '#0097a7']; // Cyan/Teal
  if (name.includes('BOB') || name.includes('BARODA')) return ['#e65100', '#f57c00']; // Orange
  if (name.includes('BOI') || name.includes('INDIA')) return ['#1b5e20', '#388e3c']; // Green
  if (type === 'cc') return ['#111111', '#2c3e50']; // Sleek credit dark blue/black

  // Dynamic Hashing for unique debit card colors
  const str = `${bankName}::${accountNumber}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % theme.CARD_PALETTES.length;
  return theme.CARD_PALETTES[idx];
}

function formatDate(timestamp?: number): string {
  if (!timestamp) return 'Never';
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export default function BankCard({
  bank,
  account,
  balance,
  cardType,
  variant = 'full',
  lastUpdated,
  onToggleCardType,
  onOptionsPress,
  onPress,
}: BankCardProps) {
  const colors = getCardColor(bank, account, cardType);
  const isCc = cardType === 'cc';

  if (variant === 'mini') {
    return (
      <TouchableOpacity
        style={[styles.bankMiniCard, { backgroundColor: colors[0] }]}
        onPress={onPress}
        activeOpacity={0.9}
      >
        <Text style={styles.bankNameMini}>{bank}</Text>
        <Text style={styles.bankNumberMini}>•••• {account}</Text>
        <View style={styles.cardBalanceRow}>
          <Text style={styles.bankBalanceLabelMini}>Balance</Text>
          <Text style={styles.bankBalanceMini}>{formatAmount(balance)}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // Full-size interactive card
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors[0],
          borderColor: isCc ? '#c5a059' : 'transparent',
          borderWidth: isCc ? 1.5 : 0,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.bankName}>{bank.toUpperCase()}</Text>

        <View style={styles.cardHeaderRight}>
          {onToggleCardType && (
            <TouchableOpacity
              style={[
                styles.toggleBadge,
                isCc ? styles.toggleBadgeCc : styles.toggleBadgeDebit,
              ]}
              onPress={onToggleCardType}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.toggleBadgeText,
                  isCc && styles.toggleBadgeTextCc,
                ]}
              >
                {isCc ? '💳 CREDIT CARD' : '🏦 DEBIT CARD'}
              </Text>
            </TouchableOpacity>
          )}

          {onOptionsPress && (
            <TouchableOpacity
              style={styles.optionsDotBtn}
              onPress={onOptionsPress}
            >
              <Text style={styles.optionsDotIcon}>⋮</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <Text style={styles.balance}>{formatAmount(balance)}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.accountNumber}>A/C: •••• {account}</Text>
        {lastUpdated !== undefined && (
          <Text style={styles.lastUpdated}>Updated: {formatDate(lastUpdated)}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Miniature Card Layout
  bankMiniCard: {
    width: 160,
    height: 100,
    borderRadius: 14,
    padding: 12,
    justifyContent: 'space-between',
    ...theme.SHADOWS.small,
  },
  bankNameMini: {
    fontSize: theme.FONTS.sizes.md,
    fontWeight: theme.FONTS.weights.heavy,
    color: theme.COLORS.white,
    opacity: 0.95,
  },
  bankNumberMini: {
    fontSize: theme.FONTS.sizes.sm,
    color: theme.COLORS.white,
    opacity: 0.7,
    marginTop: -16,
  },
  cardBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  bankBalanceLabelMini: {
    fontSize: theme.FONTS.sizes.xxs,
    color: theme.COLORS.white,
    opacity: 0.8,
    textTransform: 'uppercase',
  },
  bankBalanceMini: {
    fontSize: theme.FONTS.sizes.lg,
    fontWeight: theme.FONTS.weights.bold,
    color: theme.COLORS.white,
  },

  // Full-size Card Layout
  card: {
    width: 290,
    height: 170,
    borderRadius: 20,
    padding: 20,
    justifyContent: 'space-between',
    marginRight: 12,
    marginVertical: 8,
    ...theme.SHADOWS.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bankName: {
    color: theme.COLORS.white,
    fontSize: theme.FONTS.sizes.xl,
    fontWeight: theme.FONTS.weights.heavy,
    letterSpacing: 0.5,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  toggleBadgeCc: {
    backgroundColor: '#fffbeb',
  },
  toggleBadgeDebit: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  toggleBadgeText: {
    fontSize: theme.FONTS.sizes.xxs,
    color: theme.COLORS.white,
    fontWeight: theme.FONTS.weights.bold,
  },
  toggleBadgeTextCc: {
    color: '#d97706',
  },
  optionsDotBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  optionsDotIcon: {
    color: theme.COLORS.white,
    fontSize: theme.FONTS.sizes.xxl,
    fontWeight: theme.FONTS.weights.bold,
  },
  balance: {
    color: theme.COLORS.white,
    fontSize: 26,
    fontWeight: theme.FONTS.weights.heavy,
    letterSpacing: -0.5,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accountNumber: {
    color: theme.COLORS.white,
    fontSize: theme.FONTS.sizes.md,
    opacity: 0.9,
    fontWeight: theme.FONTS.weights.medium,
  },
  lastUpdated: {
    color: theme.COLORS.white,
    fontSize: theme.FONTS.sizes.xxs,
    opacity: 0.7,
  },
});
