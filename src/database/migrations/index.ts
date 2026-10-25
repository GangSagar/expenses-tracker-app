import { QuickSQLiteConnection } from 'react-native-quick-sqlite';
import { createExpenseIndexes } from './002_expense_indexes';
import { migrateLegacySchema } from './001_legacy_schema_baseline';

export interface DatabaseMigration {
  version: number;
  name: string;
  up: (database: QuickSQLiteConnection) => void;
}

export const DATABASE_MIGRATIONS: DatabaseMigration[] = [
  { version: 1, name: 'legacy-schema-baseline', up: migrateLegacySchema },
  { version: 2, name: 'expense-query-indexes', up: createExpenseIndexes },
];

export function runMigrations(database: QuickSQLiteConnection): void {
  validateMigrationSequence(DATABASE_MIGRATIONS);
  const currentVersion = getDatabaseVersion(database);
  const latestVersion = DATABASE_MIGRATIONS[DATABASE_MIGRATIONS.length - 1]?.version || 0;
  if (currentVersion > latestVersion) {
    throw new Error(
      `Database schema version ${currentVersion} is newer than this app supports (${latestVersion}).`,
    );
  }

  DATABASE_MIGRATIONS.filter(migration => migration.version > currentVersion)
    .forEach(migration => applyMigration(database, migration));
}

export function validateMigrationSequence(migrations: DatabaseMigration[]): void {
  migrations.forEach((migration, index) => {
    const expectedVersion = index + 1;
    if (migration.version !== expectedVersion || !migration.name.trim()) {
      throw new Error(
        `Invalid migration sequence at position ${expectedVersion}; expected version ${expectedVersion} with a name.`,
      );
    }
  });
}

function getDatabaseVersion(database: QuickSQLiteConnection): number {
  const result = database.execute('PRAGMA user_version');
  const version = Number(result.rows?._array?.[0]?.user_version ?? 0);
  if (!Number.isInteger(version) || version < 0) {
    throw new Error(`Invalid database schema version: ${String(version)}`);
  }
  return version;
}

function applyMigration(database: QuickSQLiteConnection, migration: DatabaseMigration): void {
  database.execute('BEGIN TRANSACTION');
  try {
    migration.up(database);
    database.execute(`PRAGMA user_version = ${migration.version}`);
    database.execute('COMMIT');
  } catch (error) {
    try {
      database.execute('ROLLBACK');
    } catch {
      // Preserve the migration error as the surfaced cause.
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Database migration ${migration.version} (${migration.name}) failed: ${detail}`);
  }
}
