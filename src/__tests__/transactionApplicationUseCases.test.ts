import { Expense } from '../types/expense';
import {
  importTransactions, persistAcceptedTransaction,
} from '../core/transactions/applicationUseCases';
import { TransactionRepository } from '../core/transactions/contracts';
import { createManualTransaction } from '../services/transactions/transactionApplication';

function candidate(overrides: Partial<Expense> = {}): Omit<Expense, 'id'> {
  return {
    amount: 40,
    merchant: 'Purchase',
    category: 'Other',
    confidence: 1,
    timestamp: 100,
    source: 'sms',
    rawMessage: 'purchase alert',
    transactionType: 'debit',
    ...overrides,
  };
}

function repository(ledger: Expense[] = []): TransactionRepository & { inserted: Expense[] } {
  const inserted: Expense[] = [];
  return {
    inserted,
    getExpensesWithSplits: () => ledger,
    insert: expense => {
      const persisted = { ...expense, id: inserted.length + 1 };
      inserted.push(persisted);
      return persisted;
    },
    insertWithRepayment: expense => {
      const persisted = { ...expense, id: inserted.length + 1 };
      inserted.push(persisted);
      return persisted;
    },
    findById: id => inserted.find(item => item.id === id) as (Expense & { id: number }) | undefined || null,
    getRecentExpenses: () => [],
    updateSplitExpensesAtomically: () => {},
    mutateWithSplitUpdates: () => {},
  };
}

describe('transaction application use cases', () => {
  it('imports rows oldest-first while preserving scan order for equal timestamps', async () => {
    const writes = repository();
    const later = candidate({ timestamp: 300, rawMessage: 'later' });
    const sameTimeFirst = candidate({ timestamp: 200, rawMessage: 'same-first' });
    const sameTimeSecond = candidate({ timestamp: 200, rawMessage: 'same-second' });
    const results = await importTransactions(
      [later, sameTimeFirst, sameTimeSecond], writes, () => false,
    );

    expect(writes.inserted.map(row => row.rawMessage)).toEqual([
      'same-first', 'same-second', 'later',
    ]);
    expect(results.map(row => row.status)).toEqual(['imported', 'imported', 'imported']);
  });

  it('applies repayments through the ledger gateway for accepted credits', () => {
    const debt: Expense = {
      ...candidate({ timestamp: 1, merchant: 'Shared dinner', splits: [
        { contactName: 'Alex', amount: 100 },
      ] }),
      id: 9,
    };
    const writes = repository([debt]);
    const result = persistAcceptedTransaction(
      candidate({
        amount: 35,
        merchant: 'Repayment from Alex',
        transactionType: 'credit',
      }),
      writes,
    );

    expect(result.status).toBe('saved');
    expect(writes.inserted[0].splits).toEqual([{
      contactName: 'Alex', amount: 35, isPaid: true, owedByMe: true,
      repaymentAllocations: [{ expenseId: 9, splitId: 'legacy-9-0', amount: 35 }],
    }]);
  });

  it('imports credits chronologically and applies each against the updated full ledger', async () => {
    const debt: Expense = {
      ...candidate({
        timestamp: 1,
        merchant: 'Shared dinner',
        splits: [{ contactName: 'Alex', amount: 100 }],
      }),
      id: 90,
    };
    const writes = repository([debt]);
    const ledger: Expense[] = [debt];
    let ledgerReads = 0;
    writes.getExpensesWithSplits = () => {
      ledgerReads += 1;
      return ledger;
    };
    writes.insertWithRepayment = (expense, updates) => {
      for (const update of updates) {
        const row = ledger.find(item => item.id === update.expenseId);
        if (row) row.splits = update.splits;
      }
      const saved = { ...expense, id: ledger.length + 100 };
      writes.inserted.push(saved);
      ledger.push(saved);
      return saved;
    };

    const results = await importTransactions([
      candidate({ timestamp: 300, amount: 40, merchant: 'Repayment from Alex', transactionType: 'credit' }),
      candidate({ timestamp: 200, amount: 30, merchant: 'Repayment from Alex', transactionType: 'credit' }),
    ], writes, () => false);

    expect(results.map(row => row.status)).toEqual(['imported', 'imported']);
    expect(writes.inserted.map(row => row.timestamp)).toEqual([200, 300]);
    expect(ledgerReads).toBe(2);
    expect(ledger[0].splits?.[0].paidAmount).toBe(70);
    expect(writes.inserted.map(row => row.splits?.[0].amount)).toEqual([30, 40]);
  });

  it('reports one failed batch row without rolling back earlier successful rows', async () => {
    const writes = repository();
    let calls = 0;
    const insert = writes.insert;
    writes.insert = expense => {
      calls += 1;
      if (calls === 2) throw new Error('disk full');
      return insert(expense);
    };
    const results = await importTransactions(
      [candidate({ timestamp: 1 }), candidate({ timestamp: 2 })],
      writes,
      () => false,
    );

    expect(results.map(row => row.status)).toEqual(['imported', 'failed']);
    expect(writes.inserted).toHaveLength(1);
  });

  it('validates manually supplied amount before writing', () => {
    const result = createManualTransaction(candidate({ amount: 0 }));
    expect(result).toMatchObject({
      status: 'failed', stage: 'processing',
    });
  });
});
