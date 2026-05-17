import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { useExpenseStore } from '../hooks/useExpenses';
import { Expense, Category } from '../types/expense';
import { CATEGORIES as APP_CATEGORIES } from '../constants/appOptions';

interface GroupedSection {
  id: string;
  type: 'today' | 'date' | 'month' | 'year';
  title: string;
  expenses: Expense[];
  total: number;
}

const CATEGORIES: (Category | 'All')[] = ['All', ...APP_CATEGORIES];

const SOURCES = ['All', 'sms', 'notification', 'manual'];
const TYPES = ['All', 'debit', 'credit'];

function getGroupedSections(expenses: Expense[]): GroupedSection[] {
  const now = new Date();
  
  // Start of today (00:00:00)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  
  // 30 days ago
  const thirtyDaysAgo = todayStart - 30 * 24 * 60 * 60 * 1000;

  const groups: Record<string, { type: 'today' | 'date' | 'month' | 'year'; title: string; expenses: Expense[] }> = {};

  for (const expense of expenses) {
    const t = expense.timestamp;
    const dateObj = new Date(t);
    
    let groupId = '';
    let type: 'today' | 'date' | 'month' | 'year' = 'date';
    let title = '';

    if (t >= todayStart) {
      // Today
      groupId = 'today';
      type = 'today';
      title = 'Today - ' + dateObj.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
    } else if (t >= thirtyDaysAgo) {
      // Older days within 30 days: "Only show date and day"
      const dateKey = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      groupId = `date:${dateKey}`;
      type = 'date';
      title = `${dateKey} - ${dateObj.toLocaleDateString('en-IN', { weekday: 'long' })}`;
    } else if (dateObj.getFullYear() === now.getFullYear()) {
      // Older than 30 days, but within the current year: Collapse the month
      const monthName = dateObj.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      groupId = `month:${monthName}`;
      type = 'month';
      title = monthName;
    } else {
      // Older than the current year: Collapse the year
      const yearName = String(dateObj.getFullYear());
      groupId = `year:${yearName}`;
      type = 'year';
      title = yearName;
    }

    if (!groups[groupId]) {
      groups[groupId] = { type, title, expenses: [] };
    }
    groups[groupId].expenses.push(expense);
  }

  // Convert to sorted array
  return Object.entries(groups)
    .map(([id, val]) => {
      const total = val.expenses.reduce((sum, e) => {
        const amt = Number(e.amount) || 0;
        return e.transactionType === 'credit' ? sum + amt : sum - amt;
      }, 0);
      return {
        id,
        type: val.type,
        title: val.title,
        expenses: val.expenses,
        total,
      };
    })
    .sort((a, b) => {
      // Sort sections by their newest transaction timestamp
      const maxA = Math.max(...a.expenses.map(e => e.timestamp));
      const maxB = Math.max(...b.expenses.map(e => e.timestamp));
      return maxB - maxA;
    });
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
  
  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'All' | Category>('All');
  const [selectedSource, setSelectedSource] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [showFilters, setShowFilters] = useState(false);

  // Collapse State
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    today: true, // Only today is uncollapsed by default
  });

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  // Filtered Expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      // Search filter
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || 
        e.merchant.toLowerCase().includes(q) || 
        (e.alias && e.alias.toLowerCase().includes(q)) ||
        (e.bank && e.bank.toLowerCase().includes(q)) ||
        String(e.amount).includes(q);

      // Category filter
      const matchCategory = selectedCategory === 'All' || e.category === selectedCategory;

      // Source filter
      const matchSource = selectedSource === 'All' || e.source === selectedSource;

      // Type filter
      const matchType = selectedType === 'All' || e.transactionType === selectedType;

      return matchSearch && matchCategory && matchSource && matchType;
    });
  }, [expenses, searchQuery, selectedCategory, selectedSource, selectedType]);

  // Grouped Sections based on filtered expenses
  const sections = useMemo(() => {
    return getGroupedSections(filteredExpenses);
  }, [filteredExpenses]);

  // Dynamic Section mapping for SectionList collapse feature
  const renderableSections = useMemo(() => {
    return sections.map(sec => ({
      ...sec,
      data: expandedSections[sec.id] ? sec.expenses : [],
    }));
  }, [sections, expandedSections]);

  const toggleSection = (id: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedCategory('All');
    setSelectedSource('All');
    setSelectedType('All');
  };

  const hasActiveFilters = searchQuery || selectedCategory !== 'All' || selectedSource !== 'All' || selectedType !== 'All';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>
      </View>

      {/* Modern Search & Filter Panel */}
      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search merchant, bank, amount..."
            placeholderTextColor="#9aa0a6"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <TouchableOpacity
            style={[styles.filterToggleBtn, showFilters && styles.filterToggleActive]}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Text style={[styles.filterToggleText, showFilters && styles.filterToggleTextActive]}>
              ⚙️ Filters
            </Text>
          </TouchableOpacity>
        </View>

        {showFilters && (
          <View style={styles.filtersBox}>
            {/* Category Filter */}
            <Text style={styles.filterLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.pill, selectedCategory === cat && styles.pillActive]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text style={[styles.pillText, selectedCategory === cat && styles.pillTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.filterRowTwo}>
              {/* Source Filter */}
              <View style={styles.halfFilter}>
                <Text style={styles.filterLabel}>Source</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
                  {SOURCES.map(src => (
                    <TouchableOpacity
                      key={src}
                      style={[styles.pill, selectedSource === src && styles.pillActive]}
                      onPress={() => setSelectedSource(src)}
                    >
                      <Text style={[styles.pillText, selectedSource === src && styles.pillTextActive]}>
                        {src === 'sms' ? 'SMS' : src === 'notification' ? 'Alert' : src === 'manual' ? 'Manual' : 'All'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Type Filter */}
              <View style={styles.halfFilter}>
                <Text style={styles.filterLabel}>Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
                  {TYPES.map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.pill, selectedType === t && styles.pillActive]}
                      onPress={() => setSelectedType(t)}
                    >
                      <Text style={[styles.pillText, selectedType === t && styles.pillTextActive]}>
                        {t === 'credit' ? 'Credit' : t === 'debit' ? 'Debit' : 'All'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            {hasActiveFilters && (
              <TouchableOpacity style={styles.clearBtn} onPress={clearAllFilters}>
                <Text style={styles.clearBtnText}>Clear All Filters</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <SectionList
        sections={renderableSections}
        keyExtractor={item => String(item.id)}
        renderSectionHeader={({ section }) => {
          const isExpanded = !!expandedSections[section.id];
          return (
            <TouchableOpacity
              style={[
                styles.sectionHeader,
                section.type === 'month' && styles.monthHeader,
                section.type === 'year' && styles.yearHeader,
              ]}
              onPress={() => toggleSection(section.id)}
              activeOpacity={0.7}
            >
              <View style={styles.headerLeft}>
                <Text style={styles.chevron}>{isExpanded ? '▼' : '▶'}</Text>
                <Text
                  style={[
                    styles.sectionTitle,
                    section.type === 'month' && styles.monthTitle,
                    section.type === 'year' && styles.yearTitle,
                  ]}
                >
                  {section.title}
                </Text>
              </View>
              <Text
                style={[
                  styles.sectionTotal,
                  section.type === 'month' && styles.monthTotal,
                  section.type === 'year' && styles.yearTotal,
                ]}
              >
                {formatAmount(section.total)}
              </Text>
            </TouchableOpacity>
          );
        }}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={styles.itemLeft}>
              <View style={styles.merchantRow}>
                <Text style={styles.merchant}>{item.merchant}</Text>
                {item.bank && (
                  <View style={styles.bankBadge}>
                    <Text style={styles.bankBadgeText}>{item.bank}</Text>
                  </View>
                )}
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.category}>{item.category}</Text>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.sourceText}>
                  {item.source === 'sms' ? '💬 SMS' : item.source === 'notification' ? '🔔 Alert' : '✍️ Manual'}
                </Text>
              </View>
              {item.splits && item.splits.length > 0 && (
                <View style={styles.splitBadgeContainer}>
                  <Text style={styles.splitBadgeText}>
                    👥 Split: {item.splits.map(s => `${s.contactName} (₹${s.amount})`).join(', ')}
                  </Text>
                </View>
              )}
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
            <Text style={styles.emptyText}>
              {hasActiveFilters ? 'No matches found for filters' : 'No transaction history'}
            </Text>
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
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f4',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#f1f3f4',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#202124',
  },
  filterToggleBtn: {
    height: 40,
    paddingHorizontal: 12,
    backgroundColor: '#e8f0fe',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterToggleActive: {
    backgroundColor: '#1a73e8',
  },
  filterToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a73e8',
  },
  filterToggleTextActive: {
    color: '#fff',
  },
  filtersBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5f6368',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  pillsScroll: {
    marginBottom: 10,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dadce0',
    marginRight: 6,
  },
  pillActive: {
    backgroundColor: '#e8f0fe',
    borderColor: '#1a73e8',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5f6368',
  },
  pillTextActive: {
    color: '#1a73e8',
  },
  filterRowTwo: {
    flexDirection: 'row',
    gap: 12,
  },
  halfFilter: {
    flex: 1,
  },
  clearBtn: {
    marginTop: 4,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#fce8e6',
    alignItems: 'center',
  },
  clearBtnText: {
    color: '#c5221f',
    fontSize: 12,
    fontWeight: '600',
  },
  list: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#e8f0fe',
    borderRadius: 8,
    marginTop: 12,
    marginBottom: 6,
  },
  monthHeader: {
    backgroundColor: '#e6f4ea',
  },
  yearHeader: {
    backgroundColor: '#fef7e0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chevron: {
    fontSize: 11,
    color: '#5f6368',
    width: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3c4043',
  },
  monthTitle: {
    color: '#137333',
  },
  yearTitle: {
    color: '#b06000',
  },
  sectionTotal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a73e8',
  },
  monthTotal: {
    color: '#137333',
  },
  yearTotal: {
    color: '#b06000',
  },
  item: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  itemLeft: {
    flex: 1,
  },
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  merchant: {
    fontSize: 15,
    fontWeight: '600',
    color: '#202124',
  },
  bankBadge: {
    backgroundColor: '#f1f3f4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bankBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5f6368',
    textTransform: 'uppercase',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  category: {
    fontSize: 12,
    color: '#5f6368',
    fontWeight: '500',
  },
  bullet: {
    fontSize: 12,
    color: '#9aa0a6',
  },
  sourceText: {
    fontSize: 11,
    color: '#80868b',
    fontWeight: '500',
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
    fontSize: 10,
    fontWeight: '600',
    color: '#137333',
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 8,
  },
  debit: {
    color: '#c5221f',
  },
  credit: {
    color: '#137333',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 15,
    color: '#9aa0a6',
    fontWeight: '500',
  },
});
