# Architecture Restructuring: Issues and Proposed Plan

## Purpose

This document records the architecture issues found in the current transaction flows and a staged plan for making the app easier to maintain and extend. It is a proposal for incremental work, not a commitment to a broad rewrite. The goal is to preserve user-visible behavior while making each business rule and data write have one clear owner.

Implementation progress and file-by-file rationale are tracked in the [implementation log](./IMPLEMENTATION_CHANGELOG.md).

The audit covered the checked-in TypeScript call sites, the Graphify dependency graph, and the architecture and implementation documents. The active call sites take precedence over older design claims where the two disagree.

## UI scope

The current UI will be replaced, so this restructuring will not spend time redesigning screens, polishing visual components, or reorganizing presentation code for its own sake. Existing screens and Zustand hooks can remain as temporary adapters while the transaction/domain/persistence boundaries are improved. Only the minimal call-site changes needed to route operations through application use cases are in scope. The replacement UI can later consume those stable use cases and query contracts.

## Current transaction flow

The active live-message path is approximately:

```text
Native SMS/notification event
  → src/hooks/useMessageListener.ts
  → src/services/transactionOrchestrator.ts
  → src/services/messageService.ts
  → src/core/parser/parseMessage.ts (legacy ParsedTransaction adapter)
  → src/services/expenseService.ts (classification and save/review/discard decision)
  → SQLite through src/database/expenseRepo.ts
  → Zustand store in src/hooks/useExpenses.ts
  → screens
```

There are parallel paths for historical import in `SettingsScreen.tsx`, and for manual entry, edits, category changes, and split settlement through a mix of store actions, services, components, and repository calls. Consequently, “the transaction flow” is not one flow yet.

## Issue inventory

### 1. Two layers can influence the transaction decision

`ParserOrchestrator` returns parser confidence and `requiresConfirmation`. The active message service calls `parseMessage()`, which adapts the result to `ParsedTransaction`; `expenseService.processTransaction()` then runs a classifier and a separate confidence calculation to decide auto-save, review, or discard. These are two decision systems, and the parser's review signal is not visibly authoritative in the active path.

**Risk:** different paths can classify the same message differently; a future parser change may appear to have no effect on the user-facing decision.

**Proposed fix:** define one application-level decision policy. Parser confidence and any useful classifier signals may feed it, but only that policy emits the final outcome. Centralize thresholds and expose a reason for each outcome.

### 2. Processing and persistence are split among entry points

Live input uses `transactionOrchestrator.ts`. Historical processing in `SettingsScreen.tsx` calls message processing and transaction processing directly. Manual creation and edits use store methods, while `CategoryPopup.tsx` calls persistence directly.

**Risk:** validation, confidence, deduplication, and error behavior can differ depending on how the transaction entered the app.

**Proposed fix:** create application use cases for live ingestion, batch import, manual creation, edit, confirmation, and invalidation/deletion. Input adapters may differ, but shared domain rules and write policy should not.

### 3. Database writes have multiple owners

`expenseService.saveExpense()` writes to SQLite; callers separately update Zustand. `useExpenses.ts` also writes directly for manual creation and edits. Some UI call sites use repository functions themselves.

**Risk:** a write can bypass a rule, or the in-memory list can disagree with SQLite after partial failure.

**Proposed fix:** route writes through application use cases and a transaction repository contract. The use case returns the persisted record; presentation state updates after success. Screens and components should not call transaction SQL or repository write functions.

### 4. Zustand contains domain behavior

`useExpenses.ts` owns state but also performs repayment matching, mutates split data, and coordinates database updates.

**Risk:** domain rules are hard to test without state/UI setup, and new transaction sources may not invoke the same rules.

**Proposed fix:** move split and repayment calculations into pure domain services and let an application use case coordinate the required repository operations. Keep Zustand responsible for presentation state and pending-review state.

### 5. Deduplication has multiple implementations and policies

The repository has in-memory duplicate checks in `src/core/dedup`, SQL-based checks and an optional cache in `src/database/expenseRepo.ts`, and batch-specific cache use in `SettingsScreen.tsx`.

**Risk:** duplicate results can vary between live input and import. Amount-and-time matching may also suppress legitimate repeated purchases if its conditions are too broad.

**Proposed fix:** define one deduplication policy with explicit semantics for reference IDs, raw text, amount, merchant, timestamp, source, and invalidated records. Repository queries and caches should optimize access to the needed records, not define different rules.

### 6. Parser capabilities and live usage do not fully align

The modular parser exposes `parseAsync()` and learning/AI interfaces, while the traced live flow calls the synchronous compatibility adapter. The docs describe some learning and fallback behavior as part of the active pipeline even though that usage was not found in the live call path.

**Risk:** developers may extend a capability that production never invokes, or different entry paths may have different parser behavior.

**Proposed fix:** decide whether asynchronous learning/fallback is active product behavior. If active, call it consistently and define failure/latency behavior. If not active, mark it as partial/planned and avoid presenting it as live behavior.

### 7. Domain and storage representations are too close

`ParsedTransaction`, `StructuredExpense`, database row shape, and the UI-facing `Expense` type overlap but are not the same contract. Adapters and callers perform conversions in multiple places.

**Risk:** adding fields such as currency, source metadata, or review status requires scattered changes and unsafe casts.

**Proposed fix:** define a domain transaction/candidate contract and keep parser, database, and UI conversions at their respective boundaries. Replace casts such as `as any` where migration makes it practical.

### 8. Database evolution needs explicit versioning

`src/database/db.ts` applies schema changes through a sequence of table creation and `ALTER TABLE` attempts rather than one clearly versioned migration history.

**Risk:** upgrades from older installs become difficult to reason about as features add tables and columns.

**Proposed fix:** use an explicit schema version and ordered migrations, with clear failure behavior and migration coverage from supported prior schemas.

### 9. Split repayment needs a domain-level correctness review

`applyRepaymentIfApplicable()` in `useExpenses.ts` matched incoming credits to pending splits and marked a row paid before confirming the full row fit within the remaining credit. This could over-settle. Phase 1 now uses an immutable oldest-first planner that settles only whole rows covered by the credit and atomically persists linked changes for live and manual entry. Partial payment of an individual split is not represented and remains future work.

**Remaining risk:** partial repayments cannot reduce a split's remaining balance; historical import does not currently use the repayment path; a live credit whose follow-up settlement transaction fails remains saved as an unlinked credit and needs a future retry/reconciliation policy.

**Proposed follow-up:** move all split operations into a dedicated domain/use-case boundary, then decide whether to add partial allocation and import repayment matching. Keep UI redesign out of scope.

### 10. Documentation describes intended architecture more than observed runtime

`ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, and revision notes contain claims that need reconciliation with active callers. Historical plans also list paths that no longer match the current repository.

**Risk:** plans and reviews are based on stale assumptions.

**Proposed fix:** label behavior as active, partial, or planned; update the runtime diagram as code changes land; remove or qualify claims unsupported by the current call graph.

## Target principles

1. Every transaction change enters an application use case.
2. Each business decision has one owner.
3. Domain rules do not depend on React Native, Zustand, or SQLite.
4. Repositories own persistence details; they do not own product policy.
5. State updates follow successful persistence, with explicit handling for review queues and errors.
6. Live, imported, manual, and future receipt transactions share applicable validation, deduplication, and ledger rules.
7. Keep the architecture as simple as the current product needs; add interfaces where they isolate platform/storage dependencies or support meaningful substitution.

## Staged implementation plan

### Phase 1 — Baseline, contracts, and urgent correctness fixes

**Status: Complete.** Documented actual input paths and behavior; added transaction candidate, processing outcome, and repository contracts; fixed automatic whole-split over-settlement and grouped repayment writes atomically. Partial settlement remains unsupported by the current split model. Details and verification are in [Phase 1: Baseline and Contracts](./PHASE_1_BASELINE_AND_CONTRACTS.md).

**Exit condition:** current behavior is mapped, key contracts and decisions are recorded, and any in-scope correctness defect has a regression case and a bounded fix.

### Phase 2 — One transaction decision policy

Create a single policy that consumes parser facts and any classifier signal, then returns reject, review, or accept with a reason. Migrate the active live path to the policy while preserving the established behavior unless a deliberate behavior change is approved.

**Likely areas:** `src/core/parser/models/`, `src/services/messageService.ts`, `src/services/expenseService.ts`, `src/services/transactionOrchestrator.ts`, and transaction tests.

**Exit condition:** one policy is authoritative and decisions are explainable and consistent for equivalent input.

### Phase 3 — Shared application use cases

Route live ingestion, historical import, manual creation, confirmation, edits, and invalidation/deletion through named use cases. Keep native event handling and batch progress in adapters/presentation, not in duplicated business flows.

**Likely areas:** `src/services/transactionOrchestrator.ts`, `src/services/messageService.ts`, `src/services/expenseService.ts`, `src/screens/SettingsScreen.tsx`, `src/hooks/useMessageListener.ts`, and manual/edit UI call sites.

**Exit condition:** every write-capable entry point uses an application use case; no screen independently reconstructs transaction processing.

### Phase 4 — Repository boundary and temporary presentation adapters

Introduce a transaction repository interface and keep SQLite implementation details in the database adapter. Move write coordination into use cases. Do not redesign or comprehensively refactor Zustand/screens; make only the changes needed to call the use cases and reflect their results. Treat the existing UI/store as a temporary presentation adapter that may be replaced later.

**Likely areas:** `src/database/expenseRepo.ts`, `src/database/db.ts`, `src/hooks/useExpenses.ts`, `src/components/CategoryPopup.tsx`, and screen imports of repository writes.

**Exit condition:** no active UI call site bypasses the application write boundary; existing UI state reflects successful use-case results. Visual and navigation changes are explicitly deferred.

### Phase 5 — Splits and repayment domain boundary

Specify split settlement semantics, implement calculation independently of Zustand, and coordinate related persistence changes through an application use case. Use a database transaction when several records must change together.

**Likely areas:** `src/hooks/useExpenses.ts`, split types/UI, and transaction/split repositories.

**Exit condition:** repayment behavior is independently testable and persisted updates are consistent.

### Phase 6 — Unified deduplication

Specify duplicate semantics, then use the same policy for live processing and import. Keep repository-backed indexes/caches as optimizations.

**Likely areas:** `src/core/dedup/`, `src/database/expenseRepo.ts`, import processing in `SettingsScreen.tsx`, and ingestion use cases.

**Exit condition:** live and imported examples follow the same deduplication rules, including legitimate repeated purchases and invalidated records.

### Phase 7 — Explicit database migrations

Introduce ordered, versioned migrations and define supported upgrade paths. Keep database initialization, migration ordering, and row mapping in the infrastructure layer.

**Likely areas:** `src/database/db.ts`, repository row mappers, and database tests/fixtures.

**Exit condition:** fresh installs and supported old schemas converge predictably, with migration failures surfaced clearly.

### Phase 8 — Domain organization and dependency guardrails

After runtime ownership is stable, organize domain/application/infrastructure code by feature (transactions, splits, accounts, security, budgeting) and layer. Keep the parser as a focused subsystem. Leave screens and visual components for the planned UI replacement; add only narrow import conventions or lint checks that prevent observed dependency regressions.

**Exit condition:** domain/application/infrastructure ownership is findable and imports follow the intended dependency direction. Presentation restructuring is not required for this exit condition.

### Phase 9 — Documentation and future feature readiness

Keep the architecture diagram synchronized with runtime. For each new input (notification, receipt OCR, backup import), specify its adapter and route it through existing use cases. For multi-currency, evolve domain calculations and persisted representation before adding UI-only currency labels.

**Exit condition:** docs distinguish current implementation from roadmap, and new features have a known extension point.

## Cross-phase engineering practices

- Preserve behavior during structural moves; review functional changes separately.
- Define failure outcomes for filtering, parsing, duplicates, review, and persistence.
- Avoid logging raw SMS/notification text or unnecessary sender data.
- Keep parser examples sanitized and representative; link rule changes to their regression examples.
- Update `docs/ARCHITECTURE.md` and related docs after each implementation slice.
- Consult and refresh Graphify for structural changes, following repository workflow rules.
- Run verification during implementation as requested by the repository workflow and the task owner; this planning document itself does not execute tests.

## Decisions to record before implementation

1. **Decision policy:** Should parser confidence and classifier evidence feed one combined policy? Recommended: yes; only that policy decides accept/review/reject.
2. **Parser async behavior:** Are learning and AI fallback active production behavior now, or future capability?
3. **Deletion model:** When should transactions be invalidated/soft-deleted versus physically removed?
4. **Partial repayments:** Are partial split settlements a supported product behavior?
5. **Migration support:** Which installed schema versions must remain upgradeable?

Record answers in the Phase 1 document before the relevant implementation depends on them.
