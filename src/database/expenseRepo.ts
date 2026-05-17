import { Expense, Category } from '../types/expense';
import { getDatabase } from './db';

export function insertExpense(expense: Omit<Expense, 'id'>): number {
  const db = getDatabase();
  const splitsStr = expense.splits ? JSON.stringify(expense.splits) : null;
  const result = db.execute(
    `INSERT INTO expenses (amount, merchant, alias, category, confidence, timestamp, source, raw_message, transaction_type, account, bank, payment_mode, is_duplicate, available_balance, splits)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    let splits = undefined;
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
}

export function deleteExpense(id: number): void {
  const db = getDatabase();
  db.execute('DELETE FROM expenses WHERE id = ?', [id]);
}
