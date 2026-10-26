# Phase 2: One Transaction Decision Policy

**Implementation status: In progress.** The pure policy, typed input evidence, async live path, import-preview policy call, full-ledger repayment query, and atomic live repayment insert are implemented. The approved local AI inference runtime remains missing; see [Remaining work](#remaining-work).

**Status update after Phase 3:** shared application operations now own final live/import/manual/review/edit/invalidation/delete workflows. The Phase 2 checkpoint and historical rollout notes below record the state before that migration. The local AI inference requirement remains the only Phase 2 implementation gap.

## Purpose

Phase 2 gives one application policy sole ownership of the business outcome for a transaction candidate: reject, send for review, or accept for automatic saving. Parser confidence and classifier evidence must reach this policy intact. The policy must explain its outcome with stable reason codes and must not persist transactions or update presentation state.

This is a decision-boundary phase. It does not attempt to move every transaction source into shared use cases, unify duplicate detection, replace SQLite, or redesign the UI. Those are separate phases in the architecture roadmap. The existing screen and Zustand paths remain adapters while the active live-message flow is migrated.

## Approved decisions and constraints

- One policy owns reject/review/auto-save outcomes.
- Parser confidence and classifier evidence are inputs to that policy. Neither parser adapters, services, hooks, nor screens make a competing final decision.
- Async parsing, correction learning, and AI fallback are approved behavior requirements. Fallback inference must run locally/offline. `parseAsync()` currently wraps synchronous parsing and has no default inference handler, so invoking it alone does not meet the AI requirement.
- Keep the existing UI under `src/presentation/legacy/`; Phase 2 makes no visual or navigation redesign.
- Preserve established live-message behavior initially. Any changed decision must be intentional, covered by a fixture, and recorded in the change log.
- Deduplication and persistence are processing concerns after the decision, not responsibilities of the decision policy. A policy result of “accept” means eligible to save, not that a database write has succeeded.

## Phase 1 audit and carry-forward gates

The audit surfaced gaps that affected Phase 2 and later work. The first five are now closed; the local AI runtime remains open:

| Finding | Resolution | Remaining boundary |
|---|---|---|
| The live adapter lost parser evidence and Phase 1 contracts mixed decisions with persistence results. | The live path now uses structured async parsing; the pure `TransactionDecision` receives parser confidence, breakdown, confirmation, and classifier evidence. Persistence outcomes are a separate type. | Generic repository wiring was completed in Phase 4. |
| Repayment matching used only the current 30-day Zustand window. | `getExpensesWithSplits()` queries all split-bearing, non-duplicate ledger rows. Automatic/manual repayment and contact-wide settle/unsettle use this full data set. | Split domain ownership was completed in Phase 5. |
| A live credit could persist before repayment linking failed. | Credit insert plus split allocations now run through one SQLite transaction. A failed operation returns an explicit persistence failure and leaves no unlinked credit. | Shared application use-case ownership was completed in Phase 3; repository injection was completed in Phase 4. |
| Filters could drop inputs without a policy outcome. | `processIncomingMessage()` returns typed rejection signals; the same policy produces the reasoned reject decision. | Phase 3 now owns final historical-import persistence through the shared use case. |
| Correction learning and async parser use were inactive in the production path. | Live ingestion and import preview now call `parseAsync()`; explicit merchant/category corrections call `LearningEngine.learn()`, which parser resolvers read from the same SQLite-backed mapping repository. | Local AI inference has no runtime/handler and remains inactive. |

These closures do not move historical import writes into the decision policy. Phase 3 routed final imports through shared chronological use cases; Phase 6 has since unified live/import duplicate semantics in a separate pure policy.

## Current live decision path after the Phase 2 implementation

1. `useMessageListener` enqueues live/pending messages in arrival order so asynchronous enrichment does not reorder repayment credits.
2. `messageService.processIncomingMessage()` normalizes input, collects sender/body/spam/parse rejection signals, and calls `parseStructuredAsync()`.
3. `expenseService.processTransaction()` maps the full `StructuredExpense`, category classifier evidence, and compatibility score into one `TransactionDecisionInput` and invokes `decideTransaction()` exactly once.
4. `useMessageListener` executes the policy result: reject is logged with a stable reason, review is queued, and auto-save calls persistence.
5. For accepted credits, the transaction application operation queries all split-bearing ledger rows through `TransactionRepository` and commits credit insertion with repayment updates through the SQLite adapter. Duplicate/save failure remains a processing result, not a policy decision.
6. Settings import preview uses the same parser and decision policy. Phase 3 owns chronological batch persistence through the shared application use case; at that checkpoint import and live dedup differed, and Phase 6 has since unified them.

The legacy thresholds remain `0.5` reject-below and `0.8` auto-save-at-or-above. Parser confidence below `0.5` rejects; `requiresConfirmation` forces review. Classifier category source is evidence, while its compatibility score preserves the established threshold behavior.

## Target responsibility split

```text
native message adapter
  → normalize and collect source/filter evidence
  → async parser returns structured parse result
  → candidate mapper preserves parser facts and classifier evidence
  → TransactionDecisionPolicy returns reject | review | auto-save + reason
  → current orchestrator executes that decision
      ├─ reject: return a typed rejection
      ├─ review: enqueue the candidate for confirmation
      └─ auto-save: invoke the existing save path and report save success/failure
```

The policy is a pure, deterministic module. It does not import React Native, Zustand, SQLite, UI types, telemetry, or native APIs. Its input includes the normalized candidate plus explicit evidence; its output describes only the decision. The orchestrator remains responsible for executing the decision. Later phases will consolidate those execution paths.

### Decision output

Use a dedicated discriminated union, conceptually:

```ts
type TransactionDecision =
  | { kind: 'reject'; reason: RejectionReason; evidence: DecisionSummary }
  | { kind: 'review'; reason: ReviewReason; evidence: DecisionSummary }
  | { kind: 'auto_save'; reason: AutoSaveReason; evidence: DecisionSummary };
```

Reason codes should be stable machine-readable values; display copy belongs to the presentation adapter. The decision summary should retain policy version, parser version, normalized confidence inputs, and the matched rule/threshold without storing extra raw message text. Do not put `duplicate`, `saved`, or `persistence_failed` in this union. Those describe processing after the policy has decided.

## Policy inputs and proposed default behavior

The policy should receive explicit evidence rather than recomputing parser and classifier work:

- Parse result: success or typed failure (for example, no amount), not `null` with lost cause.
- Candidate facts: amount, normalized/display merchant, transaction direction, timestamp, source, account/payment details, reference, and parser/config version.
- Parser evidence: overall confidence, component breakdown, `requiresConfirmation`, and any typed ambiguity/validation signals.
- Classifier evidence: category and category source (`merchant_map`, `keyword`, `default`); spam/transaction evidence and sender/body filter results as separate fields.
- Context: source type and policy version/configuration. The policy should not fetch from stores or repositories.

The first policy release should preserve current filter meaning and the live legacy thresholds as a compatibility baseline, then use parser confirmation and classifier evidence as explicit rules. A parser `requiresConfirmation` signal must never be silently discarded. The policy should not blindly average the parser score with the legacy score: their inputs overlap (amount, merchant, action words), and double-counting can make weak evidence appear strong. If calibrated weights or threshold changes are proposed, compare them against a fixed corpus and record the expected decision differences before rollout.

At minimum, the rule ordering must be explicit and tested:

1. Invalid input, blocked sender/body, spam, or a parse result without a usable amount yields a rejection with a reason.
2. Ambiguous/low-confidence candidates or parser-required confirmation yield review unless a documented hard rejection rule applies.
3. Only candidates that satisfy the configured auto-save threshold and have no review-required signal yield auto-save.
4. Threshold boundaries are exact and tested. Preserve `0.5` and `0.8` as the baseline for the legacy score unless corpus evaluation documents a deliberate change. Account for parser confirmation's current `0.75` default; do not combine threshold values implicitly.

This ordering is the implementation proposal for Phase 2. The test corpus and decision-diff review are required before merging code that changes any currently observed route.

## Async parser, learning, and AI status

The live and import-preview paths now call `ParserOrchestrator.parseAsync()` and preserve the returned `StructuredExpense` through the policy. `parseAsync()` still runs extraction synchronously, then may await AI fallback. Async orchestration is active; the extraction engine itself is not asynchronous and AI inference is not operational.

Explicit user merchant/category corrections now call `LearningEngine.learn()`, and parser resolvers read the same SQLite-backed merchant mapping repository. AI remains inactive in the app. Three upstream checkpoints have been smoke-tested on the developer host, but they are not registered in app composition and have not passed task-quality gates. Before enabling local fallback inference:

- Integrate the ONNX and GGUF runtime adapters behind the existing model-selection seam and `IAIResolver`; no network inference or hidden cloud fallback.
- Package tokenizer/config/model files as verified installable artifacts and populate the app catalog only with final, pinned model paths and hashes.
- Define timeout, cancellation, cache key, no-result/error behavior, and whether a failed fallback preserves the original parse result.
- Keep offline parsing functional if the local model is unavailable or disabled.
- Test that AI enrichment can update candidate facts but cannot independently choose reject/review/auto-save.

A local runtime is an approved product requirement. Native runtime packages are present, and base model files exist only in the developer's Git-ignored workspace; no production model adapter is registered or bundled with the app. Keep this requirement incomplete rather than substituting a rule-based mapper and calling it AI.

## Scope

### In scope

- Create the pure decision policy and typed evidence/result contracts.
- Convert active live processing to preserve structured parser evidence and invoke exactly one policy.
- Turn early filter/parser failures into typed evidence/outcomes that can be explained to callers.
- Remove final reject/review/auto-save thresholds from `expenseService.ts` and listeners after their call sites migrate.
- Keep persistence, duplicate detection, queue management, telemetry, and UI presentation in current adapters/orchestrator.
- Add regression fixtures for current live decisions and boundary cases, plus policy reason-code tests.
- Update Phase 1 carry-forward notes, architecture flow, and implementation changelog.

### Out of scope

- Full shared use cases for historical import, manual creation, editing, confirmation, or deletion (Phase 3).
- Unifying duplicate semantics (Phase 6).
- Replacing the repository/SQLite adapter or introducing schema migrations (Phases 4 and 7).
- Moving all split behavior out of Zustand (Phase 5). Full-ledger repayment lookup is already implemented and must be preserved by later use cases.
- UI redesign, visual changes, or a navigation rewrite.
- Rewriting parser heuristics unrelated to decision ownership.

## Expected code and documentation changes

| File / area                                                                                  | Intended change                                                                                                                                                            | Boundary to preserve                                                                                                                       |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/core/transactions/contracts.ts`                                                       | Split candidate/parser evidence, `TransactionDecision`, and later processing outcomes; mark old broad outcome/repository draft clearly or replace with compatible types. | Do not represent “accepted” as persisted. Keep parser-specific structures behind a mapper where useful, but preserve every policy input. |
| `src/core/transactions/decisionPolicy.ts` (new)                                            | Implement the single pure policy, reason codes, rule order, and version/config injection.                                                                                  | No framework, DB, Zustand, telemetry, or mutable global threshold reads.                                                                   |
| `src/core/parser/parseMessage.ts`, parser models/orchestrator                              | Expose typed parse result needed by live policy and use `parseAsync()` from the live pipeline.                                                                           | Keep parser focused on extraction/enrichment; it does not decide persistence or UI route.                                                  |
| `src/services/messaging/messageService.ts`                                                 | Return normalized input plus sender/filter/spam/parse evidence instead of silently reducing every failure to `null`.                                                     | Keep sender/source adaptation here; do not add separate accept/review/save rules.                                                          |
| `src/services/transactions/expenseService.ts`, `transactionDecisionService.ts`            | Map structured parser facts plus classifier outputs into policy inputs; remove its independent threshold decision.                                                         | Category classification can enrich category evidence, but only the policy emits the final decision.                                        |
| `src/services/transactions/transactionOrchestrator.ts`                                     | Invoke the policy once and execute reject/review/auto-save result through existing adapters.                                                                               | Do not turn the orchestrator into a forwarding wrapper; do not claim this solves Phase 3 source unification.                               |
| `src/hooks/useMessageListener.ts`                                                          | Adapt typed outcomes to current pending queue/save behavior.                                                                                                               | No decision thresholds in the listener. Preserve the current visible behavior for baseline fixtures.                                       |
| Parser/orchestrator/policy tests                                                             | Add structured fixtures, threshold boundary cases, reason cases, and route parity checks.                                                                                  | Include no-amount, blocked sender/body, spam, parser confirmation, category evidence, and save failure after auto-save decision.           |
| `docs/APP_MESSAGE_LISTENER_FLOW.md`, architecture/plan, Phase 1 record, implementation log | Update flow, in-scope gaps, decisions, and exact files changed.                                                                                                            | Distinguish policy decisions from persistence outcomes and future import/split work.                                                       |

This list describes intended ownership. Confirm actual callers with `rg` before deleting compatibility functions or moving code.

## Test and decision-parity plan

Before implementation, capture a deterministic set of representative inputs from existing tests and sanitized messages: clear debit, clear credit, low confidence, review-level confidence, high confidence, unknown merchant, known mapped merchant, blocked sender, OTP/login/promotion, spam, missing amount, and parser `requiresConfirmation` cases. Record the current outcome, parser confidence/breakdown, legacy score, classifier result, and intended Phase 2 outcome.

Required tests:

1. Unit tests for every policy rule and reason code.
2. Exact boundary tests below/at/above each configured threshold, including parser confirmation at `0.75` and current legacy thresholds `0.5` and `0.8`.
3. A test proving parser confidence and `requiresConfirmation` survive mapping into policy inputs.
4. A test proving the category classifier's category source is evidence, not an independent final decision.
5. Tests proving sender/body/spam/parser failures return typed rejection decisions instead of disappearing as unexplained `null`.
6. Parity tests comparing the baseline and proposed outcome for each fixture; any intentional difference gets an explicit expected-result assertion and documentation.
7. An orchestration test proving exactly one policy invocation per candidate and that `auto_save` followed by DB failure is reported as persistence failure, not as policy rejection or successful save.
8. A review-path test proving the candidate queues once and does not persist before confirmation.
9. Async tests for local fallback success, no result, thrown error, timeout/disabled runtime, and preservation of the original parse when enrichment fails.
10. Learning tests that confirm corrected values are recorded after an explicit user correction and are subsequently visible to the parser resolver. Do not claim this test passes until the correction hook is connected.

Run focused tests, TypeScript, changed-file lint, then the full test suite per repository instructions. Record full-suite results and any existing repository-wide lint failures distinctly.

## Rollout and migration sequence

1. Map current policy call sites and freeze the parity fixture set.
2. Define typed `ParseResult`, `DecisionEvidence`, and `TransactionDecision` without changing runtime decisions.
3. Implement the policy as a pure module and unit-test it directly.
4. Adapt the active live path to async structured parsing and typed early exits; preserve all evidence.
5. Route the live path through the policy exactly once; remove old decision branches only after `rg` proves no remaining caller depends on them.
6. Wire accepted/review/rejected outcomes to existing save and pending-queue adapters; model persistence failure separately.
7. Integrate or explicitly gate local AI fallback and correction learning; never silently enable network behavior.
8. Run parity suite, inspect every changed decision, update architecture/flow docs and the implementation log.

Do not migrate Settings historical import into a parallel Phase 2 path. Phase 3 should make it call the same application use case/policy and add chronological repayment behavior.

## Exit criteria

- One pure policy is the only source of reject/review/auto-save outcomes in the active live transaction path.
- The live path retains structured parser confidence, breakdown, confirmation flag, classifier evidence, and typed filter/parse failures until the policy runs.
- No policy result is mislabeled as a successful database write; persistence errors are represented separately.
- Existing live fixtures preserve their baseline outcome unless each difference is intentionally approved and documented.
- There are no duplicated decision thresholds in listeners/services after migration; all remaining call sites are inventoried and explicitly assigned to Phase 3 or later.
- Async parser behavior is actually invoked in the live path. Learning and local offline AI are either integrated and verified or explicitly recorded as incomplete requirements; neither is falsely described as active.
- Phase 1's 30-day visibility and live-link failure gaps are closed. Phase 3/5 must preserve the all-ledger query and atomic live insertion as the import and split boundaries are migrated.
- Tests, typecheck, docs, Graphify, and changelog accurately reflect the delivered work.

## Remaining work

- Integrate a supported on-device/offline inference runtime behind `IAIResolver`, or keep fallback disabled and record the requirement as incomplete. Do not add network inference.
- Define timeout/cancellation and runtime-unavailable behavior when the local model is selected.
- The sanitized `sms-samples.json` parity corpus currently produces no decision differences from the legacy confidence thresholds. Keep this fixture suite and add collected production examples when extending the policy.
- Split use-case ownership was completed in Phase 5; Phase 6 has since completed dedup unification.

## Handoff

Phase 3 routed live input, historical import, manual creation, confirmation, edits, invalidation, and deletion through shared application use cases. Imported rows are processed chronologically through shared repayment persistence. Source-specific dedup behavior was unified in Phase 6; the Phase 2 decision contract remains the single parsed-message policy.
