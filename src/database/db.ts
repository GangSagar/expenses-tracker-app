import { open, QuickSQLiteConnection } from 'react-native-quick-sqlite';
import { loadMerchantCategories } from './expenseRepo';
import { initMerchantMap } from '../core/classifier/merchantMap';
import { runMigrations } from './migrations';
import {
  CREATE_CLASSIFIER_STATE_TABLE_SQL,
  CREATE_EXPENSES_TABLE_SQL,
  CREATE_MERCHANT_CATEGORIES_TABLE_SQL,
  CREATE_SETTINGS_TABLE_SQL,
} from './schema';

export {
  CREATE_CLASSIFIER_STATE_TABLE_SQL,
  CREATE_EXPENSES_TABLE_SQL,
  CREATE_MERCHANT_CATEGORIES_TABLE_SQL,
  CREATE_SETTINGS_TABLE_SQL,
};

export const DB_NAME = 'expense_tracker.db';

// SQL Statement Constants
export const AUTO_RESTORE_BANK_ALERT_SPAM_SQL = `
  UPDATE expenses 
  SET is_invalid = 0, trash_reason = NULL 
  WHERE bank IS NOT NULL AND account IS NOT NULL AND trash_reason = 'spam'
`;

let db: QuickSQLiteConnection | null = null;

export function getDatabase(): QuickSQLiteConnection {
  if (!db) {
    const connection = open({ name: DB_NAME });
    try {
      runMigrations(connection);
      db = connection;

      // Load saved merchants into memory after schema migrations complete.
      const savedMerchants = loadMerchantCategories();
      initMerchantMap(savedMerchants);

      // Auto-restore any valid bank transactions that were false-positively marked as spam.
      try {
        db.execute(AUTO_RESTORE_BANK_ALERT_SPAM_SQL);
      } catch (error) {
        console.error('Failed to auto-restore bank transactions', error);
      }
    } catch (error) {
      db = null;
      try {
        connection.close();
      } catch {
        // Preserve the initialization/migration error as the surfaced cause.
      }
      throw error;
    }
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
