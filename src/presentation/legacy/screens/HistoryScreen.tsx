import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
} from 'react-native';
import { useExpenseStore } from '../../../hooks/useExpenses';
import { Expense, Category } from '../../../types/expense';
import { CATEGORIES as APP_CATEGORIES } from '../../../constants/appOptions';
import { trainSpam } from '../../../core/classifier/spamClassifier';
import EditTransactionModal from '../components/EditTransactionModal';
import CalendarModal from '../components/CalendarModal';
import { getGroupedSections } from '../../../utils/dateHelpers';
import { formatAmount } from '../../../utils/formatHelpers';
import commonStyles from '../styles/commonStyles';
import styles from '../styles/HistoryScreenStyles';


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

  // Collapse State (expanded by default, we track which ones are collapsed)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

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

  // Date collapse state (Today is expanded, past dates collapsed by default)
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});

  const isDateCollapsed = useCallback((dateKey: string, isToday: boolean) => {
    if (isToday) return false; // Always open (uncollapsed) for the current date
    if (collapsedDates[dateKey] !== undefined) {
      return collapsedDates[dateKey];
    }
    return true; // Everything else in the past is collapsed by default
  }, [collapsedDates]);

  const toggleDate = (dateKey: string, isToday: boolean) => {
    setCollapsedDates(prev => {
      const current = prev[dateKey] !== undefined ? prev[dateKey] : !isToday;
      return {
        ...prev,
        [dateKey]: !current,
      };
    });
  };

  // Month-section collapse state helper
  const isSectionCollapsed = useCallback((sectionId: string) => {
    if (collapsedSections[sectionId] !== undefined) {
      return collapsedSections[sectionId];
    }
    // Default: Current month is expanded (collapsed = false), older months are collapsed (collapsed = true)
    const now = new Date();
    const currentMonthKey = `month:${now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;
    return sectionId !== currentMonthKey;
  }, [collapsedSections]);

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => {
      const current = isSectionCollapsed(id);
      return {
        ...prev,
        [id]: !current,
      };
    });
  };

  // Grouped Sections
  const sections = useMemo(() => {
    return getGroupedSections(filteredExpenses);
  }, [filteredExpenses]);

  // Dynamic Section collapsing (handles both Month section collapses and Date sub-section collapses)
  const renderableSections = useMemo(() => {
    return sections.map(sec => {
      if (isSectionCollapsed(sec.id)) {
        return {
          ...sec,
          data: [],
        };
      }

      // Filter out transaction rows if their date sub-section is collapsed
      const filteredItems = sec.expenses.filter((item: any) => {
        if (item.isDivider) {
          return true; // Always show sub-headers so they can be expanded
        }
        return !isDateCollapsed(item.parentDateKey, item.isToday);
      });

      return {
        ...sec,
        data: filteredItems,
      };
    });
  }, [sections, isSectionCollapsed, isDateCollapsed]);

  const collapseStats = useMemo(() => {
    let totalSections = sections.length;
    let expandedSectionsCount = sections.filter(sec => !isSectionCollapsed(sec.id)).length;

    let totalDates = 0;
    let expandedDatesCount = 0;

    sections.forEach(sec => {
      sec.expenses.forEach((item: any) => {
        if (item.isDivider) {
          totalDates++;
          if (!isDateCollapsed(item.dateKey, item.isToday)) {
            expandedDatesCount++;
          }
        }
      });
    });

    const canExpand = expandedSectionsCount < totalSections || expandedDatesCount < totalDates;
    const anyOpen = expandedSectionsCount > 1 || expandedDatesCount > 1;

    return {
      totalSections,
      expandedSectionsCount,
      totalDates,
      expandedDatesCount,
      canExpand,
      anyOpen,
    };
  }, [sections, isSectionCollapsed, isDateCollapsed]);

  const handleUncollapseAll = () => {
    const newSections: Record<string, boolean> = {};
    sections.forEach(sec => {
      newSections[sec.id] = false;
    });
    setCollapsedSections(newSections);

    const newDates: Record<string, boolean> = {};
    sections.forEach(sec => {
      sec.expenses.forEach((item: any) => {
        if (item.isDivider) {
          newDates[item.dateKey] = false;
        }
      });
    });
    setCollapsedDates(newDates);
  };

  const handleCollapseAll = () => {
    const newSections: Record<string, boolean> = {};
    sections.forEach(sec => {
      newSections[sec.id] = true;
    });
    setCollapsedSections(newSections);

    const newDates: Record<string, boolean> = {};
    sections.forEach(sec => {
      sec.expenses.forEach((item: any) => {
        if (item.isDivider) {
          newDates[item.dateKey] = true;
        }
      });
    });
    setCollapsedDates(newDates);
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
      if (!useExpenseStore.getState().invalidateExpense(id, false)) return;
      // If it was marked as spam previously, untrain
      if (selectedTrashExpense.trashReason === 'spam') {
        trainSpam(selectedTrashExpense.rawMessage, false);
      }
    } else {
      // Keep trashed, but update reason
      if (!useExpenseStore.getState().invalidateExpense(id, true)) return;
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
    <View style={commonStyles.container}>
      <View style={commonStyles.header}>
        <Text style={commonStyles.headerTitle}>Ledger History</Text>
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
        {sections.length > 0 && (sections.length > 1 || collapseStats.totalDates > 1) && (
          <View style={styles.utilityRow}>
            <Text style={styles.utilityCount}>
              Showing {filteredExpenses.length} transactions
            </Text>
            <View style={styles.utilityActionsContainer}>
              {collapseStats.canExpand && (
                <TouchableOpacity style={styles.utilityActionBtn} onPress={handleUncollapseAll} activeOpacity={0.7}>
                  <Text style={styles.utilityActionText}>📂 Expand All</Text>
                </TouchableOpacity>
              )}
              {collapseStats.anyOpen && (
                <TouchableOpacity style={[styles.utilityActionBtn, { marginLeft: 8 }]} onPress={handleCollapseAll} activeOpacity={0.7}>
                  <Text style={styles.utilityActionText}>📁 Collapse All</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>

      <SectionList
        sections={renderableSections}
        keyExtractor={item => String(item.id)}
        renderSectionHeader={({ section }) => {
          const isExpanded = !isSectionCollapsed(section.id);
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
                  section.total < 0 && styles.totalDebit,
                ]}
              >
                {formatAmount(section.total)}
              </Text>
            </TouchableOpacity>
          );
        }}
        renderItem={({ item }: { item: any }) => {
          if (item.isDivider) {
            const isCollapsed = isDateCollapsed(item.dateKey, item.isToday);
            return (
              <TouchableOpacity
                style={styles.dateDividerRow}
                onPress={() => !item.isToday && toggleDate(item.dateKey, item.isToday)}
                activeOpacity={item.isToday ? 1.0 : 0.7}
                disabled={item.isToday}
              >
                <View style={styles.dateDividerLeft}>
                  <Text style={styles.chevronSmall}>{item.isToday ? '▼' : (isCollapsed ? '▶' : '▼')}</Text>
                  <Text style={styles.dateDividerTitle}>{item.title}</Text>
                </View>
                <Text
                  style={[
                    styles.dateDividerTotal,
                    item.dayTotal >= 0 ? styles.totalCredit : styles.totalDebit,
                  ]}
                >
                  {item.dayTotal >= 0 ? '+' : ''}{formatAmount(item.dayTotal)}
                </Text>
              </TouchableOpacity>
            );
          }

          return (
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
                      👥 Split: {item.splits.map((s: any) => `${s.contactName} (₹${s.amount})`).join(', ')}
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
          );
        }}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={commonStyles.empty}>
            <Text style={commonStyles.emptyText}>
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

