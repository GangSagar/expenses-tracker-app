# Architecture Restructuring Implementation Log

## Purpose and update rule

This log records what has actually changed, why it changed, how it works in the current architecture, and what remains. It is the implementation record for the roadmap in [Architecture Restructuring: Issues and Proposed Plan](./ARCHITECTURE_RESTRUCTURING_PLAN.md). Update it after each phase; distinguish completed work from planned work and do not list a planned file as changed.

The current UI is scheduled for replacement. This work therefore changes transaction contracts, domain behavior, and persistence boundaries while leaving screen design and visual structure alone. Existing screens and Zustand are temporary adapters.

## Status summary

| Phase | Status | Result |
|---|---|---|
| 1. Baseline, contracts, and urgent correctness fixes | Complete | Runtime paths documented, contracts added, automatic repayment over-settlement fixed, related writes grouped atomically, focused tests and typecheck pass. |
| 2. One transaction decision policy | Not started | Existing parser and expense confidence decisions remain; authoritative policy decision is open. |
| 3. Shared application use cases | Not started | Live, import, manual, and edit paths still have distinct coordination. |
| 4. Repository boundary and temporary presentation adapters | Not started | Phase 1 adds a repository port and focused atomic operations; the existing repository is not yet a complete adapter for the port. |
| 5. Splits and repayment domain boundary | Partially prepared | Pure repayment planning has been extracted, but the complete split use case and all split operations remain in Zustand. |
| 6. Unified deduplication | Not started | Live and import deduplication still use different rules. |
| 7. Explicit database migrations | Not started | Existing best-effort `ALTER TABLE` migration sequence remains. |
| 8. Domain organization and dependency guardrails | Not started | Only the new transaction contracts/planner are grouped under `src/core/transactions/`; broader organization and import rules are deferred. |
| 9. Documentation and future feature readiness | In progress | Restructuring plan, Phase 1 record, and this log document the actual flow; broader docs still need reconciliation as phases land. |

## Phase 1 — Baseline, contracts, and urgent correctness fixes

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

Manual credit insertion and its split settlements now commit or roll back together. In the live path, the original credit record is inserted before the store applies repayment matching. The follow-up transaction atomically links the credit and updates old splits. If that follow-up fails, the credit stays saved as an unlinked credit; no split row is marked settled. Moving the entire live flow into one application use case remains Phase 2/3 work.

The original path uses only expenses currently loaded in Zustand (currently windowed to recent history) to find repayments. Phase 1 preserves this behavior; searching the full ledger is not part of this correction.

### Verification

- `npm test -- --runInBand src/__tests__/transactionRepayment.test.ts src/__tests__/expenseRepo.test.ts` — passed: 2 suites, 10 tests.
- `npx tsc --noEmit` — passed.
- `npx eslint` on the changed TypeScript implementation and tests — passed.
- Graphify code AST updated. Its semantic extraction attempt for changed docs failed with connection errors; code nodes were subsequently refreshed successfully.

### Remaining Phase 1 decisions / constraints

- The combined parser/classifier decision policy remains a Phase 2 choice.
- Async parser, AI fallback, and learning are not used by the traced live/import paths; activating them requires an explicit policy decision.
- Partial settlement of a split is unsupported until the domain and persisted model can represent remaining balances or settlement allocations.
- Hard deletion and soft invalidation both exist; their product semantics remain to be consolidated.
- No screen redesign or visual refactor was performed.

## Phase 2 — One transaction decision policy (not started)

**Goal:** make one application policy the sole owner of reject/review/save decisions. The recommended direction is for parser confidence and any retained classifier signal to feed that policy. This choice must be recorded before behavior changes.

**Expected file areas and rationale:**

| Expected files | Planned work |
|---|---|
| `src/core/transactions/contracts.ts` | Extend candidate/outcome fields only if the agreed policy needs them; keep UI presentation flags out. |
| `src/core/transactions/decisionPolicy.ts` (new) | Centralize confidence thresholds, classifier evidence, and reason codes. |
| `src/services/messageService.ts` | Return structured filtering/parse outcomes rather than collapsing every rejection to `null`. |
| `src/services/expenseService.ts` | Remove duplicate decision ownership and convert candidates through the policy. |
| `src/services/transactionOrchestrator.ts` | Coordinate the single policy with current behavior; avoid a forwarding-only orchestrator. |
| `src/__tests__/confidence.test.ts`, `src/__tests__/transactionOrchestrator.test.ts`, new policy tests | Lock down agreed decision outcomes and reason codes. |
| `docs/v2.0 - improvement_plan/PHASE_1_BASELINE_AND_CONTRACTS.md`, `ARCHITECTURE_RESTRUCTURING_PLAN.md` | Record the decision and update current/target flow. |

## Phase 3 — Shared application use cases (not started)

**Goal:** route live messages, historical import, manual creation, pending confirmation, edits, and invalidation/deletion through named application use cases. Input adapters can differ; business policy should be shared.

**Expected file areas and rationale:**

| Expected files | Planned work |
|---|---|
| `src/core/transactions/` | Add `IngestTransaction`, `ImportTransactions`, `CreateManualTransaction`, `ConfirmPendingTransaction`, and edit/invalidation use cases as needed. |
| `src/hooks/useMessageListener.ts` | Adapt native events and display outcomes; do not own transaction decisions. |
| `src/screens/SettingsScreen.tsx` | Retain its current UI, but replace inline import processing/persistence with the batch use case. |
| `src/services/messageService.ts`, `src/services/transactionOrchestrator.ts`, `src/services/expenseService.ts` | Migrate existing behavior into cohesive use cases and adapters; remove duplicate orchestration only after call sites move. |
| `src/components/CategoryPopup.tsx`, `src/components/EditTransactionModal.tsx`, `src/hooks/useExpenses.ts` | Minimal wiring to use cases only; no visual rewrite. |
| `src/__tests__/*transaction*`, new import/use-case tests | Verify consistent outcomes from all sources using repository fakes. |

## Phase 4 — Repository boundary and temporary presentation adapters (not started)

**Goal:** implement the repository port and make application use cases the only transaction write path. Keep the current store/screens only as compatibility adapters.

**Expected file areas and rationale:**

| Expected files | Planned work |
|---|---|
| `src/database/expenseRepo.ts` | Implement the transaction repository contract, typed mapping, and query/write operations needed by use cases. |
| `src/database/db.ts` | Keep connection and migration setup infrastructure-only. |
| `src/core/transactions/` | Inject repository ports into use cases and return persisted results. |
| `src/hooks/useExpenses.ts` | Remove direct database coordination where use cases now own it; retain temporary presentation state actions. |
| `src/screens/SettingsScreen.tsx`, `src/components/CategoryPopup.tsx`, `src/components/EditTransactionModal.tsx` | Replace direct repository/service writes with use-case calls only; leave layout/navigation unchanged. |
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
| `src/screens/SplitsScreen.tsx` | Keep UI intact; change only API wiring when use cases move. |
| split/repayment tests | Cover full, partial (if supported), reversal/unsettle, invalidation, and failure atomicity. |

## Phase 6 — Unified deduplication (not started)

**Goal:** align live and historical import duplicate semantics while preserving legitimate repeated transactions.

**Expected file areas and rationale:**

| Expected files | Planned work |
|---|---|
| `src/core/dedup/duplicateCheck.ts` | Define the product-level duplicate policy and typed duplicate reason. |
| `src/database/expenseRepo.ts` | Supply repository query/index data; keep SQL and caches as optimizations rather than alternate policies. |
| `src/services/expenseService.ts`, transaction use cases | Invoke the same policy from live, import, and confirmation paths. |
| `src/screens/SettingsScreen.tsx` | Remove the second import-only definition while retaining progress/preview UI. |
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

1. Whether parser confidence and classifier evidence combine into one decision policy (Phase 2).
2. Whether learning and async AI fallback should become active production behavior.
3. Whether split partial payments need first-class allocation and residual-balance modeling (Phase 5).
4. Which operations should soft-invalidate versus hard-delete transactions.
5. Which historical database schemas must remain upgradeable (Phase 7).
6. How to handle a live credit that was saved successfully but whose later repayment-link transaction fails: current behavior deliberately leaves it as an unlinked credit and keeps old debts unpaid; a retry/reconciliation policy is future work.

