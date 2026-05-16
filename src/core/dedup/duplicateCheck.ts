import { Expense } from '../../types/expense';

const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export function isDuplicate(
  newExpense: {
    amount: number;
    merchant: string | null;
    transactionType: string;
  },
  recentExpenses: Expense[],
): boolean {
  const now = Date.now();

  for (const existing of recentExpenses) {
    const timeDiff = now - existing.timestamp;
    if (timeDiff > DEDUP_WINDOW_MS) {
      continue;
    }

    const sameAmount = existing.amount === newExpense.amount;
    const sameMerchant =
      normalizeMerchant(existing.merchant) ===
      normalizeMerchant(newExpense.merchant || '');
    const sameType = existing.transactionType === newExpense.transactionType;

    if (sameAmount && sameMerchant && sameType) {
      return true;
    }
  }

  return false;
}

function normalizeMerchant(merchant: string): string {
  return merchant.toLowerCase().replace(/[^a-z0-9]/g, '');
}
