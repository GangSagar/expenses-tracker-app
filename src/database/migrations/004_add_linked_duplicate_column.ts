import { QuickSQLiteConnection } from 'react-native-quick-sqlite';

export function addLinkedDuplicateColumn(database: QuickSQLiteConnection): void {
  const result = database.execute('PRAGMA table_info(expenses)');
  const existingColumns = new Set(
    (result.rows?._array || []).map((col: any) => String(col.name).toLowerCase()),
  );

  if (!existingColumns.has('linked_to_id')) {
    database.execute('ALTER TABLE expenses ADD COLUMN linked_to_id INTEGER DEFAULT NULL');
  }

  database.execute(
    'CREATE INDEX IF NOT EXISTS idx_expenses_linked_to_id ON expenses(linked_to_id)',
  );
}

