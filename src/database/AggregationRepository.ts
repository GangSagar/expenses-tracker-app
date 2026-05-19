/**
 * AggregationRepository — read-only query interface over the `expenses` table.
 *
 * Owns monthly totals, category breakdowns, and account balance queries
 * that are used by AccountsScreen and advisorService. No writes here.
 */

export { getExpensesByCategory, getMonthlyTotal } from './expenseRepo';
