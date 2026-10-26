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
  → src/services/transactions/transactionOrchestrator.ts
  → src/services/messaging/messageService.ts
  → src/core/parser/parseMessage.ts (legacy ParsedTransaction adapter)
  → src/services/transactions/transactionDecisionService.ts (candidate + policy input)
  → src/core/transactions/applicationUseCases.ts (shared application rules)
  → src/services/transactions/transactionApplication.ts (SQLite/service adapter)
  → SQLite through src/database/expenseRepo.ts
  → Zustand store in src/hooks/useExpenses.ts
  → screens
```

There are parallel paths for historical import in `SettingsScreen.tsx`, and for manual entry, edits, category changes, and split settlement through a mix of store actions, services, components, and repository calls. Consequently, “the transaction flow” is not one flow yet.

## Issue inventory

### 1. Two layers can influence the transaction decision

This was the pre-Phase-2 flow: `messageService` called `parseMessage()` and discarded parser confidence/`requiresConfirmation`, then `expenseService` independently decided auto-save, review, or discard. **Phase 2 status: closed for live ingestion and import preview.** They now use structured async parsing and one `decideTransaction()` policy that receives parser and classifier evidence and returns a typed result.

**Original risk, now addressed:** different decisions could occur and parser confirmation was ignored. Historical import final writes now use the shared chronological application operation. Dedup semantics differed at the Phase 3 checkpoint; Phase 6 has since unified them.

**Implemented:** `src/core/transactions/decisionPolicy.ts` is the sole reject/review/auto-save policy. It centralizes the current thresholds and returns reason/evidence data. Shared application use cases for final import/manual/edit writes were completed in Phase 3; their SQLite dependencies were routed through the repository port in Phase 4.

### 2. Processing and persistence are split among entry points

Originally, live input used `transactionOrchestrator.ts` while historical import, manual creation, edits, and review confirmation coordinated writes in separate places. **Phase 3 status: addressed for the scoped paths.** These entry points now delegate to application operations in `transactionApplication.ts` and `applicationUseCases.ts`; screens and Zustand remain adapters.

**Risk:** validation, confidence, deduplication, and error behavior can differ depending on how the transaction entered the app.

**Proposed fix:** create application use cases for live ingestion, batch import, manual creation, edit, confirmation, and invalidation/deletion. Input adapters may differ, but shared domain rules and write policy should not.

### 3. Database writes have multiple owners

`expenseService.saveExpense()` writes to SQLite; callers separately update Zustand. `useExpenses.ts` also writes directly for manual creation and edits. Some UI call sites use repository functions themselves.

**Risk:** a write can bypass a rule, or the in-memory list can disagree with SQLite after partial failure.

**Proposed fix:** route writes through application use cases and a transaction repository contract. The use case returns the persisted record; presentation state updates after success. Screens and components should not call transaction SQL or repository write functions.

### 4. Zustand contains domain behavior

`useExpenses.ts` owns state and still coordinates manual repayment matching, split settlement changes, and database updates. Matching itself is a pure planner and reads full split-bearing ledger data through the repository.

**Risk:** domain rules are hard to test without state/UI setup, and new transaction sources may not invoke the same rules.

**Proposed fix:** move split and repayment calculations into pure domain services and let an application use case coordinate the required repository operations. Keep Zustand responsible for presentation state and pending-review state.

### 5. Deduplication had multiple implementations and policies (resolved in Phase 6)

At the audit checkpoint, the repository had in-memory duplicate checks in `src/core/dedup`, SQL-based checks and an optional cache in `src/database/expenseRepo.ts`, and batch-specific cache use in `SettingsScreen.tsx`. Phase 6 replaced these decision paths with one shared policy; SQL and caches now return/index candidate rows only.

**Resolved risk:** live and import once could disagree, and broad amount/time matching could suppress legitimate repeats. Phase 6 now distinguishes definite from possible matches and keeps weak matches reviewable.

**Implemented in Phase 6:** normalized reference IDs match globally; normalized message text requires equal amount/type within five minutes; weaker amount/merchant/type/time matches require confirmation. Invalidated/duplicate rows do not suppress matches. Source metadata is retained, but does not change the approved matching semantics.

### 6. Parser capabilities and live usage do not fully align

Before Phase 2, live processing used the synchronous compatibility adapter and did not record parser correction learning. Live and import-preview paths now invoke `parseAsync()`, and explicit merchant/category corrections call `LearningEngine.learn()`. Phase 2 V2 implementation has added a typed proposal contract, context routing, settings capability, and a local llama.rn adapter. Extraction still runs synchronously; no verified model artifact is selected or wired, so runtime inference remains disabled.

**Remaining risk:** developers could mistake the AI interface for an active model, or assume parser extraction itself is asynchronous. Final import persistence is shared with the live/manual application operations, and Phase 6 has unified source-specific deduplication. Local AI inference remains separate Phase 2 work.

**Approved direction:** async parser invocation, correction learning, and local/offline AI fallback are product requirements. Async invocation and correction recording are wired to live processing/import preview and explicit edits. The Phase 2 V2 foundation is in progress; offline AI fallback remains incomplete until a specific runtime/model passes evaluation and is integrated with validated evidence and defined failure behavior. Do not describe inference as active meanwhile.

### 7. Domain and storage representations are too close

`ParsedTransaction`, `StructuredExpense`, database row shape, and the UI-facing `Expense` type overlap but are not the same contract. Adapters and callers perform conversions in multiple places.

**Risk:** adding fields such as currency, source metadata, or review status requires scattered changes and unsafe casts.

**Proposed fix:** define a domain transaction/candidate contract and keep parser, database, and UI conversions at their respective boundaries. Replace casts such as `as any` where migration makes it practical.

### 8. Database evolution needs explicit versioning

`src/database/db.ts` applies schema changes through a sequence of table creation and `ALTER TABLE` attempts rather than one clearly versioned migration history.

**Risk:** upgrades from older installs become difficult to reason about as features add tables and columns.

**Proposed fix:** use an explicit schema version and ordered migrations, with clear failure behavior and migration coverage from supported prior schemas.

### 9. Split repayment needs a domain-level correctness review

`applyRepaymentIfApplicable()` in `useExpenses.ts` matched incoming credits to pending splits and marked a row paid before confirming the full row fit within the remaining credit. This could over-settle. Phase 1 v2 added an immutable partial-allocation planner; the Phase 1 audit closure now queries all split-bearing ledger rows and atomically inserts live repayment credits with their split/link updates. Contact-wide settle/unsettle also query and update the full ledger transactionally.

**Remaining risks:** Phase 3 routes historical import through shared chronological repayment persistence. Phase 5 moved split rules out of Zustand and added exact allocation history for new repayments; legacy summary-only repayment mutations are guarded. Phase 6 has since unified import/live dedup semantics.

**Approved follow-up:** preserve partial allocation; move split operations into a dedicated domain/use-case boundary; route import through the shared chronological transaction path. The full-ledger query and live atomic-insert gaps were closed before Phase 2 integration. Keep UI redesign out of scope.

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

### Phase 1 v2 — Baseline, contracts, partial repayments, and presentation isolation

**Status: Complete.** Phase 1 v1 documented runtime and added initial atomic operations. Phase 1 v2 added partial split allocation and relocated the existing UI to `src/presentation/legacy/`; its audit then found and closed the full-ledger lookup and live repayment atomicity gaps while beginning Phase 2. Details and verification are in [Phase 1: Baseline and Contracts](./PHASE_1_BASELINE_AND_CONTRACTS.md), [Phase 2](./PHASE_2_TRANSACTION_DECISION_POLICY.md), and [the implementation log](./IMPLEMENTATION_CHANGELOG.md).

**Exit condition:** current behavior is mapped, key contracts and decisions are recorded, and any in-scope correctness defect has a regression case and a bounded fix.

### Phase 2 — One transaction decision policy & Local AI Hybrid Orchestration

**Direction approved; implementation in progress:** one policy consumes parser facts and classifier evidence, then returns reject, review, or auto-save with a reason. The live path and import preview now call it. See [Phase 2: One Transaction Decision Policy](./PHASE_2_TRANSACTION_DECISION_POLICY.md) for the core decision policy and [Phase 2 V2: Local AI Hybrid Orchestration](./PHASE_2_V2_LOCAL_AI_HYBRID_ORCHESTRATION.md) for typed model evidence, conservative context routing, local-only inference, verified artifact handling, and resource/quality gates.

**Likely areas:** `src/core/parser/ai/`, device capability services, `src/services/messaging/messageService.ts`, `src/services/transactions/`, and transaction tests.

**Exit condition:** one policy is authoritative, decisions are explainable, and a specific local model/runtime passes quality, privacy, platform, artifact-integrity, and resource gates with deterministic fallback behavior.

### Phase 3 — Shared application use cases

**Status: Complete.** The detailed scope, implementation result, constraints, and later-phase handoffs are in [Phase 3: Shared Application Use Cases](./PHASE_3_SHARED_APPLICATION_USE_CASES.md). Phase 2 remains in progress while its local/offline AI requirement is unresolved; it did not block Phase 3 from using the existing decision-policy contract.

Route live ingestion, historical import, manual creation, confirmation, edits, and invalidation/deletion through named use cases. Keep native event handling and batch progress in adapters/presentation, not in duplicated business flows.

This phase also brings historical imports through the shared repayment path. For example, an imported ₹400 repayment from Alex must reduce Alex's oldest outstanding split by ₹400 instead of inserting the credit while leaving the original full debt open. Process batch messages chronologically and keep deduplication idempotent.

**Implemented areas:** `src/services/transactions/`, `src/services/messaging/`, `src/presentation/legacy/screens/SettingsScreen.tsx`, `src/hooks/useMessageListener.ts`, and manual/edit adapters. See the Phase 3 implementation log for the file-by-file move.

**Exit condition:** every write-capable entry point uses an application use case; no screen independently reconstructs transaction processing.

### Phase 4 — Repository boundary and temporary presentation adapters

**Status: Complete.** Detailed contract scope, backup/reset semantics, implementation record, and later-phase boundaries are in [Phase 4: Repository Boundary](./PHASE_4_REPOSITORY_BOUNDARY.md).

At Phase 4 exit, the transaction repository port and SQLite adapter were implemented. Transaction, backup restore, reset, account deletion, split persistence, and maintenance writes went through repository-backed operations. Split calculations moved out of Zustand in Phase 5.

**Implemented areas:** `src/core/transactions/contracts.ts`, `src/core/transactions/applicationUseCases.ts`, `src/database/SQLiteTransactionRepository.ts`, `src/database/expenseRepo.ts`, `src/services/transactions/`, `src/hooks/useExpenses.ts`, and Settings/Accounts persistence wiring.

**Exit condition:** no active UI call site bypasses the application write boundary; existing UI state reflects successful use-case results. Visual and navigation changes are explicitly deferred.

### Phase 5 — Splits and repayment domain boundary

**Status: Complete.** Split settlement and repayment decisions now live in core application/domain operations. New repayment allocations carry exact links and reverse atomically; summary-only legacy repayment mutations are blocked as approved. Details and per-file changes are in [Phase 5: Split Settlement and Repayment Domain](./PHASE_5_SPLIT_REPAYMENT_DOMAIN.md) and the [implementation log](./IMPLEMENTATION_CHANGELOG.md#phase-5--split-and-repayment-domain-complete).

Partial repayment remains supported. Original split amounts stay intact while manual payment and exact repayment allocation totals are tracked separately. Linked row changes commit atomically.

**Likely areas:** `src/hooks/useExpenses.ts`, split types/UI, and transaction/split repositories.

**Exit condition:** repayment behavior is independently testable and persisted updates are consistent.

### Phase 6 — Unified deduplication

**Status: Complete.** The shared dedup policy, post-save notifications, file-level changes, and verification are in [Phase 6: Unified Transaction Deduplication](./PHASE_6_UNIFIED_DEDUPLICATION.md) and the [implementation changelog](./IMPLEMENTATION_CHANGELOG.md#phase-6--unified-deduplication-complete).

Use one pure policy for live processing, historical import/preview/commit, review confirmation, and maintenance dedup. Keep repository-backed indexes/caches as optimizations. After any transaction creation or explicit edit is persisted, notify the user with brief details through a shared notification adapter. Preserve legitimate repeated purchases and Phase 5 protections against invalidating settled transaction history.

**Likely areas:** `src/core/dedup/`, `src/database/expenseRepo.ts`, import processing in `SettingsScreen.tsx`, and ingestion use cases.

**Exit condition:** live and imported examples follow the same deduplication rules, including legitimate repeated purchases and invalidated records.

### Phase 7 — Explicit database migrations

**Status: Complete.** The versioned runner, supported legacy starting schema, rollback behavior, and verification are recorded in [Phase 7: Explicit Database Migrations](./PHASE_7_EXPLICIT_DATABASE_MIGRATIONS.md) and the [implementation log](./IMPLEMENTATION_CHANGELOG.md#phase-7--explicit-database-migrations-complete).

The app adopts its known pre-versioned schema as version 0 and migrates it additively. Unknown future versions and unrecognized legacy schemas fail clearly. Keep migration ordering and row mapping in the infrastructure layer.

**Likely areas:** `src/database/db.ts`, repository row mappers, and database tests/fixtures.

**Exit condition:** fresh installs and supported old schemas converge predictably, with migration failures surfaced clearly.

### Phase 8 — Domain organization and dependency guardrails

**Status: Complete.** The detailed audit, implementation record, dependency boundaries, and verification are in [Phase 8: Domain Organization and Dependency Guardrails](./PHASE_8_DOMAIN_ORGANIZATION_AND_DEPENDENCY_GUARDRAILS.md).

Organize domain/application/infrastructure code only where ownership is clear. Keep the parser focused and leave screens and visual components for the planned UI replacement. Address observed layer inversions and add narrow import rules; avoid a speculative feature-folder rewrite.

**Exit condition:** domain/application/infrastructure ownership is findable and imports follow the intended dependency direction. Presentation restructuring is not required for this exit condition.

### Phase 9 — Documentation and future feature readiness

**Status: Complete (documentation-only).** See the [Phase 9 plan and completion record](./PHASE_9_DOCUMENTATION_AND_FUTURE_FEATURE_READINESS.md). The current-facing docs were reconciled with runtime behavior; deferred UI coupling and the native notification bridge remain documented seams.

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

1. **Decision policy:** Approved: parser confidence and classifier evidence feed one policy, which alone decides accept/review/reject.
2. **Parser async behavior:** Approved active behavior: live/import parsing, user correction learning, and AI fallback. Preserve offline/on-device behavior; the existing AI resolver has no inference handler, so a local model/runtime must be selected and integrated.
3. **Deletion model:** When should transactions be invalidated/soft-deleted versus physically removed?
4. **Partial repayments:** Approved and implemented in Phase 1 v2 using cumulative split allocations.
5. **Migration support:** Which installed schema versions must remain upgradeable?

Record the remaining deletion and supported-schema decisions before their respective implementation phases.
