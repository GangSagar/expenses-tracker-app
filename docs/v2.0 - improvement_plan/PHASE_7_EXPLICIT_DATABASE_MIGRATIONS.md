# Phase 7: Explicit Database Migrations

**Status: Complete.** Database initialization now uses ordered, versioned SQLite migrations instead of catch-and-ignore column alterations.

## Scope and compatibility decision

The app previously had no schema version. Phase 7 treats that unversioned database as version 0, representing the schema family created by the existing startup code. The migration adds known optional fields and support tables without deleting or rewriting transaction rows.

The legacy migration validates the core `expenses` columns the app depends on. If they are missing, startup fails with the missing column names; the app does not guess how to transform an unknown database. A database with a future `user_version` also fails clearly and remains untouched.

Legacy installs missing `created_at` receive a nullable column. SQLite cannot add the fresh-install time-expression default to a populated table with `ALTER TABLE`; the app does not currently read this field.

## Migration sequence

| Version | Name | Behavior |
|---|---|---|
| 1 | `legacy-schema-baseline` | Create absent tables, verify required expense columns, add known optional expense columns, and ensure merchant category, settings, and classifier state tables exist. |
| 2 | `expense-query-indexes` | Create timestamp, category, merchant, and reference ID indexes. |

Each migration runs in its own SQLite transaction. The `user_version` is updated inside that transaction and committed with the schema changes. A failure rolls back the migration and leaves that version available for retry. Future schema changes should append a migration; do not edit an already released migration.

## Implementation files

- `src/database/schema.ts` owns canonical table creation SQL.
- `src/database/migrations/001_legacy_schema_baseline.ts` adopts the known legacy schema safely.
- `src/database/migrations/002_expense_indexes.ts` owns the separately versioned indexes.
- `src/database/migrations/index.ts` orders and transactionally applies migrations.
- `src/database/db.ts` runs migrations before exposing the connection or loading app data.
- `src/__tests__/databaseMigrations.test.ts` covers fresh databases, legacy upgrades, rollback/retry state, unsupported legacy schemas, and newer schema versions.

## Verification

- `npx tsc --noEmit` — passed.
- `npx jest --runInBand` — passed (33 suites, 674 tests), including six migration cases.
- ESLint on the migration implementation and tests — passed with no errors.
- `git diff --check` — passed.
- A one-off Node SQLite in-memory smoke check migrated a populated legacy database to version 2, preserved its transaction row, and verified all four indexes.
- Graphify code graph refreshed and reclustered (1,562 nodes, 3,255 edges, 108 communities). Semantic extraction of changed Markdown files failed because the Gemini backend returned a connection error, so Graphify may still surface stale phase-status text.
