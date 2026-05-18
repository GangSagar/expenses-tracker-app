import { Expense } from '../types/expense';

export interface GroupedSection {
  id: string;
  type: 'today' | 'date' | 'month' | 'year';
  title: string;
  expenses: any[];
  total: number;
}

/**
 * Parses YYYY-MM-DD string into a safe Unix timestamp.
 */
export function parseDateString(str: string): number | null {
  const clean = str.trim();
  if (!clean) return null;
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const date = new Date(year, month, day);
  return isNaN(date.getTime()) ? null : date.getTime();
}

/**
 * Generates grid days (including padding boundaries) for month navigation.
 */
export function generateDaysInMonth(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  
  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  
  const days: { dateObj: Date; isCurrentMonth: boolean }[] = [];
  
  // Prev month padding
  const prevMonthTotalDays = new Date(year, month, 0).getDate();
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    days.push({
      dateObj: new Date(year, month - 1, prevMonthTotalDays - i),
      isCurrentMonth: false,
    });
  }
  
  // Current month
  for (let i = 1; i <= totalDays; i++) {
    days.push({
      dateObj: new Date(year, month, i),
      isCurrentMonth: true,
    });
  }
  
  // Next month padding to complete rows
  const totalSlots = Math.ceil(days.length / 7) * 7;
  const nextMonthPadding = totalSlots - days.length;
  for (let i = 1; i <= nextMonthPadding; i++) {
    days.push({
      dateObj: new Date(year, month + 1, i),
      isCurrentMonth: false,
    });
  }
  
  return days;
}

/**
 * Groups and sections transaction lists chronologically (Today, Last 30 Days, Current Year, Older).
 */
export function getGroupedSections(expenses: Expense[]): GroupedSection[] {
  const groups: Record<string, { title: string; expenses: Expense[] }> = {};

  // 1. Group expenses by Month (e.g. "May 2026", "April 2026")
  for (const expense of expenses) {
    const dateObj = new Date(expense.timestamp);
    const monthKey = dateObj.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    
    if (!groups[monthKey]) {
      groups[monthKey] = {
        title: monthKey,
        expenses: [],
      };
    }
    groups[monthKey].expenses.push(expense);
  }

  // 2. Process each Month group
  const sections: GroupedSection[] = Object.entries(groups).map(([monthKey, val]) => {
    // Sort expenses in this month descending by timestamp
    const sortedExpenses = [...val.expenses].sort((a, b) => b.timestamp - a.timestamp);

    // Calculate month total
    const monthTotal = sortedExpenses.reduce((sum, e) => {
      const amt = Number(e.amount) || 0;
      return e.transactionType === 'credit' ? sum + amt : sum - amt;
    }, 0);

    // Group expenses by specific Day to insert Date Dividers with day-level totals
    const dayGroups: Record<string, { title: string; timestamp: number; isToday: boolean; expenses: Expense[] }> = {};

    for (const exp of sortedExpenses) {
      const d = new Date(exp.timestamp);
      const dayKey = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      
      if (!dayGroups[dayKey]) {
        const today = new Date();
        const isToday = today.toLocaleDateString('en-IN') === d.toLocaleDateString('en-IN');
        
        let dayTitle = '';
        if (isToday) {
          dayTitle = 'Today - ' + d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
        } else {
          dayTitle = `${dayKey} - ${d.toLocaleDateString('en-IN', { weekday: 'long' })}`;
        }

        dayGroups[dayKey] = {
          title: dayTitle,
          timestamp: exp.timestamp,
          isToday,
          expenses: [],
        };
      }
      dayGroups[dayKey].expenses.push(exp);
    }

    // Sort day groups descending by date
    const sortedDays = Object.entries(dayGroups).sort((a, b) => b[1].timestamp - a[1].timestamp);

    // Flatten day groups into a single list of items containing dividers and expenses
    const flattenedItems: any[] = [];
    for (const [dayKey, dayVal] of sortedDays) {
      const dayTotal = dayVal.expenses.reduce((sum, e) => {
        const amt = Number(e.amount) || 0;
        return e.transactionType === 'credit' ? sum + amt : sum - amt;
      }, 0);

      // Push the Date Divider with dateKey and isToday properties
      flattenedItems.push({
        id: `divider_${dayKey}`,
        isDivider: true,
        title: dayVal.title,
        dayTotal,
        dateKey: dayKey,
        isToday: dayVal.isToday,
      });

      // Push all expenses of that day with parent details attached
      flattenedItems.push(
        ...dayVal.expenses.map(e => ({
          ...e,
          parentDateKey: dayKey,
          isToday: dayVal.isToday,
        }))
      );
    }

    return {
      id: `month:${monthKey}`,
      type: 'month',
      title: val.title,
      expenses: flattenedItems,
      total: monthTotal,
    };
  });

  // Sort months descending (most recent month first)
  return sections.sort((a, b) => {
    const getLatestTimestamp = (sec: GroupedSection) => {
      const firstExpense = sec.expenses.find(e => !e.isDivider);
      return firstExpense ? firstExpense.timestamp : 0;
    };
    return getLatestTimestamp(b) - getLatestTimestamp(a);
  });
}
