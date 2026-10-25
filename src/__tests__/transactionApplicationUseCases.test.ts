import { Expense } from '../types/expense';
import {
  importTransactions, persistAcceptedTransaction, TransactionWriteGateway,
} from '../core/transactions/applicationUseCases';
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

function gateway(ledger: Expense[] = []): TransactionWriteGateway & { inserted: Expense[] } {
  const inserted: Expense[] = [];
  return {
    inserted,
    getLedgerWithSplits: () => ledger,
    insert: expense => {
      inserted.push({ ...expense, id: inserted.length + 1 });
      return inserted.length;
    },
    insertWithRepayment: expense => {
      inserted.push({ ...expense, id: inserted.length + 1 });
      return inserted.length;
    },
    update: () => {},
    invalidate: () => {},
    delete: () => {},
  };
}

describe('transaction application use cases', () => {
  it('imports rows oldest-first while preserving scan order for equal timestamps', async () => {
    const writes = gateway();
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
    const writes = gateway([debt]);
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
    }]);
  });

  it('reports one failed batch row without rolling back earlier successful rows', async () => {
    const writes = gateway();
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
