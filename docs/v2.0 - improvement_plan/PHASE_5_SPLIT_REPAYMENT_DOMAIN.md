# Phase 5: Split Settlement and Repayment Domain

**Status: Complete.** Phase 4 moved transaction writes behind the repository boundary. Phase 5 moved split decisions and repayment allocation out of Zustand while preserving the existing UI and supported partial payments.

## Implementation result

Split rows now carry stable `splitId` values and separate manual and repayment-paid components. New automatic repayment summaries record exact destination expense/split IDs and amounts. Core use cases own manual settle/unsettle/toggle and repayment edit/invalidate/restore/delete decisions; SQLite atomically applies linked transaction and debt-split changes. The approved legacy policy is active: older summary-only repayment rows remain unchanged and their edit/invalidation/deletion is blocked with a reconciliation message. Backup restore remaps allocation transaction IDs to the new SQLite IDs.

The [implementation changelog](./IMPLEMENTATION_CHANGELOG.md#phase-5--split-and-repayment-domain-complete) contains the file-by-file record and verification.

## Goal

Make split settlement independently testable and keep every balance change consistent with its transaction history. The domain/application layer owns automatic repayment allocation, manual settle/unsettle/toggle, and repayment-linked transaction mutation behavior. Zustand dispatches commands and refreshes state only after persistence succeeds.

## Implemented domain boundary

- `repaymentPlanner.ts` is a pure FIFO planner. It supports partial payment of the oldest eligible split and returns exact destination updates.
- `applicationUseCases.ts` owns repayment planning/reversal, manual settle/unsettle/toggle, and guarded transaction mutations. `SQLiteTransactionRepository` exposes only the application repository contract; transaction edits, invalidation, and deletion use atomic mutation commands.
- `useExpenses.ts` dispatches settlement commands and updates in-memory state only after persistence succeeds; it contains no allocation or settlement calculations.
- Split rows retain original amounts and carry separate manual and repayment-paid totals. New repayment credits embed exact `{ expenseId, splitId, amount }` allocation records. Legacy rows remain readable without guessed links.
- Debt edits preserve settled state and reject unsafe split removal/reassignment or amount reductions. Repayment edits, invalidation/restoration, and deletion reverse/replan exact allocations atomically.

## Agreed behavior to preserve

- Partial payments remain supported. Keep each split's original `amount`; represent what has been paid separately.
- Automatic payments continue to allocate oldest-first to the matching contact and never overpay a split.
- Manual settle/unsettle/toggle remain available with the same visible behavior; their calculation moves out of Zustand.
- Writes that change a transaction and its split allocations commit atomically.
- Screens and navigation are not redesigned.
- Backup restore remains snapshot restore and does not re-run repayment logic.

## Allocation representation

Optional, backwards-compatible split metadata is stored in the existing JSON `splits` column. Each repayment split stores exact destination expense ID, destination split ID, and amount; the containing transaction is the source repayment identity. Manual settlement is stored as a separate paid total rather than an event history. `paidAmount` and `isPaid` remain compatibility summaries derived from original amount plus active settlement components.

Stable IDs are assigned when split rows are first written or allocated under Phase 5. Existing rows without IDs remain readable; Phase 5 does not fabricate payment links for old rows. No SQL column migration was required because the metadata remains within the JSON payload; serialization, backup, and legacy-row behavior have round-trip coverage.

## Legacy repayment safety policy (approved and implemented)

Existing repayment credits have only contact/amount summaries. They cannot always be mapped safely to a particular debt split because manual settlement may have changed the same `paidAmount` values. The proposed safe default is:

1. Preserve all legacy paid amounts and repayment records as-is.
2. Do not guess or backfill allocation links from FIFO order.
3. If a legacy repayment with no exact allocation metadata is edited, invalidated, or deleted, reject that mutation with a clear domain error until the user explicitly reconciles it.
4. New Phase 5 repayment credits carry exact allocation records and can be reversed safely.

This avoids silently changing balances based on reconstructed history. The user approved this policy for Phase 5.

## Transaction mutation rules

- **Edit a new repayment credit:** reverse its exact allocations, apply the requested edit, re-plan if it remains an active credit, and persist transaction plus split changes atomically.
- **Invalidate a new repayment credit:** reverse its allocations and invalidate it atomically. Restoring it re-plans against current outstanding splits rather than assuming old targets remain available.
- **Delete a new repayment credit:** reverse its allocations and delete it atomically.
- **Edit an allocated debt split:** reject removing/reassigning a split that has active repayment allocations. Allow an amount change only when the resulting amount is at least the amount already settled. Do not silently discard allocation history.
- **Invalidate/delete an allocated debt:** reject until its active repayment allocations have been reversed or reconciled. This prevents dangling links and hidden balance changes.
- **Manual unsettle/toggle:** remove or change only manual settlement components; retain automatic repayment allocations. A fully-paid state remains derived from all active settlement components.
- Preserve current behavior for ordinary transactions with no linked repayment allocations.

All rejections must leave both transaction rows and split rows unchanged. Domain errors should identify the blocking allocation/contact so the UI can present a useful message without changing its layout.

## Implementation areas

| Area | Planned work |
|---|---|
| `src/types/expense.ts` | Add optional stable split IDs and typed settlement/allocation metadata while retaining `paidAmount`/`isPaid` compatibility fields. |
| `src/core/transactions/repaymentPlanner.ts` and new split domain module | Add pure allocation/reversal and manual settlement planners; validate amounts, split identity, and allocation limits. |
| `src/core/transactions/applicationUseCases.ts` | Add named settle/unsettle/toggle and repayment mutation operations; keep all decisions outside Zustand. |
| `src/core/transactions/contracts.ts` | Add repository operations to load allocation context and atomically mutate a transaction with related splits. |
| `src/database/expenseRepo.ts`, `src/database/SQLiteTransactionRepository.ts` | Implement transactional writes for settlement, repayment edit/invalidation/delete, and guarded debt mutations; preserve JSON metadata and backup round trips. |
| `src/services/transactions/transactionApplication.ts` | Expose domain commands to the existing adapters. |
| `src/hooks/useExpenses.ts` | Replace inline split calculations with application commands; update in-memory state only after successful persistence. |
| `src/presentation/legacy/screens/SplitsScreen.tsx`, `HistoryScreen.tsx`, edit adapters | Keep layouts intact; show clear failure messages for blocked unsafe mutations where existing actions currently swallow errors. |
| `src/__tests__/*split*`, repository/use-case tests | Cover partial/full allocation, FIFO ordering, manual settlement independence, exact reversal, legacy protections, atomic rollback, and backup preservation. |
| Architecture roadmap, implementation changelog, workflow docs | Record actual allocation representation, legacy behavior, file-by-file changes, tests, and Phase 6/7 handoffs. |

## Test and exit criteria

1. Split calculations are pure and have no Zustand, SQLite, or UI dependencies.
2. Partial payments preserve original split amounts and aggregate to the correct paid amount.
3. Manual settlement changes do not erase repayment allocations, and repayment reversal does not erase manual settlement.
4. Editing, invalidating, restoring, or deleting a new repayment reverses/reapplies exact allocations in one database transaction.
5. A failure midway through any multi-row settlement or repayment mutation rolls back all related rows.
6. Debt split edits/deletion/invalidation cannot orphan active allocation metadata.
7. Legacy rows and JSON backups round-trip without changing stored balances; unsafe legacy repayment mutation follows the approved policy.
8. Hooks and screens contain no split allocation calculations; their actions dispatch typed application commands.
9. TypeScript, focused tests, full suite, lint, `git diff --check`, and Graphify are clean; exact results are recorded.

## Out of scope and later phases

- No UI redesign.
- Live/import dedup unification remains Phase 6.
- Ordered database migration framework remains Phase 7; avoid adding SQL columns in Phase 5 unless a blocker is documented.
- Settings and learning repository dependency cleanup remains broader architecture work.
- Local/offline AI remains the independent Phase 2 requirement.
