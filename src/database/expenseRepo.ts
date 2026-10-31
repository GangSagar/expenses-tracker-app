import { Expense, Category, TransactionLocation } from '../types/expense';
import { QuickSQLiteConnection } from 'react-native-quick-sqlite';
import { getDatabase } from './db';
import { telemetry } from '../infrastructure/observability/telemetryService';
import { SplitSettlementUpdate } from '../core/transactions/repaymentPlanner';
import { TransactionMutation } from '../core/transactions/contracts';
import {
  addDedupCandidate,
  createDedupCache,
  DedupCandidate,
  DedupRecord,
  DEDUP_WINDOW_MS,
  findDuplicate,
} from '../core/dedup/duplicateCheck';

// ==========================================
// Centralized Database SQL Command Constants
// ==========================================

export const INSERT_EXPENSE_SQL = `
  INSERT INTO expenses (
    amount, merchant, alias, category, confidence, timestamp, source, 
    raw_message, transaction_type, account, bank, payment_mode, 
    is_duplicate, available_balance, splits, reference_id, is_invalid, trash_reason,
    tags, notes, bill_image_uri, location
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const UPDATE_EXPENSE_WITH_AMOUNT_SQL = `
  UPDATE expenses 
  SET merchant = ?, category = ?, bank = ?, payment_mode = ?, amount = ?, splits = ?, transaction_type = COALESCE(?, transaction_type),
      tags = COALESCE(?, tags), notes = COALESCE(?, notes), bill_image_uri = COALESCE(?, bill_image_uri)
  WHERE id = ?
`;

export const UPDATE_EXPENSE_SPLITS_SQL = `
  UPDATE expenses SET splits = ? WHERE id = ?
`;

export const GET_ALL_DEDUP_RECORDS_SQL = `
  SELECT id, amount, merchant, transaction_type, timestamp, source, reference_id,
    raw_message, is_invalid, is_duplicate
  FROM expenses
`;

export const GET_DEDUP_CANDIDATES_SQL = `
  SELECT id, amount, merchant, transaction_type, timestamp, source, reference_id,
    raw_message, is_invalid, is_duplicate
  FROM expenses
  WHERE (? IS NOT NULL AND LOWER(TRIM(reference_id)) = ?)
     OR (timestamp >= ? AND timestamp <= ?)
`;

export const GET_EXPENSE_BY_ID_SQL = `
  SELECT * FROM expenses WHERE id = ? LIMIT 1
`;

export const GET_ALL_EXPENSES_SQL = `
  SELECT * FROM expenses WHERE is_duplicate = 0 ORDER BY timestamp DESC LIMIT ? OFFSET ?
`;

export const GET_WINDOWED_EXPENSES_SQL = `
  SELECT * FROM expenses WHERE is_duplicate = 0 AND timestamp >= ? ORDER BY timestamp DESC
`;

/** Full ledger slice for repayment planning; independent of UI pagination/windowing. */
export const GET_EXPENSES_WITH_SPLITS_SQL = `
  SELECT * FROM expenses
  WHERE is_duplicate = 0 AND splits IS NOT NULL
  ORDER BY timestamp ASC
`;

export const GET_EXPENSES_BY_CATEGORY_SQL = `
  SELECT * FROM expenses WHERE category = ? AND is_duplicate = 0 ORDER BY timestamp DESC
`;

export const GET_MONTHLY_TOTAL_SQL = `
  SELECT COALESCE(SUM(amount), 0) as total FROM expenses
  WHERE timestamp >= ? AND timestamp < ? AND transaction_type = 'debit' AND is_duplicate = 0
`;

export const SAVE_MERCHANT_CATEGORY_SQL = `
  INSERT OR REPLACE INTO merchant_categories (merchant, category, display_name) VALUES (?, ?, ?)
`;

export const LOAD_MERCHANT_CATEGORIES_SQL = `
  SELECT * FROM merchant_categories
`;

export const EXPORT_ALL_EXPENSES_DATA_SQL = `
  SELECT * FROM expenses ORDER BY timestamp DESC
`;

export const CLEAR_ALL_EXPENSES_SQL = `
  DELETE FROM expenses
`;

export const CLEAR_ALL_MERCHANT_CATEGORIES_SQL = `
  DELETE FROM merchant_categories
`;

export const CLEAR_ALL_SETTINGS_SQL = `
  DELETE FROM settings WHERE key LIKE 'account_type::%' OR key = 'ignored_anomalies' OR key = 'spam_ai_model' OR key = 'spam_classifier_state'
`;

export const DELETE_EXPENSE_SQL = `
  DELETE FROM expenses WHERE id = ?
`;

export const DELETE_TRANSACTIONS_FOR_ACCOUNT_SQL = `
  DELETE FROM expenses WHERE bank = ? AND account = ?
`;

export const INVALIDATE_EXPENSE_RESET_SQL = `
  UPDATE expenses SET is_invalid = ?, trash_reason = NULL WHERE id = ?
`;

export const INVALIDATE_EXPENSE_SQL = `
  UPDATE expenses SET is_invalid = ? WHERE id = ?
`;

export const INVALIDATE_EXPENSE_WITH_SPLITS_SQL = `
  UPDATE expenses SET is_invalid = ?, splits = ?,
    trash_reason = CASE WHEN ? = 0 THEN NULL ELSE trash_reason END
  WHERE id = ?
`;

export const UPDATE_TRASH_REASON_SQL = `
  UPDATE expenses SET trash_reason = ? WHERE id = ?
`;

export const GET_SETTING_SQL = `
  SELECT value FROM settings WHERE key = ?
`;

export const SET_SETTING_SQL = `
  INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
`;

// ==========================================
// Repository Methods
// ==========================================

export function insertExpense(expense: Omit<Expense, 'id'>): number {
  return telemetry.traceSync(
    'db.insertExpense',
    {
      amount: expense.amount,
      bank: expense.bank || 'unknown',
      type: expense.transactionType,
      source: expense.source,
    },
    () => {
      const db = getDatabase();
      const result = db.execute(INSERT_EXPENSE_SQL, getInsertExpenseParams(expense));
      return result.insertId ?? -1;
    }
  );
}

function getInsertExpenseParams(expense: Omit<Expense, 'id'>): unknown[] {
  return [
    expense.amount,
    expense.merchant,
    expense.alias || null,
    expense.category,
    expense.confidence,
    expense.timestamp,
    expense.source,
    expense.rawMessage,
    expense.transactionType,
    expense.account || null,
    expense.bank || null,
    expense.paymentMode || 'unknown',
    expense.isDuplicate ? 1 : 0,
    expense.availableBalance !== undefined ? expense.availableBalance : null,
    expense.splits ? JSON.stringify(expense.splits) : null,
    expense.referenceId || expense.transactionId || null,
    expense.isInvalid ? 1 : 0,
    expense.trashReason || null,
    expense.tags ? JSON.stringify(expense.tags) : null,
    expense.notes || null,
    expense.billImageUri || null,
    expense.location ? JSON.stringify(expense.location) : null,
  ];
}

function runInDatabaseTransaction<T>(
  work: (execute: QuickSQLiteConnection['execute']) => T,
): T {
  const db = getDatabase();
  db.execute('BEGIN TRANSACTION');
  try {
    const result = work(db.execute.bind(db));
    db.execute('COMMIT');
    return result;
  } catch (error) {
    try {
      db.execute('ROLLBACK');
    } catch {
      // Keep the original write failure as the reported cause.
    }
    throw error;
  }
}

function writeSplitUpdates(
  execute: (query: string, params?: any[]) => { rowsAffected: number },
  updates: SplitSettlementUpdate[],
): void {
  for (const update of updates) {
    const result = execute(UPDATE_EXPENSE_SPLITS_SQL, [
      JSON.stringify(update.splits),
      update.expenseId,
    ]);
    if (result.rowsAffected !== 1) {
      throw new Error(`Could not update repayment split for expense ${update.expenseId}`);
    }
  }
}

/** Insert a manual credit and its related split settlements atomically. */
export function insertExpenseWithRepayment(
  expense: Omit<Expense, 'id'>,
  updates: SplitSettlementUpdate[],
): number {
  return telemetry.traceSync(
    'db.insertExpenseWithRepayment',
    { amount: expense.amount, type: expense.transactionType, source: expense.source },
    () => runInDatabaseTransaction(execute => {
      writeSplitUpdates(execute, updates);
      const insertId = execute(INSERT_EXPENSE_SQL, getInsertExpenseParams(expense)).insertId;
      if (!Number.isInteger(insertId) || Number(insertId) <= 0) {
        throw new Error('SQLite did not return a valid repayment transaction identifier.');
      }
      return insertId!;
    }),
  );
}

/** Persist a set of split state changes atomically. */
export function updateSplitExpensesAtomically(updates: SplitSettlementUpdate[]): void {
  if (updates.length === 0) return;
  runInDatabaseTransaction(execute => {
    writeSplitUpdates(execute, updates);
  });
}

/** Atomically applies one transaction mutation and every related split adjustment. */
export function mutateExpenseWithSplitUpdatesAtomically(
  id: number,
  mutation: TransactionMutation,
  updates: SplitSettlementUpdate[],
): void {
  runInDatabaseTransaction(execute => {
    writeSplitUpdates(execute, updates);
    let result;
    if (mutation.kind === 'update') {
      result = execute(UPDATE_EXPENSE_WITH_AMOUNT_SQL, [
        mutation.merchant,
        mutation.category,
        mutation.bank || null,
        mutation.paymentMode || 'unknown',
        mutation.amount,
        mutation.splits ? JSON.stringify(mutation.splits) : null,
        mutation.transactionType,
        mutation.tags ? JSON.stringify(mutation.tags) : null,
        mutation.notes || null,
        mutation.billImageUri || null,
        id,
      ]);
    } else if (mutation.kind === 'invalidate') {
      if (mutation.splits !== undefined) {
        result = execute(INVALIDATE_EXPENSE_WITH_SPLITS_SQL, [
          mutation.isInvalid ? 1 : 0,
          mutation.splits ? JSON.stringify(mutation.splits) : null,
          mutation.isInvalid ? 1 : 0,
          id,
        ]);
      } else {
        result = execute(
          mutation.isInvalid ? INVALIDATE_EXPENSE_SQL : INVALIDATE_EXPENSE_RESET_SQL,
          mutation.isInvalid ? [1, id] : [0, id],
        );
      }
    } else {
      result = execute(DELETE_EXPENSE_SQL, [id]);
    }
    if (result.rowsAffected !== undefined && result.rowsAffected !== 1) {
      const operation = mutation.kind === 'delete' ? 'delete' : 'update';
      throw new Error(`Could not ${operation} transaction ${id}`);
    }
  });
}

export function getExpenseById(id: number): Expense | null {
  const db = getDatabase();
  const result = db.execute(GET_EXPENSE_BY_ID_SQL, [id]);
  const row = result.rows?._array?.[0];
  return row ? mapRows([row])[0] : null;
}

export function getAllDedupRecords(): DedupRecord[] {
  const db = getDatabase();
  const result = db.execute(GET_ALL_DEDUP_RECORDS_SQL);
  return mapDedupRows(result.rows?._array || []);
}

export function getDedupCandidates(candidate: DedupCandidate): DedupRecord[] {
  const db = getDatabase();
  const referenceId = candidate.referenceId?.trim().toLocaleLowerCase() || null;
  const result = db.execute(GET_DEDUP_CANDIDATES_SQL, [
    referenceId,
    referenceId,
    candidate.timestamp - DEDUP_WINDOW_MS,
    candidate.timestamp + DEDUP_WINDOW_MS,
  ]);
  return mapDedupRows(result.rows?._array || []);
}

export function getAllExpenses(
  limit: number = 50,
  offset: number = 0,
): Expense[] {
  return telemetry.traceSync('db.getAllExpenses', { limit, offset }, () => {
    const db = getDatabase();
    const result = db.execute(GET_ALL_EXPENSES_SQL, [limit, offset]);
    return mapRows(result.rows?._array || []);
  });
}

export function getWindowedExpenses(days: number = 30): Expense[] {
  return telemetry.traceSync('db.getWindowedExpenses', { days }, () => {
    const db = getDatabase();
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const result = db.execute(GET_WINDOWED_EXPENSES_SQL, [since]);
    return mapRows(result.rows?._array || []);
  });
}

export function getExpensesWithSplits(): Expense[] {
  return telemetry.traceSync('db.getExpensesWithSplits', {}, () => {
    const db = getDatabase();
    const result = db.execute(GET_EXPENSES_WITH_SPLITS_SQL);
    return mapRows(result.rows?._array || []);
  });
}

export function getExpensesByCategory(category: Category): Expense[] {
  return telemetry.traceSync('db.getExpensesByCategory', { category }, () => {
    const db = getDatabase();
    const result = db.execute(GET_EXPENSES_BY_CATEGORY_SQL, [category]);
    return mapRows(result.rows?._array || []);
  });
}

export function getMonthlyTotal(year: number, month: number): number {
  return telemetry.traceSync('db.getMonthlyTotal', { year, month }, () => {
    const db = getDatabase();
    const startDate = new Date(year, month - 1, 1).getTime();
    const endDate = new Date(year, month, 1).getTime();
    const result = db.execute(GET_MONTHLY_TOTAL_SQL, [startDate, endDate]);
    return result.rows?._array?.[0]?.total || 0;
  });
}

export function saveMerchantCategory(
  merchantAlias: string,
  category: Category,
  displayName?: string,
): void {
  const db = getDatabase();
  db.execute(SAVE_MERCHANT_CATEGORY_SQL, [
    merchantAlias.toLowerCase().trim(),
    category,
    displayName || null,
  ]);
}

export function loadMerchantCategories(): Record<
  string,
  { category: Category; displayName?: string }
> {
  const db = getDatabase();
  const result = db.execute(LOAD_MERCHANT_CATEGORIES_SQL);
  const map: Record<string, { category: Category; displayName?: string }> = {};
  const rows = result.rows?._array || [];
  for (const row of rows) {
    map[row.merchant] = {
      category: row.category as Category,
      displayName: row.display_name || undefined,
    };
  }
  return map;
}

export function exportAllExpensesData(): Expense[] {
  const db = getDatabase();
  const result = db.execute(EXPORT_ALL_EXPENSES_DATA_SQL);
  return mapRows(result.rows?._array || []);
}

function clearAllExpenseData(
  execute: (query: string, params?: any[]) => { rowsAffected: number },
): void {
  execute(CLEAR_ALL_EXPENSES_SQL);
  execute(CLEAR_ALL_MERCHANT_CATEGORIES_SQL);
  execute(CLEAR_ALL_SETTINGS_SQL);
}

function mapBackupExpense(item: Expense): Omit<Expense, 'id'> {
  return {
    amount: item.amount,
    merchant: item.merchant,
    alias: item.alias,
    category: item.category,
    confidence: item.confidence || 1,
    timestamp: item.timestamp,
    source: item.source || 'manual',
    rawMessage: item.rawMessage || 'Imported Transaction',
    transactionType: item.transactionType || 'debit',
    account: item.account,
    bank: item.bank,
    paymentMode: item.paymentMode,
    isDuplicate: item.isDuplicate,
    availableBalance: item.availableBalance,
    splits: item.splits?.map(split => ({ ...split })),
    referenceId: item.referenceId,
    isInvalid: item.isInvalid,
    trashReason: item.trashReason,
  };
}

/** Restore exact backup rows in one commit; do not re-run repayment planning. */
export function restoreExpenseSnapshot(expenses: Expense[], overwrite: boolean): void {
  runInDatabaseTransaction(execute => {
    // Replacing a backup replaces the ledger only; app preferences and learned
    // merchant mappings are not part of the transaction snapshot.
    if (overwrite) execute(CLEAR_ALL_EXPENSES_SQL);
    const insertedRows: Array<{ source: Expense; id: number }> = [];
    const restoredIds = new Map<number, number>();
    for (const item of expenses) {
      const withoutLinks = mapBackupExpense({
        ...item,
        splits: item.splits?.map(split => {
          const withoutAllocations = { ...split };
          delete withoutAllocations.repaymentAllocations;
          return withoutAllocations;
        }),
      });
      const result = execute(INSERT_EXPENSE_SQL, getInsertExpenseParams(withoutLinks));
      if (!Number.isInteger(result.insertId) || Number(result.insertId) <= 0) {
        throw new Error('SQLite did not return a valid transaction identifier while restoring the backup.');
      }
      const id = Number(result.insertId);
      if (item.id !== undefined) restoredIds.set(item.id, id);
      insertedRows.push({ source: item, id });
    }
    for (const { source, id } of insertedRows) {
      if (!source.splits?.some(split => Array.isArray(split.repaymentAllocations))) continue;
      const splits = source.splits.map(split => ({
        ...split,
        repaymentAllocations: split.repaymentAllocations?.map(allocation => {
          const restoredExpenseId = restoredIds.get(allocation.expenseId);
          if (restoredExpenseId === undefined) {
            throw new Error(`Backup repayment allocation references missing transaction ${allocation.expenseId}.`);
          }
          return { ...allocation, expenseId: restoredExpenseId };
        }),
      }));
      const result = execute(UPDATE_EXPENSE_SPLITS_SQL, [JSON.stringify(splits), id]);
      if (result.rowsAffected !== undefined && result.rowsAffected !== 1) {
        throw new Error(`Could not restore repayment allocation links for transaction ${id}.`);
      }
    }
  });
}

export function clearAllExpenses(): void {
  runInDatabaseTransaction(execute => clearAllExpenseData(execute));
}

export function deleteTransactionsForAccount(
  bank: string,
  account: string,
): void {
  const db = getDatabase();
  const affected = exportAllExpensesData().filter(expense => expense.bank === bank && expense.account === account);
  if (affected.some(hasSettlementHistory)) {
    throw new Error('Cannot remove this account while its transactions have split settlement or repayment history. Reconcile those splits first.');
  }
  db.execute(DELETE_TRANSACTIONS_FOR_ACCOUNT_SQL, [bank, account]);
}

export function updateTrashReason(id: number, reason: string | null): void {
  const db = getDatabase();
  const result = db.execute(UPDATE_TRASH_REASON_SQL, [reason, id]);
  if (result.rowsAffected !== undefined && result.rowsAffected !== 1) {
    throw new Error(`Could not update trash reason for transaction ${id}`);
  }
}

export function deduplicateDatabase(): number {
  const expenses = exportAllExpensesData().filter(e => !e.isInvalid && !e.isDuplicate);
  expenses.sort((a, b) => a.timestamp - b.timestamp || (a.id || 0) - (b.id || 0));
  const duplicates: Expense[] = [];
  const prior = createDedupCache();

  for (const current of expenses) {
    const match = findDuplicate(current, prior);
    if (match?.kind === 'definite') {
      current.isInvalid = true;
      current.trashReason = 'duplicate';
      duplicates.push(current);
    } else {
      // Possible amount/merchant/time matches are intentionally retained.
      addDedupCandidate(prior, current);
    }
  }

  if (duplicates.length > 0) {
    if (duplicates.some(hasSettlementHistory)) {
      throw new Error('Deduplication would invalidate a transaction with split settlement history. Reconcile that transaction first.');
    }
    runInDatabaseTransaction(execute => {
      for (const duplicate of duplicates) {
        const result = execute(
          'UPDATE expenses SET is_invalid = 1, trash_reason = ? WHERE id = ?',
          ['duplicate', duplicate.id],
        );
        if (result.rowsAffected !== 1) {
          throw new Error(`Could not mark duplicate transaction ${duplicate.id}`);
        }
      }
    });
  }

  return duplicates.length;
}

function hasSettlementHistory(expense: Expense): boolean {
  return (expense.splits || []).some(split =>
    (Number(split.paidAmount) || 0) > 0 ||
    (Number(split.manualPaidAmount) || 0) > 0 ||
    (Number(split.repaymentPaidAmount) || 0) > 0 ||
    !!split.repaymentAllocations?.length ||
    !!split.owedByMe,
  );
}

export function getSetting(key: string, defaultValue: string = ''): string {
  try {
    const db = getDatabase();
    const result = db.execute(GET_SETTING_SQL, [key]);
    return result.rows?._array?.[0]?.value ?? defaultValue;
  } catch (e) {
    console.error('Failed to get setting', e);
    return defaultValue;
  }
}

export function setSetting(key: string, value: string): void {
  try {
    const db = getDatabase();
    db.execute(SET_SETTING_SQL, [key, value]);
  } catch (e) {
    console.error('Failed to set setting', e);
  }
}

function mapRows(rows: any[]): Expense[] {
  return rows.map(row => {
    let splits;
    if (row.splits) {
      try {
        splits = JSON.parse(row.splits);
      } catch (e) {
        console.error('Failed to parse splits JSON', e);
      }
    }

    let tags: string[] | undefined = undefined;
    if (row.tags) {
      try {
        tags = JSON.parse(row.tags);
      } catch (e) {
        console.error('Failed to parse tags JSON', e);
      }
    }

    let location: TransactionLocation | undefined = undefined;
    if (row.location) {
      try {
        location = JSON.parse(row.location);
      } catch (e) {
        console.error('Failed to parse location JSON', e);
      }
    }

    return {
      id: row.id,
      amount: Number(row.amount) || 0,
      merchant: row.merchant,
      alias: row.alias,
      category: row.category as Category,
      confidence: row.confidence,
      timestamp: row.timestamp,
      source: row.source,
      rawMessage: row.raw_message,
      transactionType: row.transaction_type || 'debit',
      account: row.account,
      bank: row.bank,
      paymentMode: row.payment_mode,
      isDuplicate: row.is_duplicate === 1,
      availableBalance:
        row.available_balance !== null && row.available_balance !== undefined
          ? Number(row.available_balance)
          : undefined,
      splits: splits,
      referenceId: row.reference_id || undefined,
      transactionId: row.reference_id || undefined,
      tags,
      notes: row.notes || undefined,
      billImageUri: row.bill_image_uri || undefined,
      location,
      isInvalid: row.is_invalid === 1,
      trashReason: row.trash_reason || undefined,
    };
  });
}

function mapDedupRows(rows: any[]): DedupRecord[] {
  return mapRows(rows).map(expense => ({
    id: expense.id,
    amount: expense.amount,
    merchant: expense.merchant,
    transactionType: expense.transactionType,
    timestamp: expense.timestamp,
    source: expense.source,
    referenceId: expense.referenceId,
    rawMessage: expense.rawMessage,
    isInvalid: expense.isInvalid,
    isDuplicate: expense.isDuplicate,
  }));
}
