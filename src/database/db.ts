import { open, QuickSQLiteConnection } from 'react-native-quick-sqlite';

let db: QuickSQLiteConnection | null = null;

import { loadMerchantCategories } from './expenseRepo';
import { initMerchantMap } from '../core/classifier/merchantMap';

export function getDatabase(): QuickSQLiteConnection {
  if (!db) {
    db = open({ name: 'expense_tracker.db' });
    runMigrations(db);
    
    // Load saved merchants into memory
    const savedMerchants = loadMerchantCategories();
    initMerchantMap(savedMerchants);
  }
  return db;
}

function runMigrations(database: QuickSQLiteConnection): void {
  database.execute(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      merchant TEXT,
      alias TEXT,
      category TEXT,
      confidence REAL,
      timestamp INTEGER NOT NULL,
      source TEXT NOT NULL,
      raw_message TEXT NOT NULL,
      transaction_type TEXT NOT NULL DEFAULT 'debit',
      account TEXT,
      bank TEXT,
      payment_mode TEXT DEFAULT 'unknown',
      is_duplicate INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);

  // Migration for v1.0.1: Add bank column to existing DB
  try {
    database.execute('ALTER TABLE expenses ADD COLUMN bank TEXT;');
  } catch {
    // Column might already exist
  }

  // Migration for v1.0.3: Add alias column to expenses
  try {
    database.execute('ALTER TABLE expenses ADD COLUMN alias TEXT;');
  } catch {
    // Column might already exist
  }

  database.execute(
    'CREATE INDEX IF NOT EXISTS idx_expenses_timestamp ON expenses(timestamp);',
  );
  database.execute(
    'CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);',
  );
  database.execute(
    'CREATE INDEX IF NOT EXISTS idx_expenses_merchant ON expenses(merchant);',
  );

  // Merchant category corrections table
  database.execute(`
    CREATE TABLE IF NOT EXISTS merchant_categories (
      merchant TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      display_name TEXT
    );
  `);

  // Migration for v1.0.3: Add display_name to merchant_categories
  try {
    database.execute('ALTER TABLE merchant_categories ADD COLUMN display_name TEXT;');
  } catch {
    // Column might already exist
  }

  // Create settings table for persistence (e.g., notes/scratchpad)
  database.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Migration for v1.0.4: Add available_balance column to expenses
  try {
    database.execute('ALTER TABLE expenses ADD COLUMN available_balance REAL;');
  } catch {
    // Column might already exist
  }

  // Migration for v1.0.5: Add splits column to expenses
  try {
    database.execute('ALTER TABLE expenses ADD COLUMN splits TEXT;');
  } catch {
    // Column might already exist
  }

  // Migration for v1.0.6: Add reference_id column to expenses
  try {
    database.execute('ALTER TABLE expenses ADD COLUMN reference_id TEXT;');
  } catch {
    // Column might already exist
  }

  // Migration for v1.0.6: Add is_invalid column to expenses
  try {
    database.execute('ALTER TABLE expenses ADD COLUMN is_invalid INTEGER DEFAULT 0;');
  } catch {
    // Column might already exist
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
