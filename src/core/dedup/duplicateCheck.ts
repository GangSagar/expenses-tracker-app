import { Expense } from '../../types/expense';

const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export function isDuplicate(
  newExpense: {
    amount: number;
    merchant: string | null;
    transactionType: string;
    referenceId?: string;
    rawMessage?: string;
    bank?: string;
  },
  recentExpenses: Expense[],
): boolean {
  const now = Date.now();

  const getNumericTokens = (msg?: string): string[] => {
    if (!msg) return [];
    const matches = msg.match(/\b\d{6,12}\b/g);
    return matches || [];
  };

  const newTokens = getNumericTokens(newExpense.rawMessage);

  for (const existing of recentExpenses) {
    const timeDiff = now - existing.timestamp;
    if (timeDiff > DEDUP_WINDOW_MS) {
      continue;
    }

    const sameAmount = existing.amount === newExpense.amount;
    const sameType = existing.transactionType === newExpense.transactionType;

    // 1. Direct Reference ID match
    if (
      existing.referenceId &&
      newExpense.referenceId &&
      existing.referenceId.toLowerCase().trim() === newExpense.referenceId.toLowerCase().trim()
    ) {
      return true;
    }

    // 2. Reference ID cross-message search
    if (
      existing.referenceId &&
      newExpense.rawMessage &&
      newExpense.rawMessage.toLowerCase().includes(existing.referenceId.toLowerCase())
    ) {
      return true;
    }
    if (
      newExpense.referenceId &&
      existing.rawMessage &&
      existing.rawMessage.toLowerCase().includes(newExpense.referenceId.toLowerCase())
    ) {
      return true;
    }

    // 3. Shared 6-to-12 digit numeric transaction token match within same time-window
    if (sameAmount && sameType && newTokens.length > 0) {
      const existingTokens = getNumericTokens(existing.rawMessage);
      const hasCommonToken = existingTokens.some(token => newTokens.includes(token));
      if (hasCommonToken) {
        return true;
      }
    }

    // 4. Default amount, merchant name & type match (legacy fallback)
    const sameMerchant =
      normalizeMerchant(existing.merchant) ===
      normalizeMerchant(newExpense.merchant || '');

    if (sameAmount && sameMerchant && sameType) {
      return true;
    }
  }

  return false;
}

function normalizeMerchant(merchant: string): string {
  return merchant.toLowerCase().replace(/[^a-z0-9]/g, '');
}
