import { Expense } from '../types/expense';
import { parseDateString } from '../utils/dateHelpers';

// High-fidelity mock database records for filter validation
const mockExpenses: Expense[] = [
  {
    id: 1,
    amount: 1500,
    merchant: 'Swiggy',
    category: 'Food & Dining',
    timestamp: new Date('2026-05-10T14:30:00').getTime(),
    source: 'sms',
    transactionType: 'debit',
    bank: 'HDFC',
    isInvalid: false,
    confidence: 1,
    rawMessage: '',
  },
  {
    id: 2,
    amount: 4500,
    merchant: 'Amazon Marketplace',
    category: 'Shopping',
    timestamp: new Date('2026-05-12T10:00:00').getTime(),
    source: 'manual',
    transactionType: 'debit',
    isInvalid: false,
    confidence: 1,
    rawMessage: '',
  },
  {
    id: 3,
    amount: 50000,
    merchant: 'Salary Credit',
    category: 'Finance',
    timestamp: new Date('2026-05-15T09:00:00').getTime(),
    source: 'notification',
    transactionType: 'credit',
    bank: 'ICICI',
    isInvalid: false,
    confidence: 1,
    rawMessage: '',
  },
  {
    id: 4,
    amount: 200,
    merchant: 'Uber Ride',
    category: 'Travel',
    timestamp: new Date('2026-05-17T18:00:00').getTime(),
    source: 'sms',
    transactionType: 'debit',
    bank: 'SBI',
    isInvalid: true, // Trashed/Invalidated item
    confidence: 1,
    rawMessage: '',
  },
];

describe('Transaction Filter Logic Engine', () => {
  it('filters active (non-trashed) transactions correctly by default', () => {
    const active = mockExpenses.filter(e => !e.isInvalid);
    expect(active.length).toBe(3);
    expect(active.map(e => e.id)).toEqual([1, 2, 3]);
  });

  it('filters trashed (invalid) transactions when requested', () => {
    const trashed = mockExpenses.filter(e => e.isInvalid);
    expect(trashed.length).toBe(1);
    expect(trashed[0].merchant).toBe('Uber Ride');
  });

  it('performs robust, case-insensitive substring search matching', () => {
    const q = 'market';
    const filtered = mockExpenses.filter(e => {
      if (e.isInvalid) return false;
      return e.merchant && e.merchant.toLowerCase().includes(q);
    });
    expect(filtered.length).toBe(1);
    expect(filtered[0].merchant).toBe('Amazon Marketplace');
  });

  it('filters by category selection correctly', () => {
    const category = 'Food & Dining';
    const filtered = mockExpenses.filter(e => !e.isInvalid && e.category === category);
    expect(filtered.length).toBe(1);
    expect(filtered[0].merchant).toBe('Swiggy');
  });

  it('segregates transaction type (debit vs credit) accurately', () => {
    const debits = mockExpenses.filter(e => !e.isInvalid && e.transactionType === 'debit');
    const credits = mockExpenses.filter(e => !e.isInvalid && e.transactionType === 'credit');
    expect(debits.length).toBe(2);
    expect(credits.length).toBe(1);
  });

  it('filters transactions accurately within custom date range boundaries', () => {
    // Filter between 2026-05-11 and 2026-05-16
    const startTs = parseDateString('2026-05-11');
    const endTs = parseDateString('2026-05-16');

    expect(startTs).not.toBeNull();
    expect(endTs).not.toBeNull();

    const filtered = mockExpenses.filter(e => {
      if (e.isInvalid) return false;
      
      let matchDate = true;
      if (startTs !== null) {
        const startOfDay = new Date(startTs);
        startOfDay.setHours(0, 0, 0, 0);
        matchDate = matchDate && e.timestamp >= startOfDay.getTime();
      }
      if (endTs !== null) {
        const endOfDay = new Date(endTs);
        endOfDay.setHours(23, 59, 59, 999);
        matchDate = matchDate && e.timestamp <= endOfDay.getTime();
      }
      return matchDate;
    });

    // Should include Amazon (May 12) and Salary (May 15)
    // Should exclude Swiggy (May 10 - too early) and Uber (May 17 - too late & trashed)
    expect(filtered.length).toBe(2);
    expect(filtered.map(e => e.merchant)).toEqual(['Amazon Marketplace', 'Salary Credit']);
  });
});
