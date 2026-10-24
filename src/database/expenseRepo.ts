import { Expense, Category } from '../types/expense';
import { getDatabase } from './db';
import { telemetry } from '../services/telemetryService';

// ==========================================
// Centralized Database SQL Command Constants
// ==========================================

export const INSERT_EXPENSE_SQL = `
  INSERT INTO expenses (
    amount, merchant, alias, category, confidence, timestamp, source, 
    raw_message, transaction_type, account, bank, payment_mode, 
    is_duplicate, available_balance, splits, reference_id, is_invalid, trash_reason
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export const UPDATE_EXPENSE_WITH_AMOUNT_SQL = `
  UPDATE expenses 
  SET merchant = ?, category = ?, bank = ?, payment_mode = ?, amount = ?, splits = ?, transaction_type = COALESCE(?, transaction_type)
  WHERE id = ?
`;

export const UPDATE_EXPENSE_SQL = `
  UPDATE expenses 
  SET merchant = ?, category = ?, bank = ?, payment_mode = ?, splits = ?, transaction_type = COALESCE(?, transaction_type)
  WHERE id = ?
`;

export const GET_RECENT_EXPENSES_SQL = `
  SELECT * FROM expenses WHERE timestamp > ? ORDER BY timestamp DESC
`;

export const SELECT_EXPENSE_BY_REF_SQL = `
  SELECT id FROM expenses WHERE reference_id = ?
`;

export const SELECT_EXPENSE_BY_RAW_SQL = `
  SELECT id FROM expenses WHERE raw_message = ? AND is_duplicate = 0 AND is_invalid = 0
`;

export const SELECT_EXPENSE_DEDUP_WINDOW_SQL = `
  SELECT id FROM expenses 
  WHERE amount = ? AND timestamp >= ? AND timestamp <= ? AND is_duplicate = 0 AND is_invalid = 0
`;

export const GET_ALL_EXPENSES_SQL = `
  SELECT * FROM expenses WHERE is_duplicate = 0 ORDER BY timestamp DESC LIMIT ? OFFSET ?
`;

export const GET_WINDOWED_EXPENSES_SQL = `
  SELECT * FROM expenses WHERE is_duplicate = 0 AND timestamp >= ? ORDER BY timestamp DESC
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
      const splitsStr = expense.splits ? JSON.stringify(expense.splits) : null;
      const result = db.execute(INSERT_EXPENSE_SQL, [
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
        splitsStr,
        expense.referenceId || null,
        expense.isInvalid ? 1 : 0,
        expense.trashReason || null,
      ]);
      return result.insertId ?? -1;
    }
  );
}

export function updateExpense(
  id: number,
  merchant: string,
  category: Category,
  bank?: string,
  paymentMode?: string,
  amount?: number,
  splits?: any[],
  transactionType?: 'debit' | 'credit',
): void {
  const db = getDatabase();
  const splitsStr = splits ? JSON.stringify(splits) : null;

  if (amount !== undefined) {
    db.execute(UPDATE_EXPENSE_WITH_AMOUNT_SQL, [
      merchant,
      category,
      bank || null,
      paymentMode || 'unknown',
      amount,
      splitsStr,
      transactionType || null,
      id,
    ]);
  } else {
    db.execute(UPDATE_EXPENSE_SQL, [
      merchant,
      category,
      bank || null,
      paymentMode || 'unknown',
      splitsStr,
      transactionType || null,
      id,
    ]);
  }
}

export function getRecentExpenses(minutes: number = 5): Expense[] {
  const db = getDatabase();
  const since = Date.now() - minutes * 60 * 1000;
  const result = db.execute(GET_RECENT_EXPENSES_SQL, [since]);
  return mapRows(result.rows?._array || []);
}

export function isDuplicateTransaction(
  amount: number,
  timestamp: number,
  referenceId?: string,
  rawMessage?: string,
): boolean {
  const db = getDatabase();

  // 1. Check unique reference ID if present
  if (referenceId) {
    const result = db.execute(SELECT_EXPENSE_BY_REF_SQL, [referenceId]);
    if (result.rows && result.rows.length > 0) return true;
  }

  // 2. Check identical message body if present
  if (rawMessage) {
    const result = db.execute(SELECT_EXPENSE_BY_RAW_SQL, [rawMessage]);
    if (result.rows && result.rows.length > 0) return true;
  }

  // 3. Check identical amount within a 15-minute window to absorb live listener and manual entry timestamp drifts
  const DEDUP_WINDOW_MS = 15 * 60 * 1000;
  const result = db.execute(SELECT_EXPENSE_DEDUP_WINDOW_SQL, [
    amount,
    timestamp - DEDUP_WINDOW_MS,
    timestamp + DEDUP_WINDOW_MS,
  ]);
  return !!(result.rows && result.rows.length > 0);
}

export interface DedupCache {
  refIds: Set<string>;
  rawMessages: Set<string>;
  temporalIndex: Array<{ amount: number; timestamp: number }>;
}

/**
 * Creates an in-memory deduplication index from the local SQLite database.
 * Allows checking thousands of messages in memory in microseconds rather than
 * issuing 3 synchronous SQLite queries per message over disk.
 */
export function createDedupCache(): DedupCache {
  const db = getDatabase();
  const all = db.execute(
    'SELECT amount, timestamp, reference_id, raw_message FROM expenses WHERE is_invalid = 0',
  );
  const rows = all.rows?._array || [];
  const refIds = new Set<string>();
  const rawMessages = new Set<string>();
  const temporalIndex: Array<{ amount: number; timestamp: number }> = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.reference_id) refIds.add(String(r.reference_id).trim());
    if (r.raw_message) rawMessages.add(String(r.raw_message).trim());
    if (typeof r.amount === 'number' && typeof r.timestamp === 'number') {
      temporalIndex.push({ amount: r.amount, timestamp: r.timestamp });
    }
  }

  return { refIds, rawMessages, temporalIndex };
}

export function isDuplicateWithCache(
  cache: DedupCache,
  amount: number,
  timestamp: number,
  referenceId?: string,
  rawMessage?: string,
): boolean {
  if (referenceId && cache.refIds.has(String(referenceId).trim())) {
    return true;
  }
  if (rawMessage && cache.rawMessages.has(String(rawMessage).trim())) {
    return true;
  }

  const DEDUP_WINDOW_MS = 15 * 60 * 1000;
  const minTs = timestamp - DEDUP_WINDOW_MS;
  const maxTs = timestamp + DEDUP_WINDOW_MS;

  for (let i = 0; i < cache.temporalIndex.length; i++) {
    const item = cache.temporalIndex[i];
    if (item.amount === amount && item.timestamp >= minTs && item.timestamp <= maxTs) {
      return true;
    }
  }

  return false;
}

export function addToDedupCache(
  cache: DedupCache,
  amount: number,
  timestamp: number,
  referenceId?: string,
  rawMessage?: string,
): void {
  if (referenceId) cache.refIds.add(String(referenceId).trim());
  if (rawMessage) cache.rawMessages.add(String(rawMessage).trim());
  cache.temporalIndex.push({ amount, timestamp });
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

export function clearAllExpenses(): void {
  const db = getDatabase();
  db.execute(CLEAR_ALL_EXPENSES_SQL);
  db.execute(CLEAR_ALL_MERCHANT_CATEGORIES_SQL);
  db.execute(CLEAR_ALL_SETTINGS_SQL);
}

export function deleteExpense(id: number): void {
  const db = getDatabase();
  db.execute(DELETE_EXPENSE_SQL, [id]);
}

export function deleteTransactionsForAccount(
  bank: string,
  account: string,
): void {
  const db = getDatabase();
  db.execute(DELETE_TRANSACTIONS_FOR_ACCOUNT_SQL, [bank, account]);
}

export function invalidateExpense(id: number, isInvalid: boolean): void {
  const db = getDatabase();
  if (!isInvalid) {
    db.execute(INVALIDATE_EXPENSE_RESET_SQL, [0, id]);
  } else {
    db.execute(INVALIDATE_EXPENSE_SQL, [1, id]);
  }
}

export function updateTrashReason(id: number, reason: string | null): void {
  const db = getDatabase();
  db.execute(UPDATE_TRASH_REASON_SQL, [reason, id]);
}

export function deduplicateDatabase(): number {
  const db = getDatabase();
  const expenses = exportAllExpensesData().filter(e => !e.isInvalid);

  // Sort by timestamp asc
  expenses.sort((a, b) => a.timestamp - b.timestamp);

  let duplicateCount = 0;
  const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  // Simple scan
  for (let i = 0; i < expenses.length; i++) {
    const current = expenses[i];
    if (current.isInvalid) continue; // Already marked as dup in this loop

    for (let j = i + 1; j < expenses.length; j++) {
      const next = expenses[j];

      // Stop checking if next transaction is beyond 5 mins
      if (next.timestamp - current.timestamp > DEDUP_WINDOW_MS) {
        break;
      }

      if (next.isInvalid) continue;

      const sameAmount = current.amount === next.amount;
      const sameMerchant =
        normalizeMerchant(current.merchant) ===
        normalizeMerchant(next.merchant);
      const sameType = current.transactionType === next.transactionType;

      if (sameAmount && sameMerchant && sameType) {
        // Mark next as duplicate
        next.isInvalid = true;
        next.trashReason = 'duplicate';
        duplicateCount++;

        db.execute(
          'UPDATE expenses SET is_invalid = 1, trash_reason = ? WHERE id = ?',
          ['duplicate', next.id],
        );
      }
    }
  }

  return duplicateCount;
}

function normalizeMerchant(merchant: string): string {
  return merchant.toLowerCase().replace(/[^a-z0-9]/g, '');
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
      isInvalid: row.is_invalid === 1,
      trashReason: row.trash_reason || undefined,
    };
  });
}
