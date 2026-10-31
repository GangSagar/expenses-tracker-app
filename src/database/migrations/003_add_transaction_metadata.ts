import { QuickSQLiteConnection } from 'react-native-quick-sqlite';

export function addTransactionMetadataColumns(database: QuickSQLiteConnection): void {
  const result = database.execute('PRAGMA table_info(expenses)');
  const existingColumns = new Set(
    (result.rows?._array || []).map((col: any) => String(col.name).toLowerCase()),
  );

  const columnsToAdd: [string, string][] = [
    ['tags', 'TEXT'],
    ['notes', 'TEXT'],
    ['bill_image_uri', 'TEXT'],
    ['location', 'TEXT'],
  ];

  for (const [colName, colType] of columnsToAdd) {
    if (!existingColumns.has(colName.toLowerCase())) {
      database.execute(`ALTER TABLE expenses ADD COLUMN ${colName} ${colType}`);
    }
  }
}

