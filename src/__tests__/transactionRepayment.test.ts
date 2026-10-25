import { Expense } from '../types/expense';
import {
  planAutomaticRepayment,
  repaymentSplit,
  remainingSplitAmount,
} from '../core/transactions/repaymentPlanner';

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 1,
    amount: 50,
    merchant: 'Dinner',
    category: 'Food & Dining',
    confidence: 1,
    timestamp: 100,
    source: 'manual',
    rawMessage: '',
    transactionType: 'debit',
    ...overrides,
  };
}

describe('planAutomaticRepayment', () => {
  it('partially settles the next oldest split when the credit runs out', () => {
    const oldest = makeExpense({
      id: 1,
      timestamp: 100,
      splits: [{ contactName: 'Alex', amount: 75 }],
    });
    const newer = makeExpense({
      id: 2,
      timestamp: 200,
      splits: [{ contactName: 'Alex', amount: 100 }],
    });
    const credit = makeExpense({
      id: undefined,
      amount: 125,
      merchant: 'Repayment from Alex',
      transactionType: 'credit',
    });

    const plan = planAutomaticRepayment(credit, [newer, oldest]);

    expect(plan).toEqual({
      contactName: 'Alex',
      settledAmount: 125,
      updates: [{
        expenseId: 1,
        splits: [{ contactName: 'Alex', amount: 75, paidAmount: 75, isPaid: true }],
      }, {
        expenseId: 2,
        splits: [{ contactName: 'Alex', amount: 100, paidAmount: 50, isPaid: false }],
      }],
    });
    expect(repaymentSplit(plan!)).toEqual({
      contactName: 'Alex',
      amount: 125,
      isPaid: true,
      owedByMe: true,
    });
    expect(oldest.splits?.[0].isPaid).toBeUndefined();
    expect(newer.splits?.[0].isPaid).toBeUndefined();
  });

  it('applies a partial repayment to the oldest split without skipping ahead', () => {
    const oldest = makeExpense({
      id: 1,
      timestamp: 100,
      splits: [{ contactName: 'Alex', amount: 150 }],
    });
    const newer = makeExpense({
      id: 2,
      timestamp: 200,
      splits: [{ contactName: 'Alex', amount: 50 }],
    });
    const credit = makeExpense({
      amount: 100,
      merchant: 'Alex repayment',
      transactionType: 'credit',
    });

    expect(planAutomaticRepayment(credit, [newer, oldest])).toEqual({
      contactName: 'Alex',
      settledAmount: 100,
      updates: [{
        expenseId: 1,
        splits: [{ contactName: 'Alex', amount: 150, paidAmount: 100, isPaid: false }],
      }],
    });
  });

  it('adds a later repayment to the existing paid amount and caps at the original amount', () => {
    const partiallyPaid = makeExpense({
      id: 1,
      splits: [{ contactName: 'Alex', amount: 100, paidAmount: 70 }],
    });
    const credit = makeExpense({
      amount: 60,
      merchant: 'Alex repayment',
      transactionType: 'credit',
    });

    expect(planAutomaticRepayment(credit, [partiallyPaid])).toEqual({
      contactName: 'Alex',
      settledAmount: 30,
      updates: [{
        expenseId: 1,
        splits: [{ contactName: 'Alex', amount: 100, paidAmount: 100, isPaid: true }],
      }],
    });
  });

  it('ignores non-credit, invalid, and unmatched incoming transactions', () => {
    const debt = makeExpense({
      splits: [{ contactName: 'Alex', amount: 50 }],
    });
    const expenses = [debt];

    expect(planAutomaticRepayment(makeExpense({ amount: 50 }), expenses)).toBeNull();
    expect(planAutomaticRepayment(makeExpense({
      amount: 50,
      transactionType: 'credit',
      merchant: 'Alex',
      isInvalid: true,
    }), expenses)).toBeNull();
    expect(planAutomaticRepayment(makeExpense({
      amount: 50,
      transactionType: 'credit',
      merchant: 'Unknown person',
    }), expenses)).toBeNull();
  });
});

describe('remainingSplitAmount', () => {
  it('supports legacy full/unpaid rows and new partial allocations', () => {
    expect(remainingSplitAmount({ contactName: 'Alex', amount: 100 })).toBe(100);
    expect(remainingSplitAmount({ contactName: 'Alex', amount: 100, paidAmount: 35 })).toBe(65);
    expect(remainingSplitAmount({ contactName: 'Alex', amount: 100, isPaid: true })).toBe(0);
    expect(remainingSplitAmount({
      contactName: 'Alex',
      amount: 100,
      paidAmount: 150,
      isPaid: false,
    })).toBe(0);
  });
});
