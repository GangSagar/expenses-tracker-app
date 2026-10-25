# Architecture Restructuring Implementation Log

## Purpose and update rule

This log records what has actually changed, why it changed, how it works in the current architecture, and what remains. It is the implementation record for the roadmap in [Architecture Restructuring: Issues and Proposed Plan](./ARCHITECTURE_RESTRUCTURING_PLAN.md). Update it after each phase; distinguish completed work from planned work and do not list a planned file as changed.

The current UI is scheduled for replacement. This work therefore changes transaction contracts, domain behavior, and persistence boundaries while leaving screen design and visual structure alone. Existing screens and Zustand are temporary adapters.

## Status summary

| Phase | Status | Result |
|---|---|---|
| 1. Baseline, contracts, partial repayments, and presentation isolation | Complete (v2) | Partial allocations are persisted and shown; Phase 1 audit gaps in full-ledger repayment lookup and live repayment atomicity were closed while beginning Phase 2. |
| 2. One transaction decision policy | In progress | Typed policy is wired into live ingestion and import preview; a local offline AI inference runtime remains unimplemented. |
| 3. Shared application use cases | Complete | Live, historical import, manual creation, review confirmation, edit, invalidation, and delete now enter named application operations; historical imports use chronological shared repayment persistence. |
| 4. Repository boundary and temporary presentation adapters | Complete | Focused repository ports are implemented by SQLite; transaction, backup, reset, split-persistence, account-delete, and maintenance writes now cross the boundary. |
| 5. Splits and repayment domain boundary | Complete | Split decisions moved out of Zustand; new repayments store exact allocation links, linked mutations reverse atomically, and unsafe legacy repayment mutations are blocked. |
| 6. Unified deduplication | Complete | Live, import, review, and maintenance use the shared policy; successful saves and edits request local notifications. |
| 7. Explicit database migrations | Not started | Existing best-effort `ALTER TABLE` migration sequence remains. |
| 8. Domain organization and dependency guardrails | Not started | Only the new transaction contracts/planner are grouped under `src/core/transactions/`; broader organization and import rules are deferred. |
| 9. Documentation and future feature readiness | In progress | Restructuring plan, Phase 1 record, and this log document the actual flow; broader docs still need reconciliation as phases land. |

## Phase 1 v1 — Baseline, contracts, and urgent correctness fixes

### Files changed

| File | Change | Why and how |
|---|---|---|
| `src/core/transactions/contracts.ts` | Added `TransactionCandidate`, `TransactionProcessingOutcome`, rejection reasons, `PersistedTransaction`, and `TransactionRepository`. | Establishes a presentation-independent contract for later use cases. The types distinguish rejected, duplicate, review, saved, and failed outcomes. They are not wired into the current runtime yet, so Phase 1 does not silently alter ingestion policy. |
| `src/core/transactions/repaymentPlanner.ts` | Added the pure `planAutomaticRepayment()` planner and `repaymentSplit()` mapper. | Moves only automatic repayment calculation out of Zustand. It finds the matched contact, sorts their unpaid receivables oldest-first, marks only whole split rows that fit the available credit, and returns immutable updates plus the amount actually settled. It stops at an oldest row that does not fit rather than skipping ahead to newer debt. |
| `src/database/expenseRepo.ts` | Added `UPDATE_EXPENSE_SPLITS_SQL`, centralized insert parameter mapping, and added `insertExpenseWithRepayment()` / `updateExpenseWithRepayment()`. | Makes a manual repayment credit plus related split updates one synchronous SQLite transaction. For a live credit already inserted by the existing flow, makes the related split updates and credit linkage atomic. A thrown SQL/write error rolls back all operations in that group. |
| `src/hooks/useExpenses.ts` | Replaced embedded repayment matching and direct per-split writes with the pure planner and repository transaction methods. | The existing store remains a temporary adapter. It updates its split rows only after persistence succeeds. If live repayment linking fails, the already-saved credit remains visible without a repayment link and previous splits are left unchanged. |
| `src/__tests__/transactionRepayment.test.ts` | Added planner regression tests. | Covers whole rows fitting the credit, oldest-first behavior, not skipping an unaffordable oldest row, no mutation, and rejection of non-credit/invalid/unmatched inputs. |
| `src/__tests__/expenseRepo.test.ts` | Added atomic repayment persistence tests. | Covers successful transaction ordering and rollback if manual credit insertion or live credit linkage fails after an earlier split update. |
| `docs/v2.0 - improvement_plan/PHASE_1_BASELINE_AND_CONTRACTS.md` | Added observed path/behavior matrices, contract implementation record, repayment rule and bug disposition, completion status, and verification results. | Makes current behavior and phase limits reviewable without redesigning the existing UI. |
| `docs/v2.0 - improvement_plan/ARCHITECTURE_RESTRUCTURING_PLAN.md` | Marked Phase 1 complete and summarized its result. | Keeps the roadmap’s status aligned with implementation. |
| `docs/v2.0 - improvement_plan/IMPLEMENTATION_CHANGELOG.md` | Added the requested phase-by-phase progress and file-change log. | Records why and how each completed file changed and lists expected file areas and remaining work for Phases 2–9. |

### Behavior change and limits

Before this phase, automatic matching could mark a split paid even when the incoming credit did not cover the full split. The new planner settles complete rows only and preserves oldest-first order. The current split model cannot represent a partial payment against an individual row. If a credit exceeds the sum of fully settled rows but does not cover the next row, only the fully settled amount is linked to the split ledger; the remainder remains an ordinary credit. A richer partial-payment model is future work.

Manual credit insertion and its split settlements now commit or roll back together. In the live path, the original credit record is inserted before the store applies repayment matching. The follow-up transaction atomically links the credit and updates old splits. If that follow-up fails, the credit stays saved as an unlinked credit; no split row is marked settled. Moving the entire live flow into one application use case remains Phase 3 work.

The original path uses only expenses currently loaded in Zustand (currently windowed to recent history) to find repayments. Phase 1 preserves this behavior; searching the full ledger is not part of this correction.

### Verification

- `npm test -- --runInBand src/__tests__/transactionRepayment.test.ts src/__tests__/expenseRepo.test.ts` — passed: 2 suites, 10 tests.
- `npx tsc --noEmit` — passed.
- `npx eslint` on the changed TypeScript implementation and tests — passed.
- Graphify code AST updated. Its semantic extraction attempt for changed docs failed with connection errors; code nodes were subsequently refreshed successfully.

### Remaining Phase 1 decisions / constraints

- Phase 1 v1 assumed whole-split settlement. The user's v2 decision replaces that assumption with partial split allocation.
- Parser async, learning, and AI fallback activation is approved; the local AI inference implementation remains to be selected and integrated.
- Hard deletion and soft invalidation both exist; their product semantics remain to be consolidated.
- The UI relocation is tracked in Phase 1 v2; no screen redesign or visual refactor is part of it.

## Phase 1 v2 — Partial repayments and presentation isolation (complete)

### Files changed in v2

| File or exact file set | Change | Why and how |
|---|---|---|
| `src/types/expense.ts` | Added optional `ExpenseSplit.paidAmount`. | Stores cumulative repayments without overwriting the original split amount. Old JSON rows remain compatible: a missing field is treated as zero, while legacy `isPaid` rows remain fully settled. |
| `src/core/transactions/repaymentPlanner.ts` | Changed the planner to allocate partial amounts oldest-first; added `remainingSplitAmount()`. | Each allocation is capped by the incoming credit and split's outstanding amount. The final reached split may be partially paid; repeated payments accumulate; `isPaid` is set only when no balance remains. |
| `src/hooks/useExpenses.ts` | Updated automatic, manual, settle, unsettle, and toggle flows to preserve/synchronize `paidAmount`. | Keeps existing store actions compatible while displaying/persisting the new split state. Related automatic repayment writes still use the atomic repository methods from v1. |
| `src/presentation/legacy/screens/SplitsScreen.tsx` | Moved from `src/screens/`; balance totals and active split amounts now use remaining amount. | Makes current ledger display reflect partial payments without redesigning the screen. |
| `src/presentation/legacy/components/EditTransactionModal.tsx` | Moved from `src/components/`; split amount edits preserve and cap paid amount. | Prevents edits from silently erasing or exceeding recorded repayments. |
| `src/presentation/legacy/components/BankCard.tsx`, `CalendarModal.tsx`, `CategoryPopup.tsx`, `ExpenseItem.tsx`, `LockScreen.tsx`, `PinSetupModal.tsx`, `SecurityGate.tsx` | Relocated unchanged from `src/components/`. | Groups the current component layer as replaceable presentation code. Relative imports were rebased. |
| `src/presentation/legacy/screens/AccountsScreen.tsx`, `HistoryScreen.tsx`, `HomeScreen.tsx`, `SettingsScreen.tsx` | Relocated unchanged from `src/screens/`. | Groups existing screens under the legacy presentation boundary; no visual or workflow redesign. |
| `src/presentation/legacy/styles/AccountsScreenStyles.ts`, `HistoryScreenStyles.ts`, `HomeScreenStyles.ts`, `SettingsScreenStyles.ts`, `SplitsScreenStyles.ts`, `commonStyles.ts`, `theme.ts` | Relocated unchanged from `src/styles/`. | Keeps styles/theme beside the legacy screens they serve. |
| `src/presentation/legacy/navigation/AppNavigator.tsx` | Relocated from `src/navigation/`; screen imports rebased. | Contains navigation inside the legacy presentation boundary. |
| `src/presentation/legacy/README.md` | Added a boundary note. | Explains that transaction workflows belong outside the legacy UI location. |
| `App.tsx` and moved presentation modules | Rewrote relative import paths. | Preserves the existing app entry and module graph after relocation. |
| `src/__tests__/transactionRepayment.test.ts` | Updated planner tests for partial payment, repeated allocation, and legacy split compatibility. | Verifies that original amounts remain, paid amounts accumulate/cap, and outstanding balances calculate correctly. |
| `README.md`, `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/TRD.md` | Updated current presentation path and split repayment model. | Keeps setup/architecture/requirements docs aligned with the implementation. |
| `docs/v2.0 - improvement_plan/PHASE_1_BASELINE_AND_CONTRACTS.md`, `ARCHITECTURE_RESTRUCTURING_PLAN.md`, this log | Recorded user decisions and Phase 1 v2 scope/status. | Separates approved requirements from work that remains in Phases 2–9. |

### Decisions recorded for later phases

- The single reject/review/save policy is approved and belongs to Phase 2.
- Async parser invocation and correction learning are active in live processing/import preview and explicit user corrections. Offline AI fallback is an approved requirement but remains inactive because there is no local inference handler/runtime.
- Historical import must use the shared transaction processing path and apply repayment allocations chronologically; this remains Phase 3 work.
- Current UI is relocated to `src/presentation/legacy/`; no redesign is requested.

## Phase 2 — One transaction decision policy (in progress)

**Goal:** make one application policy the sole owner of reject/review/auto-save decisions. Parser confidence and classifier evidence feed that policy. The implementation contract, behavior-preservation tests, Phase 1 gaps, and exit criteria are specified in [Phase 2: One Transaction Decision Policy](./PHASE_2_TRANSACTION_DECISION_POLICY.md).

**Expected file areas and rationale:**

| Expected files | Planned work |
|---|---|---|
| `src/core/transactions/contracts.ts`, `decisionPolicy.ts` | Replaced the draft mixed outcome contract with a pure, versioned reject/review/auto-save policy plus separate persistence outcomes. |
| `src/services/messaging/messageService.ts`, `src/core/parser/parseMessage.ts` | Collect typed filtering/parse signals and invoke structured async parsing without discarding confidence details. |
| `src/services/transactions/expenseService.ts`, `transactionOrchestrator.ts` | Map full parser/classifier evidence into one policy call and keep persistence results separate. Accepted credit insertion and repayment updates are atomic. |
| `src/hooks/useMessageListener.ts`, `src/presentation/legacy/screens/SettingsScreen.tsx` | Adapt policy results in live ingestion and import preview; the live async queue preserves message order. Import preview uses the policy; final batch writes moved to shared application operations in Phase 3. |
| `src/database/expenseRepo.ts`, `src/hooks/useExpenses.ts` | Added an unwindowed split-bearing ledger query; manual repayment and contact-wide settle/unsettle use all matching rows, with atomic writes. |
| `src/presentation/legacy/components/CategoryPopup.tsx`, `src/hooks/useExpenses.ts` | Record explicit user merchant/category corrections through `LearningEngine`, which persists to the repository read by parser resolvers. |
| `src/__tests__/decisionPolicy.test.ts`, `decisionParity.test.ts`, `expenseService.test.ts`, `expenseRepo.test.ts`, `transactionOrchestrator.test.ts`, `transactionRepayment.test.ts`, `parser.test.ts` | Cover thresholds, parser evidence, typed rejects, one policy call, full-ledger query, atomic credit allocations, async structured parsing, and legacy decision parity. |
| `docs/APP_MESSAGE_LISTENER_FLOW.md` | Replaced the old synchronous/null-drop flow with the async evidence → policy → persistence flow, including live ordering and import limitations. |
| `docs/ARCHITECTURE.md`, `docs/TRD.md` | Updated active decision thresholds, parser confidence weights, learning behavior, AI runtime status, and full-ledger atomic repayment description. |
| `docs/v2.0 - improvement_plan/PHASE_1_BASELINE_AND_CONTRACTS.md`, `ARCHITECTURE_RESTRUCTURING_PLAN.md`, `IMPLEMENTATION_CHANGELOG.md`, `PHASE_2_TRANSACTION_DECISION_POLICY.md` | Recorded which Phase 1 gaps closed, exact Phase 2 implementation status, verification, and the remaining local-AI runtime requirement. |

### Phase 2 progress checkpoint

The live path and the import preview now call the same decision policy. The import screen still owns its final batch writes and uses its separate dedup cache, so shared historical-import use cases remain Phase 3 work. Parser extraction currently runs synchronously inside the async orchestrator; async AI enrichment is inactive because there is no local inference handler/model. The sanitized `sms-samples.json` parity suite found no outcome differences from the legacy classifier thresholds.

Verification at this checkpoint:

- `npx tsc --noEmit` — passed.
- `npm test -- --runInBand` — passed (29 suites, 635 tests).
- ESLint on the changed TypeScript implementation and test files — passed with existing inline-style warnings in `SettingsScreen.tsx`.
- `git diff --check` — passed.
- Graphify code AST refresh — completed after final code edits; it skipped unsupported native/build files and reported one Android Gradle syntax limitation during extraction.

### Phase 2 v2 Specification — Local AI Hybrid Orchestration (Proposed)

Added [Phase 2 v2: Local AI Hybrid Orchestration Specification](./PHASE_2_V2_LOCAL_AI_HYBRID_ORCHESTRATION.md). It outlines:
- User-driven model catalog with comprehensive pros/cons, resource footprints (RAM, disk, latency), and clear explanations.
- Adaptive multi-model cascading: fast-path micro-models (<40ms, <50MB RAM) for background SMS + deep generative SLMs for complex foreground import.
- Device capability profiler (`IDeviceProfiler`) evaluating RAM, free storage, and 64-bit ABI.
- High-Alert Warning system triggering a blocking alert modal if a user selects a model exceeding device capacity.
- Clean Architecture contracts preserving the pure `TransactionDecisionPolicy` and `IAIResolver` boundaries.

## Phase 3 — Shared application use cases (complete)

Detailed design and original acceptance criteria: [Phase 3: Shared Application Use Cases](./PHASE_3_SHARED_APPLICATION_USE_CASES.md). Phase 2 remains in progress pending its local/offline AI runtime requirement; Phase 3 uses the existing decision policy and does not claim AI fallback is active.

**Goal:** route live messages, historical import, manual creation, pending confirmation, edits, and invalidation/deletion through named application use cases. Input adapters can differ; business policy should be shared.

**Expected file areas and rationale:**

| File | Change, reason, and behavior |
|---|---|
| `src/core/transactions/applicationUseCases.ts` | Added the shared write gateway, accepted-transaction persistence, chronological stable batch import, and mutation use cases. Repayment planning and persistence are shared; each imported row commits independently and returns an explicit result. |
| `src/services/transactions/transactionApplication.ts` | Added application adapters for live ingestion, historical preview/import, manual creation, review confirmation, edits, invalidation, and deletion. Kept live and import dedup strategies separate for Phase 6. Correction learning now follows successful writes. |
| `src/services/transactions/transactionDecisionService.ts` | Extracted candidate construction and the single policy invocation from the persistence service so application orchestration can reuse it without a circular dependency. |
| `src/services/transactions/expenseService.ts`, `transactionOrchestrator.ts` | Kept compatibility exports while routing accepted persistence through the application operation and preserving the existing policy boundary. |
| `src/hooks/useMessageListener.ts` | Delegates complete live processing and persistence to the application adapter; preserves serialized event order and updates Zustand only after a successful save. |
| `src/presentation/legacy/screens/SettingsScreen.tsx` | Delegates preview decisions/dedup and selected-row writes. The existing screen remains visually unchanged; import commits oldest-first and retains failed rows for retry. |
| `src/hooks/useExpenses.ts` | Delegates manual creation, edit, delete, and invalidation writes; reflects results only after successful persistence. Split settlement controls remain store-owned for Phase 5. |
| `src/presentation/legacy/components/CategoryPopup.tsx` | Delegates confirmation and correction learning; keeps pending candidates available on persistence failure. |
| `src/services/transactions/` | Grouped `transactionApplication.ts`, `transactionDecisionService.ts`, `transactionOrchestrator.ts`, and `expenseService.ts` by transaction capability. This keeps application composition, policy adaptation, and compatibility persistence helpers discoverable together. |
| `src/services/messaging/messageService.ts` | Moved incoming-message normalization/filtering/parsing to a messaging capability folder; transaction services depend on its message contract without making it a generic transaction service. |
| `src/__tests__/transactionApplicationUseCases.test.ts`, `transactionOrchestrator.test.ts` | Added coverage for stable chronological import, repayment through the shared gateway, partial batch failure, and the extracted decision adapter. |
| `docs/APP_MESSAGE_LISTENER_FLOW.md`, `docs/ARCHITECTURE.md`, `README.md`, this log, Phase 3 plan | Updated current workflow, limitations, exact file-level history, verification, and remaining phase boundaries. |

### Behavior and remaining boundaries

- Live, manual, confirmed, and imported credits use the same accepted-persistence operation. Credit allocations read the full split-bearing ledger and use the repository's existing atomic credit-plus-split write when a repayment plan exists.
- Historical imports retain the current import-specific dedup strategy. Rows are sorted by transaction timestamp, stable on ties, and committed one at a time. Failure does not undo earlier successful rows; failed rows remain selectable for retry.
- Manual entries bypass parser-confidence policy because the user directly supplied the transaction. Parsed messages still use the one Phase 2 decision policy.
- Existing hard-delete and invalidation semantics remain. Reversing repayment allocations after linked edits/deletes remains deferred to Phase 5 because allocation history is not represented.
- The repository-port migration is complete in Phase 4. At that checkpoint split settlement decisions in Zustand remained Phase 5 and dedup semantic unification remained Phase 6; both have since completed. Local/offline AI remains the outstanding Phase 2 requirement.
- Backup restore is a snapshot operation routed through the transaction repository. It preserves snapshot settlement state and does not replay repayment allocation.

Verification: `npx tsc --noEmit` passed. `npx jest --runInBand` passed with 30 suites and 639 tests. ESLint on changed TypeScript files passed with 0 errors and 19 existing inline-style warnings in `SettingsScreen.tsx`. `git diff --check` passed. `graphify update .` refreshed the graph to 1,398 nodes and 2,797 edges; it reported one unsupported Gradle syntax file and requested community relabeling after the set changed.

### Phase 3 service folder organization

Moved transaction-specific service adapters into `src/services/transactions/` and message ingestion into `src/services/messaging/`. Updated imports in hooks, screens, services, tests, architecture references, and workflow documentation. The move changes file organization only; core transaction rules remain in `src/core/transactions/`, and service adapters remain responsible for connecting those rules to parser, classifier, learning, and SQLite implementations.

## Phase 4 — Repository boundary and temporary presentation adapters (complete)

Detailed scope and semantics: [Phase 4: Repository Boundary](./PHASE_4_REPOSITORY_BOUNDARY.md).

**Goal:** make application operations depend on a stable repository port and close transaction-persistence bypasses in hooks and screens while retaining the legacy UI.

### Files changed

| File | Change | Why and how |
|---|---|---|
| `src/core/transactions/contracts.ts` | Expanded `TransactionRepository`; added focused query, backup, maintenance ports and the `TransactionStorage` composition type. | Gives core/application operations stable persistence capabilities without exposing SQLite details. |
| `src/core/transactions/applicationUseCases.ts` | Replaced the temporary write gateway with `TransactionRepository`; return persisted rows from insert operations and use full-ledger reads for repayment planning. | Keeps use cases reusable and lets historical import see prior writes in the same ordered batch. |
| `src/database/SQLiteTransactionRepository.ts` (new) | Implements transaction, backup, query, and maintenance ports over `expenseRepo`; validates expected row effects and insert IDs. | Contains the concrete SQLite adapter boundary while reusing existing SQL and row mapping. |
| `src/database/expenseRepo.ts` | Added ID lookup and atomic snapshot restore; made clear-all and dedup maintenance transactional; added affected-row checks for mutations. | Keeps transaction mechanics close to SQLite and makes backup/reset operations all-or-nothing. Overwrite restore replaces expense rows only. |
| `src/services/transactions/transactionDependencies.ts` (new) | Creates the `SQLiteTransactionRepository` singleton as the composition point. | Keeps concrete adapter construction out of core use cases. |
| `src/services/transactions/transactionApplication.ts` | Routes application writes, transaction queries, restore/reset, split persistence, trash metadata, account deletion, and dedup maintenance through the repository-backed facade. Validates the complete restore payload before writing. | Consolidates transaction persistence access and prevents partial invalid backups from mutating the ledger. |
| `src/hooks/useExpenses.ts` | Removed direct `expenseRepo` calls and routes ledger persistence through transaction application operations. | Leaves selectors, refresh, and split calculation in the temporary Zustand adapter; split domain rules remain Phase 5. |
| `src/presentation/legacy/screens/SettingsScreen.tsx` | Routes clear-all through the application facade and clears dependent in-memory state only after persistence succeeds. | Preserves UI while preventing a failed reset from presenting as successful. |
| `src/presentation/legacy/screens/AccountsScreen.tsx` | Routes account transaction deletion through the application facade and handles persistence failure. | Removes the remaining screen-level transaction delete bypass. |
| `src/__tests__/expenseRepo.test.ts` | Added backup append/overwrite transaction and rollback cases plus transactional clear-all coverage. | Verifies atomicity and preservation of backup split values. |
| `src/__tests__/SQLiteTransactionRepository.test.ts` (new) | Covers persisted insert return, missing-row update failure, and backup snapshot delegation. | Exercises the concrete adapter contract. |
| `src/__tests__/transactionApplicationUseCases.test.ts` | Updated the fake repository and added chronological historical repayment coverage against a long-standing split. | Closes the Phase 3 handoff gap: imported credits observe earlier writes and accumulate partial `paidAmount`. |
| `README.md`, `docs/v2.0 - improvement_plan/ARCHITECTURE_RESTRUCTURING_PLAN.md`, this log, `PHASE_4_REPOSITORY_BOUNDARY.md` | Updated architecture tree, phase status, behavior, file-level record, and remaining boundaries. | Keeps the plan and implementation history aligned with the code. |

### Behavior and remaining boundaries

- Transaction and backup/reset writes from hooks/screens pass through repository-backed transaction application operations. Generic app settings and merchant-learning persistence remain their own capability boundaries.
- Backup payloads are validated before writes. Append and overwrite batches are atomic. Overwrite replaces expense rows only, preserving settings and learned merchant mappings that are not in the backup snapshot.
- Restore copies split payment values from the snapshot and never reruns parser policy, deduplication, or automatic repayment allocation.
- At Phase 4 exit, split settlement calculations still remained in Zustand; Phase 5 has since moved them to core use cases. Live and import deduplication also differed at that checkpoint; Phase 6 has since unified them. Schema migration redesign remains Phase 7. The offline AI runtime remains Phase 2 work.

### Boundary audit and carry-forward

- No runtime transaction-mutating `expenseRepo` calls remain outside `SQLiteTransactionRepository`; legacy screens still access generic app/security settings directly, which is outside the transaction-ledger port but remains a presentation dependency to clean up later.
- `LearningEngine` still constructs `SQLiteLearningRepository` from the parser package. Move that concrete dependency to composition/injection when implementing broader dependency guardrails (Phase 8).
- Chronological historical repayment and database rollback are covered separately. Add a focused test that forces a later imported repayment's atomic insert/update to fail and verifies no split or credit from that row is left behind.
- These are architecture/test-hardening carry-forwards, not known Phase 4 transaction persistence bypasses. They do not prevent Phase 5.

Verification: `npx tsc --noEmit` passed; `npm test -- --runInBand` passed (31 suites, 648 tests); focused Phase 4 tests passed (3 suites, 23 tests); changed-file ESLint passed with 0 errors and 19 existing inline-style warnings in `SettingsScreen.tsx`; `git diff --check` passed. Graphify refreshed to 1,478 nodes and 2,988 edges across 104 communities; it reported a pre-existing Android Gradle syntax limitation and requested community relabeling after the community set changed.

## Phase 5 — Split and repayment domain (complete)

Detailed plan: [Phase 5: Split Settlement and Repayment Domain](./PHASE_5_SPLIT_REPAYMENT_DOMAIN.md).

| File | Change | Why and how |
|---|---|---|
| `src/types/expense.ts` | Added stable split IDs, separate manual/repayment paid totals, and exact repayment allocation DTOs. | Existing `amount`, `paidAmount`, and `isPaid` remain readable; original debt amounts are not overwritten. |
| `src/core/transactions/repaymentPlanner.ts` | Extended FIFO partial allocation to assign stable legacy split IDs, update separate payment totals, and return exact destination allocation records. | New repayment credits can later be reversed without recomputing history. |
| `src/core/transactions/splitSettlement.ts` (new) | Added pure split ID, manual settlement, payment-state, reversal, and debt-mutation validation rules. | Keeps settlement decisions outside Zustand and makes manual values distinct from incoming repayments. |
| `src/core/transactions/applicationUseCases.ts` | Added named settlement, repayment edit/reversal, invalidation/restore, and guarded delete operations. Removed raw update/invalidate/delete methods from the core application-facing repository contract. | Core coordinates rules and requires atomic repository mutation for linked transaction/split changes. |
| `src/core/transactions/contracts.ts` | Added typed atomic transaction mutation commands. | Describes linked update/invalidate/delete operations without SQLite details. |
| `src/database/expenseRepo.ts` | Added transaction-plus-split atomic mutation, insert-ID rollback validation, backup allocation-ID remapping, and protections for account deletion/deduplication. | Prevents partial repayment reversals, dangling links, or silently invalidated settlement history. |
| `src/database/SQLiteTransactionRepository.ts` | Adapted the atomic mutation operation to SQLite. | Implements the core persistence contract. |
| `src/services/transactions/transactionApplication.ts` | Routes edits, deletion, invalidation, manual settlement, and backup validation to the domain operations. | Keeps the concrete repository composed outside core and rejects malformed/dangling backup allocations. |
| `src/hooks/useExpenses.ts` | Removed settle/unsettle/toggle calculations; dispatches use cases and refreshes state after persisted results. Added clear mutation failure messages. | Zustand is now a state adapter for split operations. |
| `src/presentation/legacy/screens/SplitsScreen.tsx`, `HistoryScreen.tsx` | Kept layout; only show success after settlement succeeds and stop trash actions when guarded invalidation fails. | Exposes domain outcomes without redesigning UI. |
| `src/__tests__/splitSettlement.test.ts` (new) | Covers exact allocation, manual versus repayment balances, reversal, legacy protection, mutation guards, and use-case routing. | Verifies domain behavior independently of SQLite. |
| `src/__tests__/expenseRepo.test.ts`, `transactionRepayment.test.ts`, `transactionApplicationUseCases.test.ts`, `expenseService.test.ts`, `SQLiteTransactionRepository.test.ts` | Added rollback, backup ID remapping, account/dedup protection, and end-to-end use-case assertions for exact allocation metadata. | Covers SQLite and application boundaries. |
| `README.md`, `docs/ARCHITECTURE.md`, `docs/APP_MESSAGE_LISTENER_FLOW.md`, roadmap, Phase 3/5 plans, this log | Updated architecture, handoffs, status, and supported legacy behavior. | Keeps implementation records aligned with the active runtime. |

### Phase 5 follow-up closure

| File | Change | Why and how |
|---|---|---|
| `src/database/SQLiteTransactionRepository.ts`, `src/database/expenseRepo.ts` | Removed unused raw update/invalidate/delete adapter methods and low-level functions, plus the obsolete repayment-link update operation. | Transaction mutation now has one app-facing path through guarded use cases and atomic repository commands. |
| `src/hooks/useExpenses.ts`, `src/presentation/legacy/components/EditTransactionModal.tsx` | `deleteExpense` now reports success; the edit modal closes after delete/trash/restore only when the store confirms persistence succeeded. | A blocked legacy or settled mutation leaves the transaction visible for the user to review. |
| `src/__tests__/SQLiteTransactionRepository.test.ts`, `src/__tests__/expenseRepo.test.ts` | Removed tests for deleted raw mutation paths. | Keeps tests aligned with the supported repository contract. |
| `PHASE_5_SPLIT_REPAYMENT_DOMAIN.md` | Replaced stale pre-implementation “starting point” and “proposed” sections with the implemented boundary and allocation representation. | Prevents the plan from contradicting the shipped Phase 5 behavior. |

### Behavior and remaining boundaries

- New automatic repayments allocate FIFO and store exact `{expenseId, splitId, amount}` links in the repayment transaction. Debt split rows retain original amounts and track manual settlement separately from active repayment totals.
- Editing a new repayment reverses its exact old allocations and replans the edited credit in one transaction. Invalidating reverses; restoring replans against current outstanding splits; deleting reverses before removing the credit.
- Debt split changes that remove/reassign an already-settled split or reduce its amount below the settled total are rejected. Settled debt transactions cannot be invalidated/deleted until reconciled.
- Older repayment rows without exact links are preserved and their edit/invalidation/deletion is blocked. Account removal and deduplication also refuse to invalidate transactions with settlement history.
- Backup restore remaps linked expense IDs and rolls back if an allocation target is missing. It does not re-run repayment matching.
- At the Phase 5 checkpoint, live/import dedup unification remained Phase 6; Phase 6 has since completed it. Explicit migrations remain Phase 7; settings/learning dependency cleanup remains broader architecture work; local AI remains Phase 2.

Verification: `npx tsc --noEmit` passed; `npx jest --runInBand` passed (32 suites, 666 tests). Focused Phase 5 tests passed (6 suites, 49 tests). Changed-file ESLint passed with 0 errors and 5 existing inline-style warnings in `HistoryScreen.tsx` and `SplitsScreen.tsx`. `git diff --check` passed.

## Phase 6 — Unified deduplication (complete)

Detailed plan and adopted policy: [Phase 6: Unified Transaction Deduplication](./PHASE_6_UNIFIED_DEDUPLICATION.md).

**Goal:** align live and historical import duplicate semantics while preserving legitimate repeated transactions. A shared post-save notification also confirms successful transaction creations and edits.

### Files changed and rationale

| File | Change | Why and how |
|---|---|
| `src/core/dedup/duplicateCheck.ts`, `src/core/dedup/index.ts` | Added typed definite/possible/no-match decisions, shared five-minute event-time matching, normalized reference/message comparisons, and an indexed candidate cache. | Keeps policy pure and makes reference/time indexes performance-only. |
| `src/core/transactions/contracts.ts`, `src/database/expenseRepo.ts`, `src/database/SQLiteTransactionRepository.ts` | Replaced boolean SQL/cache decisions with broad candidate retrieval; removed the recent-slice dedup query. Maintenance dedup now invokes the shared policy. | Keeps SQLite from defining its own duplicate semantics and retains atomic maintenance writes plus Phase 5 settlement guards. |
| `src/core/transactions/applicationUseCases.ts`, `src/services/transactions/transactionApplication.ts` | Routes live, import, review, and maintenance checks through one policy. Selected possible matches can be explicitly accepted; definite matches remain blocked. Notifications run only after successful writes. | Preserves chronological import and separates persistence outcome from duplicate evidence and notification side effects. |
| `src/presentation/legacy/screens/SettingsScreen.tsx`, `src/hooks/useMessageListener.ts` | Shows possible imported matches unchecked with a review hint; queues live possible matches for confirmation; removes the old live saved-notification branch. | Reuses existing preview/pending interactions with minimal UI changes. |
| `src/services/notifications/transactionSavedNotification.ts` (new) | Added queued best-effort local notification requests with concise transaction details and Android permission handling. | Keeps notification failures from changing transaction persistence results. |
| `android/app/src/main/java/com/expensetracker/bridge/MessageModule.kt` | Updated the notification channel description used for saved transaction notices. | Reuses the existing Android local notification bridge. |
| `ios/ExpenseTracker/TransactionNotificationModule.swift`, `TransactionNotificationModule.m`, `AppDelegate.swift`, `ios/ExpenseTracker.xcodeproj/project.pbxproj` | Added and registered an iOS local notification bridge, permission request, and foreground display delegate. | Provides saved-transaction notices on the supported iOS target. |
| `src/__tests__/dedup.test.ts`, `expenseRepo.test.ts`, `expenseService.test.ts`, `transactionApplicationUseCases.test.ts`, `SQLiteTransactionRepository.test.ts` | Added policy boundary, weak-match confirmation, broad candidate query, maintenance safeguard, and saved-notification behavior coverage. | Verifies policy parity, no silent blocking of weak matches, and no notification for duplicate/failed saves. |
| `docs/APP_MESSAGE_LISTENER_FLOW.md`, roadmap, Phase 6 plan, this log | Updated current flow, adopted rules, phase status, file history, and verification. | Keeps architecture documentation consistent with the implementation. |

### Behavior and verification

- Exact normalized reference matches are definite across eligible history. Exact normalized message matches require same amount and transaction type within five minutes. Amount/merchant/type/time similarity is possible and goes to confirmation.
- Invalidated and duplicate rows do not suppress candidates. Cross-source matches are allowed. Manual entry remains user-authoritative and bypasses deduplication.
- Import preview uses a temporary indexed cache; commit rebuilds from persisted rows and only includes earlier successful rows. Selected possible matches can be imported; definite matches are skipped. Maintenance dedup auto-invalidates only definite matches and refuses to touch Phase 5 settlement history.
- Save notifications cover live, manual, confirmed, imported, and edited transactions. Failed writes, duplicates, and pending reviews do not produce a saved notice. Notification failure is logged and does not undo persistence.

Verification: `npx tsc --noEmit` passed; `npx jest --runInBand` passed (32 suites, 668 tests); focused Phase 6 tests passed (5 suites, 43 tests); changed-file ESLint passed with 0 errors and 19 existing inline-style warnings in `SettingsScreen.tsx`; `git diff --check` passed. Graphify offline update re-extracted 27 changed code files and refreshed the graph to 1,546 nodes and 3,219 edges; its no-LLM mode skipped semantic extraction of nine changed Markdown files. iOS build was unavailable because `xcodebuild` is not installed. Android compile started after downloading Gradle 9.3.1 and compiling the React Native Gradle plugin, but was interrupted after prolonged silence during app dependency/configuration work; the Android app compile result is unverified.

## Phase 7 — Explicit database migrations (not started)

**Goal:** make schema evolution ordered, versioned, testable, and safe for supported existing installs.

**Expected file areas and rationale:**

| Expected files | Planned work |
|---|---|
| `src/database/db.ts` | Replace catch-and-ignore `ALTER TABLE` sequence with schema version tracking and ordered migrations. |
| `src/database/migrations/` (new) | Store one migration per schema change with explicit forward behavior. |
| `src/database/expenseRepo.ts` | Keep queries compatible with the current version and isolate row mapping. |
| database migration fixtures/tests | Cover fresh database and each supported historical schema, including failed migration recovery. |
| `docs/ARCHITECTURE.md`, this log | Record schema version and supported upgrade path. |

## Phase 8 — Domain organization and dependency guardrails (not started)

**Goal:** organize domain/application/infrastructure by feature after runtime ownership settles. The UI is excluded because it will be replaced.

**Expected file areas and rationale:**

| Expected files | Planned work |
|---|---|
| `src/core/transactions/`, `src/core/splits/`, `src/services/`, `src/database/` | Move modules only where the move reflects stable ownership; avoid a bulk rename. |
| `src/features/*` (only if useful) | Introduce feature folders for transactions, splits, accounts, security, or budgeting when each has real ownership boundaries. |
| `tsconfig.json`, `package.json` lint configuration (only if useful) | Add import boundaries only to prevent observed dependency regressions. |
| import-boundary documentation | Explain allowed dependency direction without prescribing UI structure. |

## Phase 9 — Documentation and future feature readiness (in progress)

**Goal:** keep runtime docs accurate and make new sources reuse established use cases.

**Expected file areas and rationale:**

| Expected files | Planned work |
|---|---|
| `docs/ARCHITECTURE.md` | Replace stale runtime claims with implemented flows and active/partial/planned labels. |
| `docs/APP_MESSAGE_LISTENER_FLOW.md` | Keep the live native flow accurate while UI screens change. |
| `docs/TRD.md`, `docs/IMPLEMENTATION_PLAN.md`, `README.md` | Reconcile architecture, business rules, setup, and capability claims as implementation lands. |
| `docs/v2.0 - improvement_plan/*` | Update phase status, file-level changes, and remaining work after each phase. |

Future receipt OCR, notification providers, import formats, or backup should enter through adapters and existing use cases. Multi-currency needs domain and repository support before presentation work.

## Cross-cutting files and constraints

- `src/types/expense.ts`: current `Expense` and `ExpenseSplit` remain compatibility models during migration; evolve carefully with data migration support.
- `src/core/parser/*`: parser remains a candidate producer. Do not make it persist or own presentation decisions.
- `src/hooks/useExpenses.ts`: current UI state remains temporarily; no visual redesign is included in this roadmap.
- `docs/APP_MESSAGE_LISTENER_FLOW.md`: had a pre-existing user working-tree edit before this implementation. It was not changed as part of Phase 1.
- Graphify artifacts are generated outputs; refresh the code graph after code structure changes and record semantic extraction failures honestly.

## Remaining decisions and risks

1. The local/offline AI inference runtime and its operational limits; the product requirement for offline fallback is approved.
2. Exact deletion versus soft-invalidation semantics.
3. Which historical database schemas must remain upgradeable (Phase 7).
4. The 30-day repayment window, live credit-link failure, and historical-import routing gaps are closed. Phase 5 has since moved split rules out of Zustand and added safe reversal for new linked repayments; legacy summary-only repayment mutations remain blocked pending reconciliation.

