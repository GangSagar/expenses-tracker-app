import { QuickSQLiteConnection } from 'react-native-quick-sqlite';
import {
  CREATE_CLASSIFIER_STATE_TABLE_SQL,
  CREATE_EXPENSES_TABLE_SQL,
  CREATE_MERCHANT_CATEGORIES_TABLE_SQL,
  CREATE_SETTINGS_TABLE_SQL,
} from '../schema';

const REQUIRED_LEGACY_EXPENSE_COLUMNS = [
  'id', 'amount', 'merchant', 'category', 'confidence', 'timestamp', 'source',
  'raw_message', 'transaction_type', 'account', 'payment_mode', 'is_duplicate',
];

const ADDITIVE_EXPENSE_COLUMNS: Array<[string, string]> = [
  ['bank', 'TEXT'],
  ['alias', 'TEXT'],
  ['available_balance', 'REAL'],
  ['splits', 'TEXT'],
  ['reference_id', 'TEXT'],
  ['is_invalid', 'INTEGER DEFAULT 0'],
  ['trash_reason', 'TEXT'],
  ['created_at', 'INTEGER'],
];

export function migrateLegacySchema(database: QuickSQLiteConnection): void {
  database.execute(CREATE_EXPENSES_TABLE_SQL);
  const expenseColumns = getColumnNames(database, 'expenses');
  const missingRequired = REQUIRED_LEGACY_EXPENSE_COLUMNS.filter(column => !expenseColumns.has(column));
  if (missingRequired.length > 0) {
    throw new Error(
      `Unsupported expenses schema; required columns are missing: ${missingRequired.join(', ')}`,
    );
  }
  ADDITIVE_EXPENSE_COLUMNS.forEach(([column, definition]) => {
    if (!expenseColumns.has(column)) {
      database.execute(`ALTER TABLE expenses ADD COLUMN ${column} ${definition}`);
    }
  });

  database.execute(CREATE_MERCHANT_CATEGORIES_TABLE_SQL);
  const merchantColumns = getColumnNames(database, 'merchant_categories');
  if (!merchantColumns.has('display_name')) {
    database.execute('ALTER TABLE merchant_categories ADD COLUMN display_name TEXT');
  }
  database.execute(CREATE_SETTINGS_TABLE_SQL);
  database.execute(CREATE_CLASSIFIER_STATE_TABLE_SQL);
}

function getColumnNames(database: QuickSQLiteConnection, table: string): Set<string> {
  const result = database.execute(`PRAGMA table_info(${table})`);
  return new Set((result.rows?._array || []).map(column => String(column.name)));
}
