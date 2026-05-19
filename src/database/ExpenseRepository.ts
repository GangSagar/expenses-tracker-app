/**
 * ExpenseRepository — focused CRUD interface for the `expenses` table.
 *
 * Replaces the monolithic expenseRepo for write/read operations on individual
 * expense records. Aggregation queries live in AggregationRepository.
 */

export {
  insertExpense,
  updateExpense,
  getAllExpenses,
  getRecentExpenses,
  getWindowedExpenses,
  exportAllExpensesData,
  clearAllExpenses,
  deleteExpense,
  deleteTransactionsForAccount,
  invalidateExpense,
  updateTrashReason,
  deduplicateDatabase,
} from './expenseRepo';
