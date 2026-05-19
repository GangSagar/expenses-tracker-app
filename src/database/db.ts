import { open, QuickSQLiteConnection } from 'react-native-quick-sqlite';
import { loadMerchantCategories } from './expenseRepo';
import { initMerchantMap } from '../core/classifier/merchantMap';

export const DB_NAME = 'expense_tracker.db';

// SQL Statement Constants
export const AUTO_RESTORE_BANK_ALERT_SPAM_SQL = `
  UPDATE expenses 
  SET is_invalid = 0, trash_reason = NULL 
  WHERE bank IS NOT NULL AND account IS NOT NULL AND trash_reason = 'spam'
`;

export const CREATE_EXPENSES_TABLE_SQL = `
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
    available_balance REAL,
    splits TEXT,
    reference_id TEXT,
    is_invalid INTEGER DEFAULT 0,
    trash_reason TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
`;

export const CREATE_MERCHANT_CATEGORIES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS merchant_categories (
    merchant TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    display_name TEXT
  );
`;

export const CREATE_SETTINGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`;

export const CREATE_CLASSIFIER_STATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS classifier_state (
    key TEXT PRIMARY KEY,
    model_json TEXT NOT NULL
  );
`;

let db: QuickSQLiteConnection | null = null;

export function getDatabase(): QuickSQLiteConnection {
  if (!db) {
    db = open({ name: DB_NAME });
    runMigrations(db);

    // Load saved merchants into memory
    const savedMerchants = loadMerchantCategories();
    initMerchantMap(savedMerchants);

    // Auto-restore any valid bank transactions that were false-positively marked as spam
    try {
      db.execute(AUTO_RESTORE_BANK_ALERT_SPAM_SQL);
    } catch (e) {
      console.error('Failed to auto-restore bank transactions', e);
    }
  }
  return db;
}

function runMigrations(database: QuickSQLiteConnection): void {
  database.execute(CREATE_EXPENSES_TABLE_SQL);

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

  // Merchant category corrections table
  database.execute(CREATE_MERCHANT_CATEGORIES_TABLE_SQL);

  // Migration for v1.0.3: Add display_name to merchant_categories
  try {
    database.execute(
      'ALTER TABLE merchant_categories ADD COLUMN display_name TEXT;',
    );
  } catch {
    // Column might already exist
  }

  // Create settings table for persistence
  database.execute(CREATE_SETTINGS_TABLE_SQL);

  // Migration for v1.5.0: Add classifier_state table for BayesClassifier persistence
  database.execute(CREATE_CLASSIFIER_STATE_TABLE_SQL);

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
    database.execute(
      'ALTER TABLE expenses ADD COLUMN is_invalid INTEGER DEFAULT 0;',
    );
  } catch {
    // Column might already exist
  }

  // Migration for v1.0.7: Add trash_reason column to expenses
  try {
    database.execute('ALTER TABLE expenses ADD COLUMN trash_reason TEXT;');
  } catch {
    // Column might already exist
  }

  // Create fast lookup indices on expenses table
  database.execute(
    'CREATE INDEX IF NOT EXISTS idx_expenses_timestamp ON expenses(timestamp);',
  );
  database.execute(
    'CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);',
  );
  database.execute(
    'CREATE INDEX IF NOT EXISTS idx_expenses_merchant ON expenses(merchant);',
  );
  database.execute(
    'CREATE INDEX IF NOT EXISTS idx_expenses_reference_id ON expenses(reference_id);',
  );
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
