import { QuickSQLiteConnection } from 'react-native-quick-sqlite';
import { DATABASE_MIGRATIONS, runMigrations } from '../database/migrations';

type FakeDatabase = QuickSQLiteConnection & {
  version: number;
  tables: Map<string, Set<string>>;
  statements: string[];
};

function fakeDatabase(
  version = 0,
  tables: Record<string, string[]> = {},
  failWhen?: (sql: string) => boolean,
): FakeDatabase {
  const state: FakeDatabase = {
    version,
    tables: new Map(Object.entries(tables).map(([table, columns]) => [table, new Set(columns)])),
    statements: [],
    close: jest.fn(),
    delete: jest.fn(),
    attach: jest.fn(),
    detach: jest.fn(),
    transaction: jest.fn() as any,
    execute: jest.fn((sql: string) => {
      state.statements.push(sql);
      if (failWhen?.(sql)) throw new Error('injected SQL failure');

      if (sql === 'PRAGMA user_version') {
        return { rowsAffected: 0, rows: { _array: [{ user_version: state.version }] } };
      }
      const setVersion = sql.match(/^PRAGMA user_version = (\d+)$/);
      if (setVersion) {
        state.version = Number(setVersion[1]);
        return { rowsAffected: 0 };
      }
      const createTable = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
      if (createTable) {
        const columnText = sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(')'));
        const columns = columnText.split(',').map(line => line.trim().split(/\s+/)[0])
          .filter(column => /^[a-z_]+$/i.test(column));
        if (!state.tables.has(createTable[1])) state.tables.set(createTable[1], new Set(columns));
      }
      const tableInfo = sql.match(/^PRAGMA table_info\((\w+)\)$/);
      if (tableInfo) {
        const columns = Array.from(state.tables.get(tableInfo[1]) || []);
        return { rowsAffected: 0, rows: { _array: columns.map(name => ({ name })) } };
      }
      const addColumn = sql.match(/^ALTER TABLE (\w+) ADD COLUMN (\w+)/);
      if (addColumn) state.tables.get(addColumn[1])?.add(addColumn[2]);
      return { rowsAffected: 0 };
    }) as any,
    executeAsync: jest.fn() as any,
    executeBatch: jest.fn() as any,
    executeBatchAsync: jest.fn() as any,
    loadFile: jest.fn() as any,
    loadFileAsync: jest.fn() as any,
  };
  return state;
}

const LEGACY_EXPENSE_COLUMNS = [
  'id', 'amount', 'merchant', 'category', 'confidence', 'timestamp', 'source',
  'raw_message', 'transaction_type', 'account', 'payment_mode', 'is_duplicate',
];

describe('versioned database migrations', () => {
  it('creates the fresh schema and advances through ordered migrations', () => {
    const database = fakeDatabase();

    runMigrations(database);

    expect(database.version).toBe(2);
    expect(database.statements.filter(sql => sql === 'BEGIN TRANSACTION')).toHaveLength(2);
    expect(database.statements.filter(sql => sql === 'COMMIT')).toHaveLength(2);
    expect(Array.from(database.tables.get('expenses') || [])).toEqual(expect.arrayContaining([
      ...LEGACY_EXPENSE_COLUMNS, 'bank', 'alias', 'splits', 'reference_id', 'is_invalid',
    ]));
    expect(database.statements.some(sql => sql.includes('idx_expenses_reference_id'))).toBe(true);
  });

  it('adopts a legacy unversioned schema additively and preserves stored rows', () => {
    const database = fakeDatabase(0, {
      expenses: LEGACY_EXPENSE_COLUMNS,
      merchant_categories: ['merchant', 'category'],
    });

    runMigrations(database);

    expect(database.version).toBe(2);
    expect(Array.from(database.tables.get('expenses') || [])).toEqual(expect.arrayContaining([
      ...LEGACY_EXPENSE_COLUMNS, 'bank', 'alias', 'available_balance', 'splits',
      'reference_id', 'is_invalid', 'trash_reason', 'created_at',
    ]));
    expect(database.tables.get('merchant_categories')?.has('display_name')).toBe(true);
    expect(database.statements.some(sql => /\b(DROP|DELETE|INSERT)\b/i.test(sql))).toBe(false);
  });

  it('rolls back a failed migration and leaves its version retryable', () => {
    const database = fakeDatabase(0, {}, sql => sql.includes('idx_expenses_category'));

    expect(() => runMigrations(database)).toThrow(/migration 2 .*injected SQL failure/i);
    expect(database.version).toBe(1);
    expect(database.statements).toContain('ROLLBACK');
    expect(database.statements.filter(sql => sql === 'COMMIT')).toHaveLength(1);
  });

  it('fails clearly on a legacy schema missing required core columns', () => {
    const database = fakeDatabase(0, { expenses: ['id', 'amount'] });

    expect(() => runMigrations(database)).toThrow(/unsupported expenses schema.*timestamp.*source/i);
    expect(database.version).toBe(0);
    expect(database.statements).toContain('ROLLBACK');
  });

  it('refuses a database created by a newer app without changing it', () => {
    const latestVersion = DATABASE_MIGRATIONS[DATABASE_MIGRATIONS.length - 1].version;
    const database = fakeDatabase(latestVersion + 1);

    expect(() => runMigrations(database)).toThrow(/newer than this app supports/i);
    expect(database.statements).toEqual(['PRAGMA user_version']);
  });
});
