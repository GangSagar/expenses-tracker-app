# Phase 3: Shared Application Use Cases

**Status: Complete.** Phase 2 remains marked **in progress** until its local/offline AI requirement is implemented or explicitly re-scoped. Phase 3 uses the existing policy contract and does not add another transaction decision path or claim that AI is active.

## Implementation result

All scoped entry paths now enter shared application operations: live ingestion, historical preview/import, manual create, review confirmation, update, invalidation, and delete. Historical rows are persisted oldest-first through the shared repayment operation, with stable ordering for equal timestamps and per-row results. Import-specific and live dedup strategies remain explicit and separate for Phase 6. The existing screens and store were retained as adapters with no visual redesign.

Implementation files, rationale, behavior boundaries, and verification are recorded in the [implementation changelog](./IMPLEMENTATION_CHANGELOG.md#phase-3--shared-application-use-cases-complete). Phase 4 has since completed the repository port. Remaining related work is split settlement and allocation reversal history (Phase 5), unified dedup semantics (Phase 6), and the independent local AI runtime requirement (Phase 2).

## Purpose

Move transaction workflows out of screens, hooks, and service combinations into named application use cases. Input and presentation adapters may remain different, but they should call the same application boundary for applicable parsing/decision, validation, deduplication, repayment, persistence, and state-refresh behavior.

This phase is about who coordinates a transaction operation and how its result is reported. It does not redesign screens, replace Zustand, introduce the final SQLite repository abstraction, or rewrite the parser.

## Current starting point

| Entry or mutation path | Current responsibility split | Phase 3 target |
|---|---|---|
| Live SMS/notification | `useMessageListener` sequences events, calls `orchestrateTransaction`, branches on the decision, calls `saveExpense`, then updates Zustand. | Listener converts native events to commands and presents typed outcomes. One live-ingestion use case analyzes, applies the existing policy, checks duplicates, persists accepted transactions, and returns a result. |
| Historical message import | `SettingsScreen` scans and loops messages, calls async parsing and the policy directly, owns a dedup cache and preview list, then directly inserts confirmed rows. Imported rows do not currently apply repayment allocations. | Screen owns scan/preview/progress only. A batch import use case evaluates rows, orders them by timestamp, then calls the shared accepted-transaction persistence path sequentially, including full-ledger repayment matching. |
| Manual transaction creation | Screens call `useExpenseStore.addManualExpense`; the store plans repayment, calls SQLite functions, and updates state. | A create-manual use case validates and persists the command, applies repayment rules for credits, and returns the saved transaction plus affected split rows. The store only reflects success. |
| Review confirmation | `CategoryPopup` applies the user’s category, calls `saveExpense`, updates Zustand and writes learning mappings. | A confirmation use case accepts the reviewed candidate, persists it, and records an actual user correction. The component sends the choice and displays the result. |
| Edit | `EditTransactionModal` delegates writes and merchant learning through store actions. | An update use case owns validation, persistence, and correction recording; the modal remains a thin adapter. Split/repayment side effects must follow the explicit edit policy below. |
| Invalidate/delete | Zustand actions call repository functions and update state. | Named mutation use cases own persistence results and state synchronization. Existing product behavior is preserved until deletion/repayment side effects are decided. |
| Split settlement | Zustand still coordinates manual settle/unsettle/toggle and automatic repayment state. | Phase 3 avoids expanding split domain rules. Existing store actions may delegate to the shared write gateway; Phase 5 moves split decisions into a dedicated domain/application boundary. |

## Approved behavior and constraints

- The Phase 2 `decideTransaction()` function remains the sole reject/review/auto-save policy for parsed messages. Phase 3 must consume its typed result, not recompute a confidence score or add thresholds in a screen/use case.
- Live and imported messages use the async structured parser and the same policy input/output contract.
- Historical import is processed oldest-first by message timestamp; ties retain their original scan order. Use the source timestamp as the transaction timestamp rather than the time the batch is confirmed.
- Repayment planning reads all split-bearing ledger rows, independent of the 30-day presentation window. Recompute the plan before each sequential imported credit so earlier rows in the batch affect later ones.
- Accepted live credits and their repayment split updates already commit atomically. Keep that behavior in the shared use case. A failed persistence operation returns failure and must not update the UI/store as if saved.
- Per-transaction commits are preferred for a historical batch. If a later row fails, report which rows succeeded and which failed; do not roll back an arbitrarily large batch or lose its progress state.
- Keep the legacy UI in `src/presentation/legacy/`. Make the smallest wiring changes needed; no layout, styling, navigation, or visual redesign.
- Phase 2’s local AI inference runtime is a separate incomplete requirement. Phase 3 must not introduce a network API or make the import path claim AI behavior that is unavailable.

## Deduplication boundary with Phase 6

Live and import deduplication currently differ: live checks recent database rows with the live policy, while the Settings batch uses a separate cache and time window. Phase 6 is assigned the full semantic unification.

Phase 3 should still route both sources through shared use cases. Until Phase 6, pass an explicit source-specific deduplication strategy/gateway into the use case, preserving the observed behavior and documenting it. Do not hide import-specific dedup rules in `SettingsScreen`; do not silently combine the two strategies and accidentally suppress legitimate repeated purchases. Phase 6 will replace these adapters with one agreed policy and update the corresponding tests.

## Use-case design

Introduce a small set of application operations under `src/core/transactions/` (or the existing application/service layer if that keeps imports simpler). Each use case should accept plain commands and injected gateways; it should not import React Native, Zustand, screen components, or UI presentation state.

### 1. Ingest live transaction

**Command:** normalized native source, body, sender/package, and event timestamp when supplied.

**Steps:**

1. Collect filter/parser evidence through the existing message-analysis adapter.
2. Invoke the Phase 2 decision policy exactly once.
3. For reject/review, return the policy decision and candidate/evidence without writing.
4. For auto-save, apply the selected live dedup strategy.
5. For a unique candidate, persist it. If it is a credit with a repayment plan, insert the credit and split updates atomically.
6. Return a typed application result; the native listener only queues/presents it and updates state after successful persistence.

The async message queue in `useMessageListener` remains responsible for preserving event order. It should not own transaction decisions or SQL calls.

### 2. Preview and import historical transactions

Separate the scanning/preview experience from final persistence:

- **Preview operation:** parse each row through the same structured parser and policy; apply the current import dedup strategy; return ordered row results and counts for the existing Settings UI. No writes occur during preview.
- **Import operation:** receive the user-approved row IDs/candidates, sort by timestamp ascending with stable input-order ties, and call the shared accepted-transaction persistence operation one row at a time. Persist imported credits with the same full-ledger repayment planner and atomic insert method as live input.
- Return a row-level summary: imported, duplicate, rejected/skipped, and failed. Preserve successful rows if a later row fails; make a retry safe through deduplication.
- Do not perform a second parser or confidence decision at confirmation time. The import command should either preserve the previewed policy result and candidate or deliberately re-evaluate through the same policy if the underlying data changed; document which approach is used and test it.

The existing Settings UI retains scan progress, preview selection, and logs. It delegates those operations and displays returned outcomes; it does not own policy, dedup algorithms, repayment, or direct inserts.

### 3. Create manual transaction

Use a command tailored to manually entered fields. Validate required fields and persist with typed success/failure results. Manual entries are already user-authorized and should not be routed through message-parser confidence thresholds. Manual credits still use the same repayment planning and atomic persistence as other credits.

### 4. Confirm a review candidate

Accept the reviewed candidate and the user’s selected category/merchant correction. Persist through the shared transaction write operation and apply repayment handling for credits. Record learning only when the user actually changes the merchant/category, after persistence succeeds. A database failure must leave the candidate available for retry and must not record a correction as though it was saved.

### 5. Update a transaction

Move current edit persistence and correction recording behind an update use case. Preserve split `paidAmount` when changing unrelated fields or the transaction amount, using the existing edit rules.

Before implementing edits that change transaction type, invalidate a repayment credit, or delete a repayment-linked transaction, define how prior split allocations are reversed. Current repayment markers do not preserve a full per-split allocation history, so Phase 3 must not guess a reverse allocation. Either retain current mutation semantics and mark split reversal as Phase 5 work, or pause that specific operation for an explicit product decision. Add regression coverage for the chosen behavior.

### 6. Invalidate and delete

Move existing invalidation and deletion calls behind named use cases. Preserve the current hard-delete versus soft-invalidation behavior; this phase does not choose new product semantics. Do not silently cascade-delete linked split or repayment data. Report persistence failure separately from success, and update the store only after the repository confirms the operation.

## Repository boundary and dependency staging

At the Phase 3 planning checkpoint, the `TransactionRepository` in `contracts.ts` was a minimal draft and was not implemented by SQLite. Phase 4 has since completed the infrastructure port and adapter migration; see [Phase 4](./PHASE_4_REPOSITORY_BOUNDARY.md).

The Phase 3 implementation used a narrow application gateway around `expenseRepo` for the commands needed by its use cases. It was replaced in Phase 4 with the complete injected repository port without changing the shared use-case contract.

## Expected file areas

| File / area | Intended work | Boundary |
|---|---|---|
| `src/core/transactions/` | Add live-ingest, preview/import, manual-create, confirm-review, update, and invalidate/delete use cases; define command/result types and a narrow gateway. | No React Native, Zustand, screen, or SQL imports. The Phase 2 decision policy stays the only parsed-message decision owner. |
| `src/services/messaging/messageService.ts`, `src/services/transactions/` | Reduce overlapping orchestration; adapt parser/policy/persistence to use cases and preserve compatibility exports only while callers remain. | Do not leave a second threshold or direct save route behind. |
| `src/hooks/useMessageListener.ts` | Convert native events to commands; maintain serialized processing and update Zustand only from successful results. | No policy branches beyond rendering/dispatching typed result kinds; no repository writes. |
| `src/presentation/legacy/screens/SettingsScreen.tsx` | Keep import scan/preview/progress UI; replace inline parsing, decision/dedup coordination, and final SQL writes with preview/import operations. | No visual or navigation redesign. |
| `src/hooks/useExpenses.ts` | Retain Zustand state, but delegate manual creation, confirmation-related updates, edits, invalidation, and deletion to use cases as their entry points migrate. | Do not move all split domain behavior here or redesign UI state. |
| `src/presentation/legacy/components/CategoryPopup.tsx`, `EditTransactionModal.tsx` | Dispatch confirm/update commands and reflect typed results. | No direct database write or learning persistence. |
| `src/database/expenseRepo.ts` | At the Phase 3 checkpoint, add only narrowly required gateway methods and keep repayment writes transactional. | This planned responsibility was superseded by the Phase 4 SQLite adapter and repository boundary. |
| `src/__tests__/transactions/` or existing transaction tests | Add use-case tests with fake gateways and integration tests for SQLite transaction behavior, ordered imports, and state-after-success. | Test behavior without React Native screens; preserve database-level atomicity coverage. |
| `docs/APP_MESSAGE_LISTENER_FLOW.md`, `ARCHITECTURE.md`, Phase 1/2 records, this file, implementation changelog | Record actual call paths and per-file changes after implementation. | Distinguish current dedup differences and incomplete AI fallback honestly. |

Confirm callers with `rg` before deleting or renaming compatibility functions. Do not move files solely to make the tree appear layered.

## Test plan

1. **Use-case unit tests:** accepted live transaction, policy reject, policy review, duplicate, insert failure, manual debit, manual repayment credit, review confirmation, edit, invalidation, deletion.
2. **Live integration:** auto-save credit and affected split changes commit together; forced failure leaves neither partial DB writes nor false Zustand success; a duplicate does not add to store.
3. **Import ordering:** create an older split, then import a credit with a timestamp before a later credit; verify oldest-first allocation and `paidAmount` accumulation. Test a split older than 30 days and demonstrate the query is independent of the screen window.
4. **Import dedup:** preserve current preview behavior and ensure overlap with previously saved live rows is handled through an explicit strategy. Defer semantic unification assertions to Phase 6.
5. **Batch failure/retry:** a failure on row N leaves prior successful rows committed, reports row N and subsequent rows clearly, and retrying the batch does not duplicate earlier rows.
6. **Review flow:** preview/review candidates are not written before confirmation; confirmation calls persistence once; failure leaves retryable pending state; corrections are learned only after successful changed values.
7. **State consistency:** for each use case, store state changes only after the persistence result succeeds. A failed write does not look saved in UI state.
8. Run TypeScript, focused use-case/repository tests, changed-file lint, and the full suite. Record exact results and all existing repository-wide lint warnings/errors separately.

## Rollout sequence

1. Inventory all write-capable call sites and record entry types, current dedup strategy, writes, and store update.
2. Define the narrow application gateway and typed results without changing UI.
3. Extract live ingestion into a use case; switch listener to the outcome adapter; retain serialized event ordering and atomic repayment persistence.
4. Extract import preview; verify output parity with the current Settings preview before changing its final write path.
5. Implement sequential historical import using the shared persistence/repayment operation and explicit import dedup adapter; add per-row reporting and retry tests.
6. Move manual creation and review confirmation to use cases; wire correction learning after successful corrections.
7. Move edit and invalidation/delete writes to named use cases, preserving current semantics and isolating unresolved repayment-reversal behavior.
8. Remove direct repository writes from migrated screens/components and retire compatibility functions only when `rg` confirms no remaining callers.
9. Update flow diagrams, file-by-file changelog, test results, and handoff to Phases 4–6.

## Exit criteria

- Every transaction write path covered by Phase 3 (live, imported, manual, confirm, edit, invalidate/delete) enters a named application use case.
- No screen/component independently applies transaction policy, dedup algorithms, repayment planning, direct transaction SQL, or correction persistence.
- All parsed messages use Phase 2’s single policy. Manual commands bypass parser confidence thresholds intentionally, with command validation documented.
- Historical import preview uses the same parser/policy; final import writes are sequential by timestamp, use full-ledger repayment matching, and are per-row atomic/retry-safe.
- The live and imported paths call the same repayment persistence operation; old outstanding splits beyond the UI window are covered by tests.
- State reflects only persisted success; duplicate and failure outcomes remain distinguishable.
- Source-specific dedup differences are isolated behind explicit adapters and listed for Phase 6, not hidden in Settings or use cases.
- Split reversal on editing/deleting repayment-linked transactions is either explicitly deferred without changing current semantics or addressed with a tested allocation-history design; no heuristic reversal is introduced.
- AI fallback remains accurately marked incomplete unless Phase 2 v2 selects and integrates a local runtime.
- Tests, docs, Graphify, roadmap, and implementation changelog reflect actual behavior and file changes.

## Handoff to Phase 4–6

- **Phase 4:** replace the narrow Phase 3 gateway with the complete transaction repository port and SQLite adapter; keep use-case contracts stable.
- **Phase 5:** move split settlement/allocation rules out of Zustand and define repayment allocation history so edits/invalidation/deletion can safely reverse linked payments.
- **Phase 6:** replace source-specific duplicate strategies with one policy, preserving legitimate repeated purchases and historical imports.
