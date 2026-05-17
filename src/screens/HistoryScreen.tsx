import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
} from 'react-native';
import { useExpenseStore } from '../hooks/useExpenses';
import { Expense, Category } from '../types/expense';
import { CATEGORIES as APP_CATEGORIES } from '../constants/appOptions';
import EditTransactionModal from '../components/EditTransactionModal';
import CalendarModal from '../components/CalendarModal';
import { getGroupedSections } from '../utils/dateHelpers';
import { formatAmount } from '../utils/formatHelpers';

const CATEGORIES: (Category | 'All')[] = ['All', ...APP_CATEGORIES];

const SOURCES = ['All', 'sms', 'notification', 'manual'];
const TYPES = ['All', 'debit', 'credit'];

export default function HistoryScreen() {
  const { expenses, loadExpenses, updateExpense } = useExpenseStore();
  
  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'All' | Category>('All');
  const [selectedSource, setSelectedSource] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [filterStartDate, setFilterStartDate] = useState<number | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'active' | 'trash'>('active');
  const [calendarVisible, setCalendarVisible] = useState(false);

  // Modal State for Editing
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Collapse State
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    today: true,
  });

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  // Filtered Expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      // Invalidation/Trash filter
      const isModeMatch = viewMode === 'trash' ? e.isInvalid : !e.isInvalid;
      if (!isModeMatch) return false;

      // Search filter
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || 
        (e.merchant && e.merchant.toLowerCase().includes(q)) || 
        (e.alias && e.alias.toLowerCase().includes(q)) ||
        (e.bank && e.bank.toLowerCase().includes(q)) ||
        (e.referenceId && e.referenceId.toLowerCase().includes(q)) ||
        String(e.amount).includes(q);

      // Category filter
      const matchCategory = selectedCategory === 'All' || e.category === selectedCategory;

      // Source filter
      const matchSource = selectedSource === 'All' || e.source === selectedSource;

      // Type filter
      const matchType = selectedType === 'All' || e.transactionType === selectedType;

      // Date Range Filter
      let matchDate = true;
      if (filterStartDate !== null) {
        const startOfDay = new Date(filterStartDate);
        startOfDay.setHours(0, 0, 0, 0);
        matchDate = matchDate && e.timestamp >= startOfDay.getTime();
      }
      if (filterEndDate !== null) {
        const endOfDay = new Date(filterEndDate);
        endOfDay.setHours(23, 59, 59, 999);
        matchDate = matchDate && e.timestamp <= endOfDay.getTime();
      }

      return matchSearch && matchCategory && matchSource && matchType && matchDate;
    });
  }, [expenses, searchQuery, selectedCategory, selectedSource, selectedType, filterStartDate, filterEndDate, viewMode]);

  // Grouped Sections
  const sections = useMemo(() => {
    return getGroupedSections(filteredExpenses);
  }, [filteredExpenses]);

  // Dynamic Section collapsing
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
    setFilterStartDate(null);
    setFilterEndDate(null);
  };

  const hasActiveFilters = 
    searchQuery || 
    selectedCategory !== 'All' || 
    selectedSource !== 'All' || 
    selectedType !== 'All' ||
    filterStartDate !== null ||
    filterEndDate !== null;

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setModalVisible(true);
  };

  const activeCount = expenses.filter(e => !e.isInvalid).length;
  const trashCount = expenses.filter(e => e.isInvalid).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ledger History</Text>
      </View>

      {/* Segment Tab Controls */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity
          style={[styles.segmentBtn, viewMode === 'active' && styles.segmentBtnActive]}
          onPress={() => setViewMode('active')}
        >
          <Text style={[styles.segmentText, viewMode === 'active' && styles.segmentTextActive]}>
            💼 Active ({activeCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, viewMode === 'trash' && styles.segmentBtnActive]}
          onPress={() => setViewMode('trash')}
        >
          <Text style={[styles.segmentText, viewMode === 'trash' && styles.segmentTextActive]}>
            🗑️ Trash Bin ({trashCount})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Modern Search & Filter Panel */}
      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search merchant, ref id, amount..."
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

            {/* Date Filters Calendar Trigger */}
            <Text style={styles.filterLabel}>Date Range Filter</Text>
            <TouchableOpacity 
              style={styles.calendarTriggerBtn} 
              onPress={() => setCalendarVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.calendarTriggerText}>
                {filterStartDate 
                  ? `${new Date(filterStartDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : 'Start Date'}
                {'  ➔  '}
                {filterEndDate 
                  ? `${new Date(filterEndDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : 'End Date'}
              </Text>
              <Text style={styles.calendarIcon}>📅</Text>
            </TouchableOpacity>

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
          <TouchableOpacity
            style={[styles.item, item.isInvalid && styles.itemTrashed]}
            onPress={() => handleEditExpense(item)}
            activeOpacity={0.7}
          >
            <View style={styles.itemLeft}>
              <View style={styles.merchantRow}>
                <Text style={styles.merchant}>{item.merchant}</Text>
                {item.bank && (
                  <View style={styles.bankBadge}>
                    <Text style={styles.bankBadgeText}>{item.bank}</Text>
                  </View>
                )}
                {item.referenceId && (
                  <View style={styles.refBadge}>
                    <Text style={styles.refBadgeText}>ID: {item.referenceId}</Text>
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
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {hasActiveFilters 
                ? 'No matches found for filters' 
                : viewMode === 'trash' 
                  ? 'Trash Bin is empty' 
                  : 'No transaction history'}
            </Text>
          </View>
        }
      />

      <EditTransactionModal
        expense={editingExpense}
        visible={modalVisible}
        onClose={() => {
          setEditingExpense(null);
          setModalVisible(false);
        }}
        onSave={updateExpense}
        onAddManual={() => {}}
        isAddMode={false}
      />

      <Modal
        visible={calendarVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCalendarVisible(false)}
      >
        <CalendarModal
          startDate={filterStartDate}
          endDate={filterEndDate}
          onClose={() => setCalendarVisible(false)}
          onApply={(start, end) => {
            setFilterStartDate(start);
            setFilterEndDate(end);
            setCalendarVisible(false);
          }}
        />
      </Modal>
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
    fontWeight: '700',
    color: '#fff',
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f4',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  segmentBtnActive: {
    borderBottomColor: '#1a73e8',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5f6368',
  },
  segmentTextActive: {
    color: '#1a73e8',
    fontWeight: '700',
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
  calendarTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dadce0',
    borderRadius: 8,
    height: 42,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  calendarTriggerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#202124',
  },
  calendarIcon: {
    fontSize: 16,
  },
  filterRowTwo: {
    flexDirection: 'row',
    gap: 12,
  },
  halfFilter: {
    flex: 1,
  },
  clearBtn: {
    marginTop: 10,
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
    borderWidth: 1,
    borderColor: 'transparent',
  },
  itemTrashed: {
    backgroundColor: '#f8f9fa',
    borderColor: '#dadce0',
    opacity: 0.8,
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
  refBadge: {
    backgroundColor: '#e8f0fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  refBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#1a73e8',
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
