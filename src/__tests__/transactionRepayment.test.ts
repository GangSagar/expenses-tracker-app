import { Expense } from '../types/expense';
import {
  planAutomaticRepayment,
  repaymentSplit,
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
  it('settles only complete split rows that fit the credit, oldest first', () => {
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
      settledAmount: 75,
      updates: [{
        expenseId: 1,
        splits: [{ contactName: 'Alex', amount: 75, isPaid: true }],
      }],
    });
    expect(repaymentSplit(plan!)).toEqual({
      contactName: 'Alex',
      amount: 75,
      isPaid: true,
      owedByMe: true,
    });
    expect(oldest.splits?.[0].isPaid).toBeUndefined();
    expect(newer.splits?.[0].isPaid).toBeUndefined();
  });

  it('does not skip an older unaffordable split to settle a newer smaller one', () => {
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

    expect(planAutomaticRepayment(credit, [newer, oldest])).toBeNull();
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
