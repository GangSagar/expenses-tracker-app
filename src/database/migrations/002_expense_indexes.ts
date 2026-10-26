import { QuickSQLiteConnection } from 'react-native-quick-sqlite';

export function createExpenseIndexes(database: QuickSQLiteConnection): void {
  database.execute('CREATE INDEX IF NOT EXISTS idx_expenses_timestamp ON expenses(timestamp)');
  database.execute('CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category)');
  database.execute('CREATE INDEX IF NOT EXISTS idx_expenses_merchant ON expenses(merchant)');
  database.execute('CREATE INDEX IF NOT EXISTS idx_expenses_reference_id ON expenses(reference_id)');
}
