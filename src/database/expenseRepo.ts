import { Expense, Category } from '../types/expense';
import { getDatabase } from './db';

export function insertExpense(expense: Omit<Expense, 'id'>): number {
  const db = getDatabase();
  const splitsStr = expense.splits ? JSON.stringify(expense.splits) : null;
  const result = db.execute(
    `INSERT INTO expenses (amount, merchant, alias, category, confidence, timestamp, source, raw_message, transaction_type, account, bank, payment_mode, is_duplicate, available_balance, splits, reference_id, is_invalid, trash_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
    ],
  );
  return result.insertId ?? -1;
}

export function updateExpense(
  id: number,
  merchant: string,
  category: Category,
  bank?: string,
  paymentMode?: string,
  amount?: number,
  splits?: any[],
): void {
  const db = getDatabase();
  const splitsStr = splits ? JSON.stringify(splits) : null;
  
  if (amount !== undefined) {
    db.execute(
      `UPDATE expenses 
       SET merchant = ?, category = ?, bank = ?, payment_mode = ?, amount = ?, splits = ? 
       WHERE id = ?`,
      [merchant, category, bank || null, paymentMode || 'unknown', amount, splitsStr, id],
    );
  } else {
    db.execute(
      `UPDATE expenses 
       SET merchant = ?, category = ?, bank = ?, payment_mode = ?, splits = ? 
       WHERE id = ?`,
      [merchant, category, bank || null, paymentMode || 'unknown', splitsStr, id],
    );
  }
}

export function getRecentExpenses(minutes: number = 5): Expense[] {
  const db = getDatabase();
  const since = Date.now() - minutes * 60 * 1000;
  const result = db.execute(
    'SELECT * FROM expenses WHERE timestamp > ? ORDER BY timestamp DESC',
    [since],
  );
  return mapRows(result.rows?._array || []);
}

export function isDuplicateTransaction(
  amount: number,
  timestamp: number,
  referenceId?: string,
): boolean {
  const db = getDatabase();
  if (referenceId) {
    const result = db.execute(
      'SELECT id FROM expenses WHERE reference_id = ? AND is_invalid = 0',
      [referenceId],
    );
    if (result.rows && result.rows.length > 0) return true;
  }
  
  const result = db.execute(
    'SELECT id FROM expenses WHERE timestamp = ? AND amount = ? AND is_invalid = 0',
    [timestamp, amount],
  );
  return !!(result.rows && result.rows.length > 0);
}

export function getAllExpenses(
  limit: number = 50,
  offset: number = 0,
): Expense[] {
  const db = getDatabase();
  const result = db.execute(
    'SELECT * FROM expenses WHERE is_duplicate = 0 ORDER BY timestamp DESC LIMIT ? OFFSET ?',
    [limit, offset],
  );
  return mapRows(result.rows?._array || []);
}

export function getExpensesByCategory(category: Category): Expense[] {
  const db = getDatabase();
  const result = db.execute(
    'SELECT * FROM expenses WHERE category = ? AND is_duplicate = 0 ORDER BY timestamp DESC',
    [category],
  );
  return mapRows(result.rows?._array || []);
}

export function getMonthlyTotal(year: number, month: number): number {
  const db = getDatabase();
  const startDate = new Date(year, month - 1, 1).getTime();
  const endDate = new Date(year, month, 1).getTime();
  const result = db.execute(
    `SELECT COALESCE(SUM(amount), 0) as total FROM expenses
     WHERE timestamp >= ? AND timestamp < ? AND transaction_type = 'debit' AND is_duplicate = 0`,
    [startDate, endDate],
  );
  return result.rows?._array?.[0]?.total || 0;
}

export function saveMerchantCategory(
  merchantAlias: string,
  category: Category,
  displayName?: string,
): void {
  const db = getDatabase();
  db.execute(
    'INSERT OR REPLACE INTO merchant_categories (merchant, category, display_name) VALUES (?, ?, ?)',
    [merchantAlias.toLowerCase().trim(), category, displayName || null],
  );
}

export function loadMerchantCategories(): Record<string, { category: Category, displayName?: string }> {
  const db = getDatabase();
  const result = db.execute('SELECT * FROM merchant_categories');
  const map: Record<string, { category: Category, displayName?: string }> = {};
  const rows = result.rows?._array || [];
  for (const row of rows) {
    map[row.merchant] = { 
      category: row.category as Category, 
      displayName: row.display_name || undefined 
    };
  }
  return map;
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
      availableBalance: row.available_balance !== null && row.available_balance !== undefined ? Number(row.available_balance) : undefined,
      splits: splits,
      referenceId: row.reference_id || undefined,
      isInvalid: row.is_invalid === 1,
      trashReason: row.trash_reason || undefined,
    };
  });
}

export function exportAllExpensesData(): Expense[] {
  const db = getDatabase();
  const result = db.execute('SELECT * FROM expenses ORDER BY timestamp DESC');
  return mapRows(result.rows?._array || []);
}

export function clearAllExpenses(): void {
  const db = getDatabase();
  db.execute('DELETE FROM expenses');
  db.execute('DELETE FROM merchant_categories');
  db.execute("DELETE FROM settings WHERE key LIKE 'account_type::%' OR key = 'ignored_anomalies' OR key = 'spam_ai_model'");
}

export function deleteExpense(id: number): void {
  const db = getDatabase();
  db.execute('DELETE FROM expenses WHERE id = ?', [id]);
}

export function invalidateExpense(id: number, isInvalid: boolean): void {
  const db = getDatabase();
  if (!isInvalid) {
    db.execute('UPDATE expenses SET is_invalid = ?, trash_reason = NULL WHERE id = ?', [0, id]);
  } else {
    db.execute('UPDATE expenses SET is_invalid = ? WHERE id = ?', [1, id]);
  }
}

export function updateTrashReason(id: number, reason: string | null): void {
  const db = getDatabase();
  db.execute('UPDATE expenses SET trash_reason = ? WHERE id = ?', [reason, id]);
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
      const sameMerchant = normalizeMerchant(current.merchant) === normalizeMerchant(next.merchant);
      const sameType = current.transactionType === next.transactionType;
      
      if (sameAmount && sameMerchant && sameType) {
        // Mark next as duplicate
        next.isInvalid = true;
        next.trashReason = 'duplicate';
        duplicateCount++;
        
        db.execute(
          'UPDATE expenses SET is_invalid = 1, trash_reason = ? WHERE id = ?',
          ['duplicate', next.id]
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
    const result = db.execute('SELECT value FROM settings WHERE key = ?', [key]);
    return result.rows?._array?.[0]?.value ?? defaultValue;
  } catch (e) {
    console.error('Failed to get setting', e);
    return defaultValue;
  }
}

export function setSetting(key: string, value: string): void {
  try {
    const db = getDatabase();
    db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  } catch (e) {
    console.error('Failed to set setting', e);
  }
}
