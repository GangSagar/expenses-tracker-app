import { Expense } from '../types/expense';

export interface GroupedSection {
  id: string;
  type: 'today' | 'date' | 'month' | 'year';
  title: string;
  expenses: Expense[];
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
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const thirtyDaysAgo = todayStart - 30 * 24 * 60 * 60 * 1000;

  const groups: Record<string, { type: 'today' | 'date' | 'month' | 'year'; title: string; expenses: Expense[] }> = {};

  for (const expense of expenses) {
    const t = expense.timestamp;
    const dateObj = new Date(t);
    
    let groupId = '';
    let type: 'today' | 'date' | 'month' | 'year' = 'date';
    let title = '';

    if (t >= todayStart) {
      groupId = 'today';
      type = 'today';
      title = 'Today - ' + dateObj.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
    } else if (t >= thirtyDaysAgo) {
      const dateKey = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      groupId = `date:${dateKey}`;
      type = 'date';
      title = `${dateKey} - ${dateObj.toLocaleDateString('en-IN', { weekday: 'long' })}`;
    } else if (dateObj.getFullYear() === now.getFullYear()) {
      const monthName = dateObj.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      groupId = `month:${monthName}`;
      type = 'month';
      title = monthName;
    } else {
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
      const maxA = Math.max(...a.expenses.map(e => e.timestamp));
      const maxB = Math.max(...b.expenses.map(e => e.timestamp));
      return maxB - maxA;
    });
}
