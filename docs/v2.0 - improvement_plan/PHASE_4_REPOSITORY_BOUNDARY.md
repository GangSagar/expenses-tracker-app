# Phase 4: Repository Boundary and Presentation Adapters

**Status: Complete.** Phase 3 established application operations for the scoped transaction workflows. Phase 4 replaced their narrow SQLite gateway with a complete repository port and closed the remaining UI/store transaction-write bypasses. Phase 2's local AI runtime is excluded from this phase.

## Implementation result

Application transaction operations now depend on the repository contract in `contracts.ts`. `SQLiteTransactionRepository` implements that contract, and `transactionDependencies.ts` is the single composition point. Zustand and screens no longer import transaction-mutating `expenseRepo` functions; account deletion, backup restore, reset, split writes, trash metadata, and dedup maintenance dispatch through repository-backed operations.

Backup restore now validates the entire payload before writing and commits append/overwrite batches atomically. Overwrite replaces expense rows only, preserving app settings and learned merchant mappings. Backup split/payment fields are copied as stored; restore never reruns parsing, deduplication, or repayment allocation. See the [implementation changelog](./IMPLEMENTATION_CHANGELOG.md#phase-4--repository-boundary-and-presentation-adapters-complete) for per-file changes and verification.

## Purpose

Make application operations depend on a stable transaction repository contract instead of importing `expenseRepo` functions. Keep SQLite SQL, row mapping, transaction control, and connection details in the database adapter. Treat Zustand and the existing screens as temporary adapters that dispatch operations and reflect results.

This phase does not redesign screens, replace Zustand, move split decision rules out of the store, unify source deduplication, or define repayment reversal history. It makes the persistence boundary explicit so those later changes do not need to add more direct database access.

## Starting point at the beginning of Phase 4

| Current path                                                                | Current boundary leak                                                                                                                                                                                                                                    | Phase 4 destination                                                                                                                                                                                                             |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live, SMS-history import, manual create, review, update, invalidate, delete | `services/transactions/transactionApplication.ts` wires application operations directly to SQLite functions through a local `TransactionWriteGateway`. The core use cases accept a gateway, but it is not the repository port in `contracts.ts`.   | Implement the complete `TransactionRepository` in SQLite and inject it into transaction application operations through one composition module. Preserve their public command/result behavior.                                 |
| Store reads and writes                                                      | `useExpenses.ts` imports `expenseRepo` for reads, backup restore, split persistence, trash reason, and database deduplication. Most scoped transaction writes delegate to Phase 3 use cases, but restore and maintenance paths still write directly. | Retain state selection and screen-facing actions in Zustand. Route persistence and maintenance through repository-backed operations. Direct read-only queries may remain in a query adapter if the final ownership is explicit. |
| JSON backup restore                                                         | `importExpenses()` optionally clears rows and then inserts each backup item independently. A failure can leave a partially restored ledger. It persists saved split values as supplied.                                                                | Add a dedicated restore operation. Preserve backup snapshot data exactly, including split `paidAmount` and `isPaid`; do not run automatic repayment planning over restored rows. Make overwrite restore all-or-nothing.     |
| Delete-all data                                                             | Settings calls `clearAllExpenses()` directly, then clears classifier state and reloads the store.                                                                                                                                                      | Route the ledger deletion through a maintenance/application operation and expose success/failure before clearing dependent in-memory state. Preserve the current UI and confirmation behavior.                                  |
| Split settle/unsettle/toggle                                                | Zustand computes split changes and calls SQLite directly.                                                                                                                                                                                                | Phase 4 routes the resulting atomic split writes through the repository boundary. Phase 5 still owns extracting settlement decisions and domain rules.                                                                          |
| Trash reason and dedup maintenance                                          | Zustand coordinates `updateTrashReason()` and `deduplicateDatabase()` repository calls.                                                                                                                                                              | Add explicit repository operations/maintenance commands and keep state refresh after persistence succeeds.                                                                                                                      |

## Approved scope and constraints

- The repository port is the only application-facing persistence contract. Application/core code must not import `expenseRepo`, `db.ts`, SQLite libraries, or SQL constants.
- `SQLiteTransactionRepository` is the concrete adapter. It owns query strings, database connection access, row-to-entity mapping, insert parameter mapping, and SQLite transactions.
- Application use cases retain responsibility for decisions and orchestration. The repository performs requested reads/writes and reports persistence success or failure; it does not decide review policy, dedup semantics, or repayment matching.
- Keep source-specific live/import dedup behavior from Phase 3. Phase 6 remains the owner of semantic unification.
- Preserve current transaction timestamps, persisted identifiers where currently supported, partial `paidAmount`, and split/repayment values. Do not reinterpret existing data during repository migration.
- Restore is a snapshot operation, not transaction ingestion. It must not invoke parser policy, dedup against live data, or re-run repayment allocation on imported historical credits.
- For overwrite restore, validate the input before opening the transaction, then delete and reinsert inside one database transaction. A failure rolls back to the pre-restore ledger. Append restore keeps its existing product choice but should still make the batch atomic; if append dedup behavior is unclear, preserve current behavior and make it explicit in tests rather than inventing a new policy.
- Overwrite replaces transaction rows only; app settings and learned merchant-category mappings are preserved because they are not part of the transaction backup snapshot.
- Split settlement calculations remain in Zustand until Phase 5. The resulting update list must use repository methods that write all affected rows atomically.
- Preserve current delete versus soft-invalidation behavior and current repayment-linked edit/delete behavior. Reversal semantics and allocation history remain Phase 5 work.
- No visual, navigation, or general UI redesign. Change only action wiring and success/failure handling required by the boundary.
- Keep database methods synchronous where necessary to preserve the current `react-native-quick-sqlite` calling model; do not introduce unrelated async storage migration.

## Target architecture

```text
Screen / native hook / Zustand adapter
                ↓ commands and typed results
Transaction application operations
                ↓ TransactionRepository port
SQLiteTransactionRepository
                ↓
          SQLite database
```

The dependency direction is one-way: transaction operations know the repository interface; the SQLite adapter implements that interface. A composition module supplies the adapter. Presentation may request reads or actions through an application/query facade but must not import database functions for transaction persistence.

## Repository contract design

Replace the minimal draft `TransactionRepository` in `src/core/transactions/contracts.ts` and the duplicate `TransactionWriteGateway` in `applicationUseCases.ts` with a cohesive port. Final method names can follow existing naming, but the contract needs these capabilities:

### Transaction operations

- Insert a transaction and return its persisted row/identifier.
- Insert a repayment credit and apply all split updates in one atomic operation.
- Update transaction fields while preserving current split edit semantics.
- Find a transaction by ID; load the recent rows needed by live duplicate checks.
- Load the unwindowed split-bearing ledger required by repayment planning.
- Invalidate/restore a transaction, update its trash reason, and hard-delete it with checked persistence results.

### Split persistence operations

- Atomically apply a set of `{ expenseId, splits }` updates.
- Keep the operation calculation-free so Phase 5 can move split rules independently.

### Backup and maintenance operations

- Export the complete transaction snapshot.
- Append or overwrite from a validated backup payload using a transaction boundary; preserve the existing backup model and split settlement fields.
- Clear all transaction rows transactionally.
- Run the existing database deduplication maintenance operation and return its count.

Prefer focused command/query interfaces over one oversized interface if the exact call inventory justifies it. Do not make repository methods responsible for application policy or UI refresh. Return typed persisted results for writes and throw/return a typed failure consistently when expected rows are not affected.

## Planned files and responsibilities

| File / area                                                                                                       | Intended change                                                                                                                       | Responsibility limit                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/core/transactions/contracts.ts`                                                                            | Define the final application-facing transaction repository port and persisted/query DTO contracts.                                    | No SQLite, React Native, Zustand, or SQL details.                                                                           |
| `src/core/transactions/applicationUseCases.ts`                                                                  | Accept repository interfaces rather than the temporary gateway; keep common transaction persistence, ordered import, and mutations.   | Keep repayment planning and decision policy where they are; do not take ownership of Phase 5 split settlement calculations. |
| `src/database/SQLiteTransactionRepository.ts` (or `src/database/repositories/SQLiteTransactionRepository.ts`) | Implement the port by adapting existing `expenseRepo` queries and atomic methods.                                                   | Own SQL, mapping, transaction boundaries, and affected-row checks.                                                          |
| `src/database/expenseRepo.ts`                                                                                   | Keep low-level SQL functions private to the adapter or narrow compatibility exports until all callers migrate.                        | Do not let application services continue using it as a second persistence API.                                              |
| `src/services/transactions/transactionApplication.ts`                                                           | Build/inject the repository and source-specific dedup adapters; retain Phase 3 entry function signatures where possible.              | No direct `expenseRepo` imports after migration.                                                                          |
| `src/services/transactions/transactionDependencies.ts` (or equivalent composition module)                       | Construct the SQLite adapter and provide it to transaction application operations.                                                    | No business rules or presentation state.                                                                                    |
| `src/services/transactions/backupTransactions.ts` (or equivalent)                                               | Validate and coordinate export/restore/reset operations through repository methods.                                                   | Restore persisted snapshots as-is; do not replay transaction parsing or repayment.                                          |
| `src/hooks/useExpenses.ts`                                                                                      | Replace direct persistence imports with application/query operations; retain selectors, loading flags, and UI-friendly state refresh. | Split decisions remain temporarily here until Phase 5, but storage calls do not.                                            |
| `src/presentation/legacy/screens/SettingsScreen.tsx`                                                            | Route clear-all and JSON restore through backup/maintenance operations; show existing UI outcomes.                                    | No direct SQL or visual changes.                                                                                            |
| `src/presentation/legacy/components/*`                                                                          | Confirm migrated components still call store/use cases only; remove any remaining direct repository write imports if found.           | Keep the legacy UI layout intact.                                                                                           |
| `src/__tests__/expenseRepo.test.ts`, repository/use-case/restore tests                                          | Cover SQLite adapter mapping, transaction rollback, boundary behavior, and state-after-success.                                       | Prefer core tests with fakes and adapter integration tests for SQL behavior.                                                |
| `docs/APP_MESSAGE_LISTENER_FLOW.md`, `docs/ARCHITECTURE.md`, this file, implementation changelog, README      | Record the final repository boundary, backup semantics, migrated files, and verification.                                             | Document actual behavior, not only target structure.                                                                        |

Before removing any compatibility repository export, use `rg` to verify all application, test, and tool callers. Keep a temporary adapter only when a real unmigrated caller remains and name the retirement condition.

## Test and verification plan

1. **Port and adapter conformance:** every required contract operation is implemented; row mapping preserves source, reference ID, invalidation state, trash reason, account/bank/payment fields, and split values.
2. **Atomic writes:** accepted credit plus split changes commit or roll back as one unit; update/delete/invalidation/reporting do not claim success if the expected database row was not affected.
3. **Historical-import repayment integration gap from Phase 3:** use the real SQLite adapter (or its transaction-level test double) to import credits in chronological order against an outstanding split older than the 30-day presentation window. Verify each credit sees prior imported writes, partial `paidAmount` accumulates correctly, and an injected failure leaves no partial write for that row.
4. **Backup snapshot round-trip:** export then restore preserves all supported fields and existing split settlement state. Prove restore does not re-run repayment matching or parser/decision policy.
5. **Overwrite rollback:** force a restore insert to fail after clearing begins and verify the database returns to its exact pre-restore state. Verify successful overwrite removes the old ledger and writes the full new snapshot atomically.
6. **Append restore:** verify the documented legacy append behavior and batch failure semantics. Do not add dedup or repayment recalculation unless a product requirement explicitly calls for it.
7. **Reset/maintenance:** clear-all runs through the boundary, and dependent classifier/store state is cleared only after successful ledger deletion. Trash reason and dedup maintenance return clear outcomes.
8. **Presentation state:** fake a repository failure for manual create, edit, delete, invalidation, restore, and split persistence. Confirm the screen/store does not report success or mutate its local ledger prematurely.
9. **Call-site audit:** `rg` confirms there are no direct SQLite/expenseRepo mutations in screens or hooks. Explicitly list read-only query calls and the Phase 5 split-rule code that remains in Zustand.
10. Run TypeScript, focused contract/adapter/use-case tests, changed-file lint, the full test suite, `git diff --check`, and Graphify refresh. Record exact counts and existing warnings.

## Rollout sequence

1. Inventory all `expenseRepo` imports and classify each as transaction write, backup/maintenance write, split write, or read-only query.
2. Finalize port methods from that inventory; avoid expanding it with speculative feature methods.
3. Implement `SQLiteTransactionRepository` using existing queries and transaction helpers; add affected-row validation and keep public behavior stable.
4. Replace the temporary gateway in `transactionApplication.ts` with injected repository dependencies. Keep service entry points stable so hooks/screens do not need simultaneous domain changes.
5. Route backup export/append/overwrite and delete-all through dedicated repository-backed operations. Make overwrite atomic and preserve snapshot split values without repayment recomputation.
6. Move trash-reason and dedup maintenance writes through the boundary.
7. Route split settlement results through repository atomic split updates while leaving the calculation and action rules in Zustand for Phase 5.
8. Replace direct write imports in hooks/screens/components. Keep state changes after successful repository-backed operations.
9. Add the imported-repayment integration test, backup restore/rollback tests, and repository failure-state tests.
10. Remove obsolete direct database exports only after `rg` confirms no callers remain; document any intentionally retained read paths.
11. Update architecture and file-by-file changelog, then hand off split decision ownership to Phase 5 and dedup unification to Phase 6.

## Exit criteria

- The complete transaction repository port has a working SQLite adapter and all Phase 3 use cases use the injected port.
- Hooks and presentation components do not call transaction-mutating `expenseRepo` functions directly.
- JSON backup restore, overwrite, export, and delete-all have explicit repository-backed operations and tested atomic/error semantics.
- Restores preserve split/payment snapshot state and never re-run automatic repayment planning.
- Split settlement decisions may remain in Zustand for Phase 5, but all resulting database writes pass through the repository boundary and are atomic.
- Read queries used by presentation are documented and routed through an explicit query/repository surface; they do not expose SQL.
- Historical import repayment is verified end-to-end with old splits, chronological credits, partial accumulation, and per-row failure atomicity.
- Phase 3's live/import source-specific dedup behavior remains unchanged; Phase 6 owns semantic unification.
- TypeScript/tests/lint/docs/changelog/Graphify pass and accurately describe the implementation.

## Handoff to Phase 5 and Phase 6

- **Phase 5:** move manual settle/unsettle/toggle and repayment allocation decisions out of Zustand; design allocation history and safe reversal for repayment-linked edits, invalidation, and deletion. The repository's atomic split-write methods are already available.
- **Phase 6:** replace the explicit live/import dedup adapters with a single approved semantic policy without changing repository boundaries.
- Backup restore remains a snapshot persistence operation and must not be routed through either the Phase 2 parser policy or Phase 3 ingestion/repayment flow.

## Post-implementation boundary audit

The Phase 4 runtime write audit found no transaction-mutating `expenseRepo` calls outside `SQLiteTransactionRepository`. Hooks and legacy screens route transaction writes, backup/reset, split persistence, account transaction deletion, and maintenance through the transaction application facade. `expenseRepo` still exports low-level operations for the adapter and its tests; those exports are not runtime bypasses, but a future dependency rule should prevent new application imports.

The following direct SQLite dependencies are outside this phase's transaction-ledger scope and remain visible follow-up work:

- Legacy screens and `securityService` call `getSetting`/`setSetting` for app preferences and security settings. These are not transaction writes, but a future settings repository/service would remove database imports from presentation and service code.
- `LearningEngine` constructs `SQLiteLearningRepository` by default, and that adapter reaches `database/db` from the parser learning package. This is a dependency-direction leak for the broader architecture; inject a learning repository at a composition boundary in a later dependency-guardrail phase.
- Phase 4 tests verify chronological imported repayments against an old split and separately verify SQLite rollback for failed repayment inserts. A focused integration test combining a failed later imported repayment with its split update would strengthen the cross-layer guarantee; no production defect was identified by this audit.

These follow-ups do not block Phase 5 split-domain work. Phase 5 still needs to move settlement decisions out of Zustand and define allocation history/reversal for edits, invalidation, and deletion. Phase 2's offline AI runtime remains independently incomplete.
