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
| 4. Repository boundary and temporary presentation adapters | Not started | Phase 1 adds a repository port and focused atomic operations; the existing repository is not yet a complete adapter for the port. |
| 5. Splits and repayment domain boundary | Partially prepared | Pure partial-allocation planning is in place; manual settle/unsettle/toggle and the complete split use case remain in Zustand. |
| 6. Unified deduplication | Not started | Live and import deduplication still use different rules. |
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
|---|---|
| `src/core/transactions/contracts.ts`, `decisionPolicy.ts` | Replaced the draft mixed outcome contract with a pure, versioned reject/review/auto-save policy plus separate persistence outcomes. |
| `src/services/messaging/messageService.ts`, `src/core/parser/parseMessage.ts` | Collect typed filtering/parse signals and invoke structured async parsing without discarding confidence details. |
| `src/services/transactions/expenseService.ts`, `transactionOrchestrator.ts` | Map full parser/classifier evidence into one policy call and keep persistence results separate. Accepted credit insertion and repayment updates are atomic. |
| `src/hooks/useMessageListener.ts`, `src/presentation/legacy/screens/SettingsScreen.tsx` | Adapt policy results in live ingestion and import preview; the live async queue preserves message order. Import still owns final batch persistence until Phase 3. |
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
- The full repository-port migration remains Phase 4; split settlement actions in Zustand remain Phase 5; dedup semantic unification remains Phase 6; local/offline AI remains the outstanding Phase 2 requirement.

Verification: `npx tsc --noEmit` passed. `npx jest --runInBand` passed with 30 suites and 639 tests. ESLint on changed TypeScript files passed with 0 errors and 19 existing inline-style warnings in `SettingsScreen.tsx`. `git diff --check` passed. `graphify update .` refreshed the graph to 1,398 nodes and 2,797 edges; it reported one unsupported Gradle syntax file and requested community relabeling after the set changed.

### Phase 3 service folder organization

Moved transaction-specific service adapters into `src/services/transactions/` and message ingestion into `src/services/messaging/`. Updated imports in hooks, screens, services, tests, architecture references, and workflow documentation. The move changes file organization only; core transaction rules remain in `src/core/transactions/`, and service adapters remain responsible for connecting those rules to parser, classifier, learning, and SQLite implementations.

## Phase 4 — Repository boundary and temporary presentation adapters (not started)

**Goal:** implement the repository port and make application use cases the only transaction write path. Keep the current store/screens only as compatibility adapters.

**Expected file areas and rationale:**

| Expected files | Planned work |
|---|---|
| `src/database/expenseRepo.ts` | Implement the transaction repository contract, typed mapping, and query/write operations needed by use cases. |
| `src/database/db.ts` | Keep connection and migration setup infrastructure-only. |
| `src/core/transactions/` | Inject repository ports into use cases and return persisted results. |
| `src/hooks/useExpenses.ts` | Remove direct database coordination where use cases now own it; retain temporary presentation state actions. |
| `src/presentation/legacy/screens/SettingsScreen.tsx`, `src/presentation/legacy/components/CategoryPopup.tsx`, `src/presentation/legacy/components/EditTransactionModal.tsx` | Replace direct repository/service writes with use-case calls only; leave layout/navigation unchanged. |
| `src/__tests__/expenseRepo.test.ts`, use-case tests | Validate adapter mapping, success/failure behavior, and state-after-persistence rules. |

## Phase 5 — Splits and repayment domain boundary (partially prepared)

**Goal:** move all split settlement behavior out of Zustand, not just automatic credit matching. Define partial payment separately if the product requires it.

**Already done:** `repaymentPlanner.ts` is pure and automatic repayment writes are grouped transactionally.

**Remaining expected file areas:**

| Expected files | Planned work |
|---|---|
| `src/core/transactions/repaymentPlanner.ts` | Extend only after settlement semantics are agreed; define partial allocation if supported. |
| `src/core/splits/` or `src/core/transactions/` | Add domain rules/use cases for manual settle, unsettle, toggle, and automatic repayment. |
| `src/database/expenseRepo.ts` or dedicated split repository | Add atomic multi-expense settlement operations and support residual/allocated amounts if partial payment is adopted. |
| `src/hooks/useExpenses.ts` | Reduce to invoking use cases and reflecting results. |
| `src/presentation/legacy/screens/SplitsScreen.tsx` | Keep UI intact; change only API wiring when use cases move. |
| split/repayment tests | Cover full, partial (if supported), reversal/unsettle, invalidation, and failure atomicity. |

## Phase 6 — Unified deduplication (not started)

**Goal:** align live and historical import duplicate semantics while preserving legitimate repeated transactions.

**Expected file areas and rationale:**

| Expected files | Planned work |
|---|---|
| `src/core/dedup/duplicateCheck.ts` | Define the product-level duplicate policy and typed duplicate reason. |
| `src/database/expenseRepo.ts` | Supply repository query/index data; keep SQL and caches as optimizations rather than alternate policies. |
| `src/services/transactions/expenseService.ts`, transaction use cases | Invoke the same policy from live, import, and confirmation paths. |
| `src/presentation/legacy/screens/SettingsScreen.tsx` | Remove the second import-only definition while retaining progress/preview UI. |
| `src/__tests__/dedup.test.ts`, `src/__tests__/expenseRepo.test.ts`, import integration tests | Cover reference, raw body, source, timestamp, merchant, repeated purchase, invalidated and cross-source cases. |

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
4. The 30-day repayment window, live credit-link failure, and historical-import routing gaps are closed. Phase 5 still owns moving split rules out of Zustand and defining safe reversal for linked repayment edits/deletes.

