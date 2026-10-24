import { Expense } from '../types/expense';

export interface AccountBalanceSummary {
  bank: string;
  account: string;
  cardType: 'cc' | 'debit';
  latestBalance: number;
  lastUpdated: number;
  totalDebits: number;
  totalCredits: number;
  transactionCount: number;
  transactions: Expense[];
}

/**
 * Calculates current live balances and summaries across unique bank + account pairs.
 * Uses available balance checkpoints when present and applies subsequent transaction deltas.
 */
export function computeAccountSummaries(
  expenses: Expense[],
  hiddenAccounts: string[] = [],
): AccountBalanceSummary[] {
  const activeExpenses = expenses.filter(e => !e.isInvalid);

  // Group by unique bank + account pairs
  const accountGroups: Record<string, Expense[]> = {};
  for (const e of activeExpenses) {
    if (!e.bank || !e.account) continue;
    const key = `${e.bank}::${e.account}`;
    if (hiddenAccounts.includes(key)) continue;
    if (!accountGroups[key]) accountGroups[key] = [];
    accountGroups[key].push(e);
  }

  const results: AccountBalanceSummary[] = [];

  for (const [key, list] of Object.entries(accountGroups)) {
    const [bank, account] = key.split('::');
    // Chronological order: oldest to newest
    const sorted = [...list].sort((a, b) => a.timestamp - b.timestamp);

    // Latest Available Balance checkpoint
    const latestWithBal = [...sorted]
      .reverse()
      .find(e => e.availableBalance !== undefined && e.availableBalance !== null);

    let latestBalance = 0;
    const lastUpdated = sorted.length > 0 ? sorted[sorted.length - 1].timestamp : 0;

    if (latestWithBal && latestWithBal.availableBalance !== undefined && latestWithBal.availableBalance !== null) {
      latestBalance = latestWithBal.availableBalance;
      const latestIdx = sorted.indexOf(latestWithBal);

      // Apply subsequent transaction deltas to compute true current balance
      for (let idx = latestIdx + 1; idx < sorted.length; idx++) {
        const subsequent = sorted[idx];
        if (subsequent.transactionType === 'debit') {
          latestBalance -= subsequent.amount;
        } else {
          latestBalance += subsequent.amount;
        }
      }
    } else {
      // Fallback: Accumulate transaction deltas from zero
      latestBalance = sorted.reduce((sum, e) => {
        return e.transactionType === 'debit' ? sum - e.amount : sum + e.amount;
      }, 0);
    }

    // Determine card / account type (if mostly CC, mark as CC)
    const ccCount = sorted.filter(e => e.paymentMode === 'cc').length;
    const cardType: 'cc' | 'debit' = ccCount > sorted.length / 2 ? 'cc' : 'debit';

    const totalDebits = sorted
      .filter(e => e.transactionType === 'debit')
      .reduce((sum, e) => sum + e.amount, 0);

    const totalCredits = sorted
      .filter(e => e.transactionType === 'credit')
      .reduce((sum, e) => sum + e.amount, 0);

    results.push({
      bank,
      account,
      cardType,
      latestBalance,
      lastUpdated,
      totalDebits,
      totalCredits,
      transactionCount: sorted.length,
      transactions: sorted,
    });
  }

  return results;
}
