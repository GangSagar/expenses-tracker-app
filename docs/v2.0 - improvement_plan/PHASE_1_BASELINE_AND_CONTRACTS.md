# Phase 1: Baseline, Contracts, and Urgent Correctness Fixes

## Purpose

Phase 1 prepares the app for safe restructuring. It establishes what the app actually does today, identifies the behavior that must be preserved, defines the small set of contracts later phases will use, and fixes only verified correctness defects that could corrupt ledger data or make the migration unsafe.

This phase is not a wholesale refactor. It should produce a reviewable baseline and bounded changes, then hand off a clear implementation path to the next phase: consolidating the transaction decision policy.

## UI scope

The existing UI is expected to be replaced. Phase 1 will not redesign it, adjust its visual system, or reorganize screen/component files. It will trace enough UI call sites to identify transaction operations and their current owners. Existing screens and Zustand state may be used as temporary adapters; only small wiring changes needed for a verified correctness fix or an application boundary are in scope. The plan is to make transaction behavior independent of the current presentation so a future UI can call the same use cases.

## Why this phase comes first

The current architecture has multiple paths for live messages, historical import, manual entry, edits, and split settlement. The parser exposes richer output than the active adapter uses, and persistence calls are spread across services, the store, and UI. Without a baseline, a structural change could silently change whether a transaction is discarded, reviewed, saved, duplicated, or settled.

The docs also need to describe observed runtime rather than only the intended design. Phase 1 therefore records current behavior before deciding which behavior should change.

## Goals

- Map each transaction entry and mutation path from source to persistence and UI state.
- Record the actual decision logic currently used for each path.
- Identify duplicate ownership and direct-write call sites.
- Define minimal, stable domain-facing contracts for candidates, outcomes, and persistence.
- Verify potentially serious correctness concerns, especially split partial repayment behavior.
- Fix a bug in this phase only when it is reproducible, materially affects correctness/data integrity, and can be addressed without broadening the architectural scope.
- Update documentation to separate active behavior from partial or planned behavior.

## Out of scope

- Reorganizing the whole source tree.
- Replacing all service/store/database code at once.
- Changing parser heuristics or auto-save thresholds without a documented behavior decision.
- Activating learning or AI fallback merely because the interfaces exist.
- Adding a generic plugin framework or introducing architectural layers without a concrete use.
- Adding future features such as receipt OCR, cloud backup, or multi-currency.
- Redesigning, restyling, or comprehensively refactoring the existing UI/screens/navigation.

## Workstream A: Runtime behavior inventory

Trace and record these flows, including their failure cases:

1. Live SMS event.
2. Live notification event.
3. Pending native messages received after app startup.
4. Historical import/sync from Settings.
5. Manual transaction creation.
6. Auto-saved transaction persistence and state update.
7. Review queue and user confirmation/category selection.
8. Edit, invalidation, and deletion.
9. Split creation and repayment settlement.

For each flow, record (this is a call-path inventory, not a request to change presentation):

- Entry point and source payload.
- Normalization and filtering applied.
- Parser and classifier functions called.
- Decision thresholds or validation rules used.
- Duplicate check and its data source.
- Database writes and transaction boundaries.
- Zustand state update and failure behavior.
- User-visible result.

**Initial files to inspect/update:**

- `src/hooks/useMessageListener.ts`
- `src/services/transactionOrchestrator.ts`
- `src/services/messageService.ts`
- `src/services/expenseService.ts`
- `src/core/parser/parseMessage.ts`
- `src/core/parser/orchestrator/ParserOrchestrator.ts`
- `src/screens/SettingsScreen.tsx`
- `src/hooks/useExpenses.ts`
- `src/components/CategoryPopup.tsx`
- `src/database/expenseRepo.ts`
- `src/database/db.ts`
- `docs/APP_MESSAGE_LISTENER_FLOW.md`
- `docs/ARCHITECTURE.md`

**Deliverable:** a verified flow diagram and a path matrix in the architecture docs or this file. Do not infer that a module is active merely because it exists or is described in documentation.

### Observed path matrix

| Operation | Current path | Current policy / persistence owner | Phase 1 observation |
|---|---|---|---|
| Live SMS | `useMessageListener` → `orchestrateTransaction` → `processIncomingMessage` → `parseMessage` → `processTransaction` → `saveExpense` → store `addExpense` → optional `planAutomaticRepayment` and atomic split/link update | Filters/parser adapter in `messageService`; decision in `expenseService`; initial insert/dedup in `saveExpense`; repayment plan in pure planner; repayment persistence in repository; state in Zustand | Parser confidence/review metadata is adapted to the older `ParsedTransaction` shape before the expense service's separate thresholds decide the route. Repayment matching uses currently loaded expenses. |
| Live notification | Same listener and orchestrator as live SMS | Same as live SMS, except sender allowlist is applied only to SMS | Both sources share downstream processing, but only SMS gets the sender allowlist check. |
| Pending native messages | `useMessageListener` fetches JSON from `MessageModule.getPendingMessages()` and calls the same `processMessage` used for live events | Same as live event | Pending fetch and live subscription overlap; the hook checks mounted state after fetch but does not cancel the native request. |
| Historical import | `SettingsScreen` → `processIncomingMessage` → dedup cache → `processTransaction` → preview → direct `insertExpense` | Import screen owns the loop, cache, preview, and direct persistence | It shares filtering and the old transaction decision function, but does not use `transactionOrchestrator`/`saveExpense` for the final write. Its decision skips `discard`, then checks duplicates through a separate cache. It still does not run repayment matching. |
| Manual creation | Screens/modal → Zustand `addManualExpense` → pure `planAutomaticRepayment` → `insertExpenseWithRepayment` when a plan exists; otherwise direct insert | Store remains the temporary coordinator; planner calculates; repository commits expense and old split updates atomically | The pure planner is immutable. Manual repayment and related split updates now commit together. |
| Review/confirmation | Listener queues pending item; `CategoryPopup` confirms and calls save logic | Zustand pending queue + popup/service | The pending item is not persisted until confirmation. The current category UI wiring is temporary and out of UI scope. |
| Edit/category change | `EditTransactionModal` or `CategoryPopup` → Zustand action and/or `saveExpense` | Store and some component/service callers | There are multiple write routes; no single application use case owns updates yet. |
| Invalidate/delete | UI → Zustand `invalidateExpense`/`deleteExpense` → repository | Zustand action | SQL is reached through the store, but policy and state coordination live in the presentation store. |
| Split settlement | `SplitsScreen` → Zustand settle/toggle methods → repository update | Zustand action | Manual settle/unsettle/toggle still live in Zustand. Automatic repayment matching has moved to the pure planner, but the full split use case remains future work. |

This matrix records current ownership; it does not prescribe a UI rewrite. Existing screen/store call sites remain temporary adapters.

### Current behavior baseline

These are code-path behaviors, not product recommendations:

| Condition | Current behavior |
|---|---|
| SMS sender fails transactional sender check | `processIncomingMessage()` returns `null` before parsing. The sender check is skipped for notification/manual sources. |
| Body blocked by transaction filter or classified as spam | `processIncomingMessage()` returns `null`; the active path does not expose a typed rejection reason to the caller. |
| Parser fails or extracts no amount | `parseMessage()` returns a compatibility object with `amount: null`; message processing rejects it. |
| Amount exists and confidence is below `0.5` | `processTransaction()` returns a `discard` outcome. |
| Confidence is at least `0.5` and below `0.8` | Outcome is `show_popup`; listener queues the candidate for confirmation. |
| Confidence is at least `0.8` | Outcome is `auto_save`; listener calls `saveExpense()`, then inserts the saved ID into Zustand only when a non-null ID is returned. |
| Live duplicate | `saveExpense()` loads recent expenses from the preceding five minutes and applies reference/token or same-amount/merchant/type matching. `null` means duplicate or save failure. |
| Historical import duplicate | Settings builds a database cache and checks reference ID, exact raw text, then equal amount in a 15-minute timestamp window. |
| Live database insert throws | `saveExpense()` enqueues a retry and starts a flush, but returns `null`; the live listener does not add the eventual retry insert to Zustand in that branch. |
| Parser async fallback/learning | `parseAsync()` is defined, but the traced message and import paths use synchronous `parseMessage()`. The learning engine is passed to resolvers, while no correction-recording call was found in the traced user edit/category paths. |

Observed difference: live and import deduplication are not equivalent. These thresholds and rules should be preserved as baseline facts until the later policy phase deliberately changes them.

## Workstream B: Behavior and policy baseline

Capture representative sanitized examples and expected outcomes for:

- Valid debit and credit messages.
- Unknown merchant or bank.
- Low-confidence/ambiguous parse.
- OTP, promotion, balance-only, and non-transaction messages.
- Duplicate reference ID and duplicate raw body.
- Same amount on separate legitimate transactions.
- Imported message that already arrived through live ingestion.
- Manual transaction without message text.
- Parser failure and persistence failure.
- Split repayment, including a payment smaller than a pending split if partial payment is intended.

Record current behavior independently from desired behavior. Mark any proposed behavior change so it can be reviewed explicitly. Preserve provenance and privacy: use sanitized fixtures and do not copy personal SMS or account identifiers into docs.

## Workstream C: Contract decisions

Define or agree on the following concepts before Phase 2:

### Transaction candidate

Represents extracted facts before the application decides whether to save them. It should include the normalized amount/currency, merchant, direction, account/bank/payment details when available, timestamp, source, parser confidence/signals, raw message handling policy, and parser/config version as needed. It should not include a database ID or UI-specific modal state.

### Processing outcome

Represents the application decision in an explicit form, such as:

```text
rejected(reason)
duplicate(matching transaction reference or reason)
needs_review(candidate, reason)
saved(transaction)
failed(stage, safe error information)
```

The final outcome shape can be smaller, but it must distinguish filtering, review, duplicate, persistence failure, and success. Avoid using `null` for all of these states.

### Repository boundary

Define the minimum transaction persistence operations needed by use cases. Keep SQL and database row shape inside the adapter. Decide whether split updates require a separate repository or a transaction-scoped operation.

### Parser and classifier authority

Record whether parser confidence and classifier results are inputs to one policy, or one remains informational. Recommended direction: both may contribute signals, but one application policy owns the final reject/review/save decision.

### Async parser capabilities

Decide whether live and imported paths should use `parseAsync()` and whether learning/AI fallback is active behavior. If not active, mark it partial/planned and do not make Phase 1 silently change runtime behavior to use it.

### Phase 1 contract artifact

`src/core/transactions/contracts.ts` now defines the presentation-independent transaction boundary types:

- `TransactionCandidate`: a transaction-shaped value without a persisted ID.
- `TransactionProcessingOutcome`: explicit rejected, duplicate, needs-review, saved, and failed outcomes.
- `TransactionRepository`: the minimal insert/update/find-by-ID port for future application use cases.
- `PersistedTransaction`: an expense with a required numeric database ID.

These contracts are intentionally not wired into the live flow in Phase 1. The SQLite adapter and use cases will adopt them in later phases; this avoids coupling the baseline step to a broader runtime migration. The repository interface is synchronous to match the current SQLite adapter and should be revisited if persistence technology or execution model changes.

## Workstream D: Bug triage and bounded fixes

### Confirmed architectural defects to fix later, not necessarily as Phase 1 bug fixes

- Multiple live/import/manual entry paths can bypass shared rules.
- Decision signals are split between parser and expense service.
- Write ownership is spread across repository, service, store, and UI.
- Repayment rules are coupled to Zustand.

These are structural issues and should be handled in their planned phases unless one is causing a concrete user-data bug that needs immediate containment.

### Correctness concern requiring reproduction

The previous `applyRepaymentIfApplicable()` marked a matched split paid before verifying that its entire amount fit the remaining credit. This contradicted the whole-row, oldest-first, amount-bounded behavior described in `docs/TRD.md`. It also persisted related split/link writes separately. The over-settlement and partial-write paths are now corrected for live and manual creation. Partial payment of one split remains unsupported because `ExpenseSplit` cannot represent residual balances.

Also verify that multiple split/expense updates are consistent on failure, and that a failed database write cannot leave an in-memory-only settlement presented as saved.

**Phase 1 disposition:** the existing product model and TRD describe whole split rows with an oldest-first settlement scan bounded by the received credit. Partial settlement is not representable in `ExpenseSplit`, so automatic matching now settles only full rows that fit within the incoming credit and does not skip an unaffordable older row to settle a newer one. Any leftover credit remains an ordinary credit rather than being recorded as a partial debt settlement. Supporting partial repayment of a split remains future work and requires a richer ledger representation.

The previous implementation marked a row paid before checking whether its full amount fit the remaining credit. It could therefore settle more debt than the repayment covered. `planAutomaticRepayment()` now produces an immutable whole-row plan. Manual credit insertion plus prior split updates are committed in one SQLite transaction; live credit-link updates plus prior split updates are also atomic. If the live linking transaction fails, the already-inserted credit remains visible without the repayment link and prior split rows remain unchanged.

### Fix-in-phase rule

Include a bug fix in Phase 1 only if all are true:

1. The problem is reproduced or clearly demonstrated from the current code and intended product behavior.
2. It can create incorrect ledger state, data loss, or block the baseline/migration.
3. The fix has a bounded scope and a regression case.
4. The behavior change is documented and is not hidden inside a structural move.

Defer cosmetic issues, parser accuracy improvements, broad refactors, and behavior changes without an agreed product rule. Track them in the issue inventory for the appropriate phase.

## Expected code touch points if implementation work is approved

This section is a likely map, not a mandate to modify every file:

| Area | Likely files | Phase 1 handling |
|---|---|---|
| Live ingestion | `src/hooks/useMessageListener.ts`, `src/services/messageService.ts`, `src/services/transactionOrchestrator.ts` | Trace and document; make a small correction only if required for a verified correctness defect |
| Parser boundary | `src/core/parser/parseMessage.ts`, parser models/orchestrator | Document active sync/async usage; define candidate contract; avoid behavior changes pending policy decision |
| Import path | `src/screens/SettingsScreen.tsx` | Trace direct processing/writes and document differences; no wholesale migration yet |
| Store and repayment | `src/hooks/useExpenses.ts`, `src/core/transactions/repaymentPlanner.ts` | Extracted an immutable, pure oldest-first whole-split planner; the store applies its result only after atomic persistence succeeds |
| Persistence | `src/database/expenseRepo.ts`, `src/database/db.ts` | Added focused SQLite transaction operations for repayment split updates plus manual credit insertion or live credit linking; schema versioning remains Phase 7 |
| Docs | `docs/ARCHITECTURE.md`, `docs/APP_MESSAGE_LISTENER_FLOW.md`, this file | Update actual flow, decisions, and known gaps |
| Regression coverage | `src/__tests__/transactionRepayment.test.ts`, `src/__tests__/expenseRepo.test.ts` | Added coverage for whole-row oldest-first planning, insufficient credit, immutability, atomic commit, and rollback |

## Implementation sequence

1. Re-check the current tree and applicable workspace rules before implementation.
2. Trace each entry and mutation path using call sites and the current graph; verify graph freshness before relying on it.
3. Write the path matrix and current behavior examples.
4. Reproduce split over-settlement and apply the documented whole-row rule; triage any other data-integrity issue found.
5. Record the transaction candidate, processing outcome, repository boundary, decision authority, and async parser decisions.
6. Implement only bounded correctness fixes discovered by steps 2–4, with focused regression coverage.
7. Update architecture/message-flow documentation to describe reality and mark partial/planned features.
8. Review the resulting docs and code diff before starting Phase 2.

## Acceptance criteria

- Every transaction input and mutation path listed above has an owner and a documented route.
- Current behavior is distinguishable from desired future behavior.
- Parser, classifier, and confidence responsibilities are recorded without implying an unresolved choice is already implemented.
- The split repayment concern has an explicit whole-row settlement rule; partial split settlement remains deferred.
- The over-settlement bug is bounded, documented, and covered by regression cases; related writes are transactionally grouped.
- No architectural rewrite has been smuggled into a bug fix.
- Docs do not claim that inactive parser learning/AI behavior is part of the live pipeline.
- A developer can review Phase 1 results and make the remaining Phase 2 policy choice without needing to rediscover the current flow.

## Risks and safeguards

| Risk | Safeguard |
|---|---|
| Baseline work becomes a rewrite | Keep Phase 1 deliverables focused on flow, contracts, verified bugs, and docs |
| Existing behavior is mistaken for desired behavior | Record both separately and mark proposed changes |
| A real data bug is deferred because it is “refactor work” | Apply the fix-in-phase rule to ledger correctness and data integrity |
| A suspected bug is changed without product semantics | Verify intended behavior first; record unresolved decision explicitly |
| Raw financial data leaks into planning artifacts | Use sanitized examples and safe logging practices |
| Tests expand into unrelated cleanup | Add only focused regression coverage for approved bug fixes/contracts during implementation |

## Decisions to record

Current evidence and recommendations:

- **Combined decision policy:** pending Phase 2 approval. Recommended: parser confidence and classifier evidence feed one policy, and that policy alone decides reject/review/save.
- **Learning and AI fallback:** the active message path uses synchronous `parseMessage()`; `parseAsync()` is not on the traced live/import path. Async fallback/learning are not active on these paths until usage is deliberately added.
- **Partial split repayments:** not supported by the current boolean-only split model. Automatic settlement only applies whole rows that fit the repayment amount. Partial settlement remains a future product/data-model decision.
- **Deletion semantics:** both exist in code: soft invalidation and hard deletion. Product policy for each operation remains to be recorded before centralizing writes.
- **Supported database upgrade versions:** current migration code uses best-effort sequential `ALTER TABLE` calls and has no explicit schema version. Record this as the migration baseline; versioned migration work is Phase 7.
- **Representative input cases:** parser, filtering, dedup, classifier, and orchestrator examples already exist across `src/__tests__/parser.test.ts`, `src/__tests__/filter.test.ts`, `src/__tests__/dedup.test.ts`, `src/__tests__/classifier.test.ts`, and `src/__tests__/transactionOrchestrator.test.ts`; Phase 1 records their current decision thresholds above rather than duplicating raw message fixtures in docs.
- **Phase 1 correctness fixes implemented:** prevented automatic settlement from marking whole split rows paid when the incoming credit cannot cover them; preserved oldest-first order; added atomic rollback for manual repayment insertion and live repayment-link writes. Regression coverage is in `src/__tests__/transactionRepayment.test.ts` and `src/__tests__/expenseRepo.test.ts`.

## Phase 1 completion record

Phase 1 is complete for the agreed baseline/contracts scope. The candidate/outcome/repository contracts are in `src/core/transactions/contracts.ts`; this document records active flow ownership and policy behavior. Parser confidence authority remains a deliberate Phase 2 decision. The async parser and learning fallback remain unused by live/import processing. Versioned database migrations, full deduplication consolidation, repayment use-case extraction, and UI replacement are not Phase 1 work. See the [implementation log](./IMPLEMENTATION_CHANGELOG.md) for the file-by-file record and remaining work for every phase.

Verification performed for this phase:

- `npm test -- --runInBand src/__tests__/transactionRepayment.test.ts src/__tests__/expenseRepo.test.ts` — passed (2 suites, 10 tests).
- `npx tsc --noEmit` — passed.
- `npx eslint` on the changed TypeScript implementation and tests — passed.
- Graphify code graph refreshed. The semantic document extraction attempt reported connection failures; code AST extraction completed.

## Handoff to Phase 2

Phase 2 should begin only after the baseline and the decision-authority question are clear. Its goal is to implement one transaction decision policy and route the active live path through it while preserving explicitly agreed behavior. It should not also move all UI, repository, split, and migration responsibilities; those are separate phases in [Architecture Restructuring: Issues and Proposed Plan](./ARCHITECTURE_RESTRUCTURING_PLAN.md).
