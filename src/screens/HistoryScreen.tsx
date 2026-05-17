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
import { trainSpam } from '../core/classifier/spamClassifier';
import EditTransactionModal from '../components/EditTransactionModal';
import CalendarModal from '../components/CalendarModal';
import { getGroupedSections } from '../utils/dateHelpers';
import { formatAmount } from '../utils/formatHelpers';

const formatTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

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
  const [selectedBank, setSelectedBank] = useState('All');
  const [selectedSize, setSelectedSize] = useState('All');
  const [filterStartDate, setFilterStartDate] = useState<number | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'active' | 'trash'>('active');
  const [calendarVisible, setCalendarVisible] = useState(false);

  // Dynamic Banks List compiled from existing transactions
  const uniqueBanks = useMemo(() => {
    const banksSet = new Set<string>();
    expenses.forEach(e => {
      if (e.bank && !e.isInvalid) {
        banksSet.add(e.bank);
      }
    });
    return ['All', ...Array.from(banksSet)];
  }, [expenses]);

  // Modal State for Editing
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Trash Options Modal
  const [trashOptionsVisible, setTrashOptionsVisible] = useState(false);
  const [selectedTrashExpense, setSelectedTrashExpense] = useState<Expense | null>(null);

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

      // Bank filter
      const matchBank = selectedBank === 'All' || e.bank === selectedBank;

      // Size filter
      let matchSize = true;
      if (selectedSize === 'small') {
        matchSize = e.amount < 1000;
      } else if (selectedSize === 'medium') {
        matchSize = e.amount >= 1000 && e.amount <= 5000;
      } else if (selectedSize === 'large') {
        matchSize = e.amount > 5000;
      }

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

      return matchSearch && matchCategory && matchSource && matchType && matchBank && matchSize && matchDate;
    });
  }, [expenses, searchQuery, selectedCategory, selectedSource, selectedType, selectedBank, selectedSize, filterStartDate, filterEndDate, viewMode]);

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
    setSelectedBank('All');
    setSelectedSize('All');
    setFilterStartDate(null);
    setFilterEndDate(null);
  };

  const hasActiveFilters = 
    searchQuery || 
    selectedCategory !== 'All' || 
    selectedSource !== 'All' || 
    selectedType !== 'All' ||
    selectedBank !== 'All' ||
    selectedSize !== 'All' ||
    filterStartDate !== null ||
    filterEndDate !== null;

  const handleEditExpense = (expense: Expense) => {
    if (viewMode === 'trash' || expense.isInvalid) {
      setSelectedTrashExpense(expense);
      setTrashOptionsVisible(true);
    } else {
      setEditingExpense(expense);
      setModalVisible(true);
    }
  };

  const handleTrashOption = (action: 'restore' | 'spam' | 'duplicate' | 'false' | 'other') => {
    if (!selectedTrashExpense || !selectedTrashExpense.id) return;
    const id = selectedTrashExpense.id;

    if (action === 'restore') {
      // Un-trash
      useExpenseStore.getState().invalidateExpense(id, false);
      // If it was marked as spam previously, untrain
      if (selectedTrashExpense.trashReason === 'spam') {
        trainSpam(selectedTrashExpense.rawMessage, false);
      }
    } else {
      // Keep trashed, but update reason
      useExpenseStore.getState().invalidateExpense(id, true);
      useExpenseStore.getState().updateTrashReason(id, action);
      
      // If marked as spam, train AI
      if (action === 'spam') {
        trainSpam(selectedTrashExpense.rawMessage, true);
      }
    }

    setTrashOptionsVisible(false);
    setSelectedTrashExpense(null);
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

            {/* Bank Filter */}
            <Text style={styles.filterLabel}>Bank</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
              {uniqueBanks.map(b => (
                <TouchableOpacity
                  key={b}
                  style={[styles.pill, selectedBank === b && styles.pillActive]}
                  onPress={() => setSelectedBank(b)}
                >
                  <Text style={[styles.pillText, selectedBank === b && styles.pillTextActive]}>
                    {b === 'All' ? 'All Banks' : b.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Transaction Size Filter */}
            <Text style={styles.filterLabel}>Transaction Size</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
              {[
                { id: 'All', label: 'All Sizes' },
                { id: 'small', label: 'Small (< ₹1,000)' },
                { id: 'medium', label: 'Medium (₹1,000 - ₹5,000)' },
                { id: 'large', label: 'Large (> ₹5,000)' },
              ].map(sz => (
                <TouchableOpacity
                  key={sz.id}
                  style={[styles.pill, selectedSize === sz.id && styles.pillActive]}
                  onPress={() => setSelectedSize(sz.id)}
                >
                  <Text style={[styles.pillText, selectedSize === sz.id && styles.pillTextActive]}>
                    {sz.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

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
                <Text style={styles.timeText}>{formatTime(item.timestamp)}</Text>
                <Text style={styles.bullet}>•</Text>
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
              {item.isInvalid && item.trashReason && (
                <View style={styles.trashReasonBadge}>
                  <Text style={styles.trashReasonText}>Tag: {item.trashReason.toUpperCase()}</Text>
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
        visible={trashOptionsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTrashOptionsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.optionsModalBox}>
            <Text style={styles.optionsModalTitle}>Manage Trashed Item</Text>
            
            <TouchableOpacity style={styles.optionBtnRestore} onPress={() => handleTrashOption('restore')}>
              <Text style={styles.optionBtnRestoreText}>✅ Restore to Active</Text>
            </TouchableOpacity>

            <View style={styles.optionsDivider} />
            <Text style={styles.optionsSubtitle}>Tag this transaction:</Text>

            <TouchableOpacity style={styles.optionBtn} onPress={() => handleTrashOption('spam')}>
              <Text style={styles.optionBtnText}>🛑 Mark as Spam (Trains AI)</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.optionBtn} onPress={() => handleTrashOption('duplicate')}>
              <Text style={styles.optionBtnText}>👯 Mark as Duplicate</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.optionBtn} onPress={() => handleTrashOption('false')}>
              <Text style={styles.optionBtnText}>⚠️ Mark as False Transaction</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.optionBtn} onPress={() => handleTrashOption('other')}>
              <Text style={styles.optionBtnText}>🗑️ Other Reason</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setTrashOptionsVisible(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  timeText: {
    fontSize: 11,
    color: '#1a73e8',
    fontWeight: '600',
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
  trashReasonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fce8e6',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  trashReasonText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#c5221f',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsModalBox: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  optionsModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#202124',
    marginBottom: 16,
    textAlign: 'center',
  },
  optionBtnRestore: {
    backgroundColor: '#e6f4ea',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  optionBtnRestoreText: {
    color: '#137333',
    fontWeight: '700',
    fontSize: 15,
  },
  optionsDivider: {
    height: 1,
    backgroundColor: '#f1f3f4',
    marginVertical: 10,
  },
  optionsSubtitle: {
    fontSize: 13,
    color: '#5f6368',
    marginBottom: 10,
    fontWeight: '600',
  },
  optionBtn: {
    backgroundColor: '#f8f9fa',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e8eaed',
  },
  optionBtnText: {
    color: '#3c4043',
    fontWeight: '600',
    fontSize: 14,
  },
  cancelBtn: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#80868b',
    fontWeight: '600',
    fontSize: 14,
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
