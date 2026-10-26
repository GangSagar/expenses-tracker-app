import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useExpenseStore } from '../../../hooks/useExpenses';
import commonStyles from '../styles/commonStyles';
import { ExpenseSplit } from '../../../types/expense';
import styles from '../styles/SplitsScreenStyles';
import { remainingSplitAmount } from '../../../core/transactions/repaymentPlanner';


interface SplitItemDetail {
  expenseId: number;
  merchant: string;
  timestamp: number;
  category: string;
  split: ExpenseSplit;
}

interface ContactBalanceSummary {
  contactName: string;
  owedToMe: number;   // Money others owe me
  owedByMe: number;   // Money I owe others
  netBalance: number; // Positive: others owe me, Negative: I owe others
  activeSplits: SplitItemDetail[];
  settledSplits: SplitItemDetail[];
}

export default function SplitsScreen() {
  const { 
    expenses, 
    settleContactSplits, 
    unsettleContactSplits, 
    toggleSplitPaid 
  } = useExpenseStore();
  const [expandedContact, setExpandedContact] = useState<string | null>(null);

  // Group and calculate split balances per contact name
  const contactBalances = useMemo(() => {
    const registry: Record<string, ContactBalanceSummary> = {};

    for (const exp of expenses) {
      if (!exp.splits || exp.splits.length === 0 || !exp.id) continue;

      for (const sp of exp.splits) {
        const name = sp.contactName.trim();
        if (!name) continue;

        if (!registry[name]) {
          registry[name] = {
            contactName: name,
            owedToMe: 0,
            owedByMe: 0,
            netBalance: 0,
            activeSplits: [],
            settledSplits: [],
          };
        }

        const amt = remainingSplitAmount(sp);
        const detail: SplitItemDetail = {
          expenseId: exp.id,
          merchant: exp.merchant,
          timestamp: exp.timestamp,
          category: exp.category,
          split: sp,
        };

        if (sp.isPaid || amt <= 0) {
          registry[name].settledSplits.push(detail);
        } else {
          registry[name].activeSplits.push(detail);
          if (sp.owedByMe) {
            registry[name].owedByMe += amt;
          } else {
            registry[name].owedToMe += amt;
          }
        }
      }
    }

    // Calculate net balances and sort alphabetically
    return Object.values(registry)
      .map(contact => {
        contact.netBalance = contact.owedToMe - contact.owedByMe;
        // Sort individual splits chronologically (newest first)
        contact.activeSplits.sort((a, b) => b.timestamp - a.timestamp);
        contact.settledSplits.sort((a, b) => b.timestamp - a.timestamp);
        return contact;
      })
      .sort((a, b) => a.contactName.localeCompare(b.contactName));
  }, [expenses]);

  // Aggregate stats across all contacts
  const totalStats = useMemo(() => {
    let owedToMe = 0;
    let owedByMe = 0;
    for (const cb of contactBalances) {
      owedToMe += cb.owedToMe;
      owedByMe += cb.owedByMe;
    }
    return {
      owedToMe,
      owedByMe,
      net: owedToMe - owedByMe,
    };
  }, [contactBalances]);

  const toggleExpand = (name: string) => {
    setExpandedContact(prev => (prev === name ? null : name));
  };

  const handleSettleUp = (contactName: string, balance: number) => {
    const message = balance > 0 
      ? `This will mark all pending balances from ${contactName} as settled/paid.` 
      : balance < 0
      ? `This will mark all balances you owe to ${contactName} as settled/paid.`
      : `Mark all split balances with ${contactName} as settled?`;

    Alert.alert(
      '🤝 Settle Up Balances',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Settle Up',
          style: 'default',
          onPress: () => {
            if (settleContactSplits(contactName)) {
              Alert.alert('Success', `All outstanding balances with ${contactName} have been settled!`);
            }
          }
        }
      ]
    );
  };

  const handleUnsettleAll = (contactName: string) => {
    Alert.alert(
      '🔄 Unsettle All Balances',
      `This will mark all settled splits with ${contactName} as active/unpaid again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Unsettle',
          style: 'destructive',
          onPress: () => {
            if (unsettleContactSplits(contactName)) {
              Alert.alert('Success', `All balances with ${contactName} are now active again!`);
            }
          }
        }
      ]
    );
  };

  const handleToggleSplit = (
    expenseId: number, 
    contactName: string, 
    isPaid: boolean, 
    merchant: string, 
    amount: number
  ) => {
    Alert.alert(
      isPaid ? '🔄 Unsettle Split Bill' : '🤝 Settle Split Bill',
      `Are you sure you want to mark "${merchant}" (${formatAmount(amount)}) as ${isPaid ? 'unpaid' : 'paid'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isPaid ? 'Unsettle' : 'Settle',
          style: isPaid ? 'destructive' : 'default',
          onPress: () => {
            toggleSplitPaid(expenseId, contactName);
          }
        }
      ]
    );
  };

  const formatAmount = (amt: number) => {
    return `₹${Math.abs(amt).toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <View style={commonStyles.container}>
      <View style={commonStyles.header}>
        <Text style={commonStyles.headerTitle}>Split Ledger</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Net Splits Dashboard Panel */}
        <View style={styles.dashboardCard}>
          <Text style={styles.dashboardLabel}>NET SPLIT BALANCE</Text>
          <Text style={[
            styles.dashboardNet, 
            totalStats.net > 0 ? styles.positiveText : totalStats.net < 0 ? styles.negativeText : styles.neutralText
          ]}>
            {totalStats.net > 0 ? '+' : totalStats.net < 0 ? '-' : ''}
            {formatAmount(totalStats.net)}
          </Text>
          <Text style={styles.dashboardStatus}>
            {totalStats.net > 0 
              ? 'Overall, others owe you money' 
              : totalStats.net < 0 
              ? 'Overall, you owe money to others' 
              : 'All split balances are fully cleared!'}
          </Text>

          <View style={styles.divider} />

          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>OTHERS OWE YOU</Text>
              <Text style={[styles.statValue, styles.positiveText]}>
                {formatAmount(totalStats.owedToMe)}
              </Text>
            </View>
            <View style={styles.verticalDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>YOU OWE OTHERS</Text>
              <Text style={[styles.statValue, styles.negativeText]}>
                {formatAmount(totalStats.owedByMe)}
              </Text>
            </View>
          </View>
        </View>

        {/* Directory Header */}
        <Text style={commonStyles.sectionHeading}>Outstanding Ledger</Text>

        {contactBalances.length === 0 ? (
          <View style={commonStyles.empty}>
            <Text style={commonStyles.emptyText}>👥 No split transactions found.</Text>
            <Text style={commonStyles.emptySubtext}>
              When adding or editing transactions, enable "Split with Contacts" to track bills!
            </Text>
          </View>
        ) : (
          contactBalances.map(contact => {
            const isExpanded = expandedContact === contact.contactName;
            const initial = contact.contactName.charAt(0).toUpperCase();
            
            return (
              <View key={contact.contactName} style={[styles.contactCard, isExpanded && styles.contactCardExpanded]}>
                <TouchableOpacity
                  style={styles.contactHeader}
                  onPress={() => toggleExpand(contact.contactName)}
                  activeOpacity={0.7}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initial}</Text>
                  </View>
                  
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>{contact.contactName}</Text>
                    <Text style={[
                      styles.contactNetText,
                      contact.netBalance > 0 ? styles.positiveText : contact.netBalance < 0 ? styles.negativeText : styles.neutralText
                    ]}>
                      {contact.netBalance > 0 
                        ? `owes you ${formatAmount(contact.netBalance)}` 
                        : contact.netBalance < 0 
                        ? `you owe them ${formatAmount(contact.netBalance)}` 
                        : 'Fully settled up'}
                    </Text>
                  </View>

                  <Text style={styles.expandChevron}>{isExpanded ? '▼' : '▶'}</Text>
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.detailsBox}>
                    {/* Active splits list */}
                    {contact.activeSplits.length > 0 && (
                      <View style={{ marginBottom: 12 }}>
                        <Text style={styles.detailsLabel}>Active Split Bills (Tap to Settle)</Text>
                        {contact.activeSplits.map((item, idx) => (
                          <TouchableOpacity 
                            key={`${item.expenseId}-${idx}`} 
                            style={styles.billItem}
                            onPress={() => handleToggleSplit(item.expenseId, contact.contactName, false, item.merchant, remainingSplitAmount(item.split))}
                            activeOpacity={0.7}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={styles.billMerchant}>{item.merchant}</Text>
                              <Text style={styles.billMeta}>
                                {item.category} • {new Date(item.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                              </Text>
                            </View>
                            <Text style={[
                              styles.billAmount,
                              item.split.owedByMe ? styles.negativeText : styles.positiveText
                            ]}>
                              {item.split.owedByMe ? '-' : '+'}
                              {formatAmount(remainingSplitAmount(item.split))}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {/* Settle Up Action Button */}
                    {contact.activeSplits.length > 0 && (
                      <TouchableOpacity
                        style={styles.settleBtn}
                        onPress={() => handleSettleUp(contact.contactName, contact.netBalance)}
                      >
                        <Text style={styles.settleBtnText}>🤝 Settle Up All Balances</Text>
                      </TouchableOpacity>
                    )}

                    {/* Unsettle All Action Button */}
                    {contact.settledSplits.length > 0 && (
                      <TouchableOpacity
                        style={[styles.settleBtn, styles.unsettleBtn]}
                        onPress={() => handleUnsettleAll(contact.contactName)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.unsettleBtnText}>🔄 Unsettle All Balances</Text>
                      </TouchableOpacity>
                    )}

                    {/* Settled splits list */}
                    {contact.settledSplits.length > 0 && (
                      <View style={{ marginTop: 12 }}>
                        <Text style={[styles.detailsLabel, styles.settledSectionHeader]}>
                          Settled History (Tap to Unsettle)
                        </Text>
                        {contact.settledSplits.map((item, idx) => (
                          <TouchableOpacity 
                            key={`settled-${item.expenseId}-${idx}`} 
                            style={[styles.billItem, styles.settledBillItem]}
                            onPress={() => handleToggleSplit(item.expenseId, contact.contactName, true, item.merchant, item.split.amount)}
                            activeOpacity={0.7}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={styles.settledBillMerchant}>{item.merchant}</Text>
                              <Text style={styles.billMeta}>
                                {new Date(item.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                              </Text>
                            </View>
                            <View style={styles.settledBadge}>
                              <Text style={styles.settledBadgeText}>PAID {formatAmount(item.split.amount)}</Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

