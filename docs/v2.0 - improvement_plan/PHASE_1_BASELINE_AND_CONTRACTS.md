# Phase 1 v2: Baseline, Contracts, and Ledger Correctness

## Purpose

Phase 1 prepared the app for safe restructuring. It established observed behavior, identified preservation requirements, and delivered bounded correctness fixes. Its initial transaction outcome contract proved too broad and was corrected while beginning Phase 2; the generic repository port remains future work.

This phase is not a wholesale refactor. It establishes the baseline, implements the revised partial-repayment behavior, isolates the existing UI as a replaceable adapter, and hands off the approved transaction-policy and parser activation requirements to later phases.

## UI scope

The existing UI is expected to be replaced. Phase 1 v2 relocates existing presentation files to a dedicated legacy location but does not redesign screens, adjust the visual system, or change navigation behavior. Existing screens and Zustand state remain temporary adapters. Transaction behavior stays outside the presentation folder so a future UI can call the same use cases.

Current UI files now live in `src/presentation/legacy/` to isolate future presentation changes. This is a location change only; screens, styling, navigation behavior, and visual design were not redesigned. Keep transaction rules and persistence outside that folder.

## User decisions for Phase 1 v2

- Partial repayments are supported. Preserve the original split amount and record cumulative `paidAmount`; calculate outstanding balance as `amount - paidAmount`. Apply repayments oldest-first and allow the final allocation to partially pay a split.
- One transaction decision policy will own reject/review/save outcomes. Parser confidence and classifier evidence are inputs to that policy.
- Async parser behavior, correction learning, and AI fallback are intended active behavior. Production fallback must remain on-device/offline. The current `AIResolver` has no default inference handler, so activating `parseAsync()` alone will not provide inference; a local inference implementation must be evaluated and integrated in the appropriate parser/use-case phase.
- Historical import should eventually use the shared transaction path, including repayment matching. Its current direct insert path can record a repayment credit without reducing the corresponding split balance.
- Keep the current UI operational in `src/presentation/legacy/`; do not redesign it. Future UI work should be contained there or in a replacement presentation module without moving domain workflows into screens.

### Historical import example

If Alex owes 1,000 and a historical credit message records a 400 repayment, Settings currently parses and inserts the credit directly. It does not run automatic repayment matching, so the original split continues to report 1,000 outstanding. Routing the imported credit through the shared transaction use case would allocate 400 to Alex's oldest outstanding split, leaving 600. The batch path must process messages in timestamp order and use the same deduplication and repayment rules as live input; otherwise import order or overlap with live messages can produce inconsistent balances. This is Phase 3 work, not a reason to rebuild the Settings UI.

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
- Implementing learning or AI fallback before a real correction path and local inference runtime are identified; approved activation is handed off to the parser/use-case phases.
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
- `src/services/transactions/transactionOrchestrator.ts`
- `src/services/messaging/messageService.ts`
- `src/services/transactions/expenseService.ts`
- `src/core/parser/parseMessage.ts`
- `src/core/parser/orchestrator/ParserOrchestrator.ts`
- `src/presentation/legacy/screens/SettingsScreen.tsx`
- `src/hooks/useExpenses.ts`
- `src/presentation/legacy/components/CategoryPopup.tsx`
- `src/database/expenseRepo.ts`
- `src/database/db.ts`
- `docs/APP_MESSAGE_LISTENER_FLOW.md`
- `docs/ARCHITECTURE.md`

**Deliverable:** a verified flow diagram and a path matrix in the architecture docs or this file. Do not infer that a module is active merely because it exists or is described in documentation.

### Observed path matrix

This matrix is the Phase 1 entry-state snapshot, before the Phase 2 work recorded below and in the implementation log. It is retained to show what Phase 1 discovered; use the current flow in [APP_MESSAGE_LISTENER_FLOW.md](../APP_MESSAGE_LISTENER_FLOW.md) and the Phase 2 specification for active behavior.

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

### Phase 1 entry behavior baseline

The following table records behavior observed before the Phase 2 implementation. It is historical baseline evidence, not a description of the current live decision path.

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

## Workstream C: Contracts and recorded decisions

The following contracts and product decisions are recorded for the next phases:

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

Approved: parser confidence and classifier evidence feed one transaction decision policy, and that policy alone owns reject/review/save outcomes. Implement the policy in Phase 2.

### Async parser capabilities

Approved: live and imported paths should activate async parsing, correction learning, and AI fallback. Keep inference on-device/offline. The existing resolver has no default inference handler; selecting and integrating an actual local inference runtime is required before describing AI inference as operational.

### Phase 1 contract artifact

`src/core/transactions/contracts.ts` initially defined presentation-independent transaction types:

- `TransactionCandidate`: a transaction-shaped value without a persisted ID.
- `TransactionProcessingOutcome`: persistence outcomes (duplicate, saved, failed), separate from the policy decision.
- `TransactionRepository`: the minimal insert/update/find-by-ID port for future application use cases.
- `PersistedTransaction`: an expense with a required numeric database ID.

The Phase 1 v2 contract was a draft. Phase 2 replaced the mixed decision/result union with a pure `TransactionDecision`, preserved parser and classifier evidence, and kept persistence outcomes separate. `TransactionRepository` remains a future infrastructure port; SQLite still uses direct repository functions until Phase 4.

## Phase 1 carry-forward audit and closure

The Phase 1 review found the following gaps. The first four were closed while beginning Phase 2, before connecting the policy to the live path:

| Finding | Resolution | Remaining boundary |
|---|---|---|
| Draft contract mixed policy decisions with processing outcomes and omitted parser evidence. | Phase 2 now has a typed, pure `TransactionDecision`; full parser confidence/breakdown/confirmation and classifier evidence reach it. Persistence returns saved/duplicate/failed separately. | The generic repository port is still unwired and remains Phase 4 work. |
| Repayment planning read the 30-day Zustand window. | Added `getExpensesWithSplits()` and routed automatic/manual repayment planning plus contact-wide settle/unsettle through the full split-bearing ledger. | Split domain ownership remains in the store until Phase 5. |
| Live credit could persist before repayment linking failed. | Automatic credit save now plans from all outstanding splits and inserts the repayment credit plus split updates in one SQLite transaction. On failure, the transaction rolls back and the caller receives an explicit persistence failure. | Application use-case ownership remains Phase 3/4 work. |
| Live parsing dropped parser evidence; correction learning was not connected. | Live and import preview now call `parseAsync()` and send structured parser evidence through one policy. Explicit merchant/category corrections feed `LearningEngine`, whose SQLite repository is also read by parser resolvers. | There is still no default local AI inference runtime; AI fallback remains inactive and must not be claimed active. |

At the Phase 1 audit checkpoint, historical import still used its own preview/dedup/direct-insert loop and did not apply repayment allocations. Phase 3 has since moved final import writes through shared use cases and processes the batch chronologically. Phase 6 still owns unifying the differing live/import duplicate semantics.

## Workstream D: Bug triage and bounded fixes

### Confirmed architectural defects to fix later, not necessarily as Phase 1 bug fixes

- Multiple live/import/manual entry paths can bypass shared rules.
- Decision signals are split between parser and expense service.
- Write ownership is spread across repository, service, store, and UI.
- Repayment rules are coupled to Zustand.

These are structural issues and should be handled in their planned phases unless one is causing a concrete user-data bug that needs immediate containment.

### Correctness concern requiring reproduction

The previous repayment helper marked a matched split paid before verifying that its entire amount fit the remaining credit. This over-settled debts. It also persisted related split/link writes separately. Phase 1 v1 corrected whole-row over-settlement and atomicity, but did not satisfy the later product decision to support partial repayments. Phase 1 v2 replaces that interim policy with cumulative `paidAmount` allocations.

Also verify that multiple split/expense updates are consistent on failure, and that a failed database write cannot leave an in-memory-only settlement presented as saved.

**Phase 1 v2 disposition:** a split keeps its original `amount` and stores cumulative `paidAmount`. Legacy rows without `paidAmount` start at zero unless `isPaid` is already true. Repayment allocation walks the matched contact's unpaid splits oldest-first, applies up to each remaining amount, and can partially pay the final split reached. `isPaid` becomes true when the outstanding amount reaches zero. Repeated repayments add to `paidAmount` without exceeding the original amount.

`planAutomaticRepayment()` produces an immutable partial-allocation plan. Automatic/manual repayment planning reads all split-bearing, non-duplicate ledger rows rather than the 30-day presentation window. Manual credit insertion and prior split updates commit in one SQLite transaction. Live accepted-credit insertion and its split/link updates also commit in one transaction; failure rolls back both and returns an explicit persistence failure. The split ledger displays the remaining balance while retaining the original amount for transaction history.

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
| Live ingestion | `src/hooks/useMessageListener.ts`, `src/services/messaging/messageService.ts`, `src/services/transactions/transactionOrchestrator.ts` | Trace and document; make a small correction only if required for a verified correctness defect |
| Parser boundary | `src/core/parser/parseMessage.ts`, parser models/orchestrator | Document active sync/async usage; define candidate contract; avoid behavior changes pending policy decision |
| Import path | `src/presentation/legacy/screens/SettingsScreen.tsx` | Trace direct processing/writes and document differences; no wholesale migration yet |
| Store and repayment | `src/hooks/useExpenses.ts`, `src/core/transactions/repaymentPlanner.ts`, `src/types/expense.ts` | Added cumulative partial-allocation planning, a backward-compatible `paidAmount` field, and store settlement actions that synchronize paid amounts |
| Persistence | `src/database/expenseRepo.ts`, `src/database/db.ts` | Added focused SQLite transaction operations for repayment split updates plus manual credit insertion or live credit linking; schema versioning remains Phase 7 |
| Docs | `docs/ARCHITECTURE.md`, `docs/APP_MESSAGE_LISTENER_FLOW.md`, this file | Update actual flow, decisions, and known gaps |
| Regression coverage | `src/__tests__/transactionRepayment.test.ts`, `src/__tests__/expenseRepo.test.ts` | Covers partial allocation, repeated repayment, FIFO order, legacy split compatibility, immutability, atomic commit, and rollback |
| Presentation relocation | `src/presentation/legacy/{screens,components,styles,navigation}/`, `App.tsx`, import callers | Moved current presentation files into one isolated location and rewrote relative imports without changing layout or behavior |

## Implementation sequence

1. Re-check the current tree and applicable workspace rules before implementation.
2. Trace each entry and mutation path using call sites and the current graph; verify graph freshness before relying on it.
3. Write the path matrix and current behavior examples.
4. Reproduce split over-settlement and implement cumulative partial allocation; triage any other data-integrity issue found.
5. Record the transaction candidate, processing outcome, repository boundary, decision authority, and async parser decisions.
6. Implement only bounded correctness fixes discovered by steps 2–4, with focused regression coverage.
7. Update architecture/message-flow documentation to describe reality and mark partial/planned features.
8. Review the resulting docs and code diff before starting Phase 2.

## Acceptance criteria

- Every transaction input and mutation path listed above has an owner and a documented route.
- Current behavior is distinguishable from desired future behavior.
- Parser, classifier, and confidence responsibilities are recorded without implying an unresolved choice is already implemented.
- Partial payments preserve original amounts, accumulate on the split, and update displayed outstanding balances.
- The over-settlement bug is replaced by a tested partial-allocation rule; related writes are transactionally grouped.
- No architectural rewrite has been smuggled into a bug fix.
- Docs do not claim that inactive parser learning/AI behavior is part of the live pipeline.
- A developer can review Phase 1 results and use the approved Phase 2 policy specification without needing to rediscover the current flow.

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

- **Combined decision policy:** implemented in Phase 2; parser confidence and classifier evidence feed the single policy that decides reject/review/auto-save.
- **Async parsing and correction learning:** active in live processing and import preview. Explicit merchant/category corrections feed the learning repository used by parser resolvers.
- **AI fallback:** approved as an active product requirement and restricted to local/offline inference, but not yet active. `AIResolver` has no default inference handler and no local runtime/model is installed.
- **Partial split repayments:** approved and implemented in Phase 1 v2 using cumulative `paidAmount` with legacy `isPaid` compatibility.
- **Deletion semantics:** both exist in code: soft invalidation and hard deletion. Product policy for each operation remains to be recorded before centralizing writes.
- **Supported database upgrade versions:** current migration code uses best-effort sequential `ALTER TABLE` calls and has no explicit schema version. Record this as the migration baseline; versioned migration work is Phase 7.
- **Representative input cases:** parser, filtering, dedup, classifier, and orchestrator examples already exist across `src/__tests__/parser.test.ts`, `src/__tests__/filter.test.ts`, `src/__tests__/dedup.test.ts`, `src/__tests__/classifier.test.ts`, and `src/__tests__/transactionOrchestrator.test.ts`; Phase 1 records their current decision thresholds above rather than duplicating raw message fixtures in docs.
- **Phase 1 v2 correctness fixes implemented:** automatic repayment preserves FIFO allocation, supports repeated partial payments, and atomically writes split updates with manual inserts/live repayment links. Regression coverage is in `src/__tests__/transactionRepayment.test.ts` and `src/__tests__/expenseRepo.test.ts`.

## Phase 1 v2 completion record

Phase 1 v2 implemented partial repayment accounting and relocated the existing UI at `src/presentation/legacy/` without visual redesign. During Phase 2 startup, the audit gaps in parser evidence, full-ledger repayment lookup, and atomic live repayment persistence were closed. The policy, async parser invocation, and correction learning are now active; local AI fallback and shared historical-import writes remain incomplete. See the [Phase 2 specification](./PHASE_2_TRANSACTION_DECISION_POLICY.md) and [implementation log](./IMPLEMENTATION_CHANGELOG.md) for the current status.

Verification performed for this phase:

- `npm test -- --runInBand` — passed (26 suites, 623 tests).
- `npx tsc --noEmit` — passed.
- ESLint on the changed implementation, moved presentation tree, and repayment tests — passed after removing two pre-existing unused bindings in relocated files. The repository-wide lint command still reports unrelated existing issues elsewhere in the repository/build output.
- Graphify code graph refreshed after the final code changes.

## Handoff to Phase 2

Phase 2's policy direction is approved: implement one decision policy that combines parser confidence and classifier evidence. See the [Phase 2 specification](./PHASE_2_TRANSACTION_DECISION_POLICY.md). Phase 2 should not also move import, all repository, and database migration responsibilities; those remain separate phases in [Architecture Restructuring: Issues and Proposed Plan](./ARCHITECTURE_RESTRUCTURING_PLAN.md).
