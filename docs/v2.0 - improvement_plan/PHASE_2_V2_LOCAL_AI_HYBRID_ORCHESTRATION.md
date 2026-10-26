# Phase 2 V2: Local AI Hybrid Orchestration and Model Selection

**Status: In progress.** The approved implementation has added the typed proposal boundary, conservative context routing, validated evidence merging, model preference storage, a digest-verified app-private artifact installer, and a local llama.rn adapter. The parser accepts an explicitly injected engine, but production supplies no engine. No model artifact has passed selection/evaluation gates, so inference is not enabled in production. This plan covers the outstanding local/offline AI requirement carried forward from Phase 2. It does not reopen completed transaction-policy, application-use-case, repository, deduplication, or migration work.

## Purpose and boundaries

The current parser has an `IAIResolver` seam and an in-memory cache, but no inference handler or model runtime is configured. `parseAsync()` currently allows AI to enrich merchant, category, and confidence. AI is not active in production. This phase will activate a local inference path while keeping regex/parser output useful when models are missing, disabled, too slow, incompatible, or return invalid data.

There is one authoritative transaction decision policy. A model may propose extraction evidence; it must never decide whether a transaction is saved, reviewed, or rejected, write to the ledger, or bypass deduplication and application use cases.

Model inference and message processing remain on-device. Network access is allowed only for an explicitly requested model artifact download from a verified source. Raw messages, sender identifiers, and derived financial data must not be sent to a remote inference endpoint or included in model-download telemetry.

The app-wide requirement to report unexpected errors to customer support is cross-cutting work, not AI inference work. The selected delivery mode is a secure backend forwarding to `hrnharshit1@gmail.com`; the backend is not yet implemented or configured. This phase must not send email directly from parser/model code. AI failures should use the same future centralized reporter as other app errors, with a sanitized error summary, component/screen, and named user-action breadcrumbs where relevant. Do not include model input/output or financial/message content. Model failures still fall back locally and must not block transaction processing. See the [app-wide reporting plan](./APP_WIDE_SUPPORT_ERROR_REPORTING_PLAN.md).

## Scope decisions

- **Extraction contract:** AI returns a typed, field-level extraction proposal. It may propose amount, currency, direction, merchant, category, and reference only when that model supports the relevant fields. It does not produce a persistence outcome.
- **Deterministic evidence:** Preserve parser facts and their provenance. Do not replace a valid high-confidence deterministic amount, currency, or direction silently. If a proposal conflicts on a financially material field, retain the deterministic value and mark the candidate for review through the shared policy.
- **Confidence:** Do not raise global confidence using `max(parserConfidence, modelConfidence)`. Track confidence and provenance per proposed field, validate the proposal, then pass combined evidence to the existing decision policy. Only that policy can return accept/review/reject.
- **Execution context:** Callers explicitly identify live background processing, foreground interaction, or historical import. Unknown context is treated conservatively as background; heavy generation is skipped and the deterministic result proceeds to the existing policy.
- **Background safety:** Heavy generative inference is disabled for background message ingestion in the initial release. Device capability checks are advisory and cannot guarantee that the OS will keep a process alive. A low-RAM or unavailable profiler must never cause a missed transaction; use deterministic parsing and review instead.
- **UI scope:** No new screen, model catalogue UI, large modal, visual redesign, or navigation change. Keep model preferences behind an application-facing settings capability. If a user control is needed in the current UI to expose model selection, limit it to a small control in the existing Settings screen; defer richer management UI to replacement-UI work.
- **Platforms:** Shared contracts and fallback behavior work on Android and iOS. A runtime is enabled only on platforms where its native engine is implemented and verified. Android-only system AI is optional; unsupported platforms use deterministic parsing and review.
- **Persistence:** Store model preferences through the existing settings capability. Do not add a new table unless a concrete metadata requirement cannot fit the current settings boundary; any schema change must be an appended, transactional migration under Phase 7 rules.

## Current contracts and required extension

The legacy `AIResolutionResult` contains `merchant`, `category`, `confidence`, optional `reasoning`, and `timestamp`. It cannot represent amount, currency, direction, reference, field-level confidence, or conflict evidence. Phase 2 V2 now provides a separate validated proposal contract and an injectable parser boundary. The legacy resolver no longer raises parser confidence; production composition does not yet inject a model engine, and no candidate artifact has passed evaluation.

Proposed core types (names may be refined during implementation, but semantics are required):

```ts
export type ParseExecutionContext =
  | 'live_background'
  | 'foreground_interaction'
  | 'historical_import'
  | 'unknown';

export interface FieldEvidence<T> {
  value: T;
  confidence: number;
  source: 'deterministic' | 'local_model' | 'user_correction';
}

export interface AIExtractionProposal {
  amount?: FieldEvidence<number>;
  currency?: FieldEvidence<string>;
  transactionType?: FieldEvidence<'debit' | 'credit'>;
  merchant?: FieldEvidence<string>;
  category?: FieldEvidence<Category>;
  referenceId?: FieldEvidence<string>;
  conflicts: Array<'amount' | 'currency' | 'transactionType' | 'merchant' | 'category' | 'referenceId'>;
  modelId: string;
  modelVersion: string;
}
```

The parser validates finite positive amounts, supported currency/type/category values, bounded text, and model output schema before merging evidence. It records invalid output as an inference failure and keeps deterministic facts. If required facts remain absent or a material conflict exists, the shared decision policy must send the candidate to review; model confidence alone cannot authorize auto-save.

The AI adapter receives message content in memory and returns a proposal. It has no transaction repository, database, UI, or notification dependency. Cache keys must not store raw message text; cache remains bounded and in-memory unless a separate privacy review approves another retention policy.

## Model evaluation and catalog

The names below are **evaluation candidates only**, not selected dependencies or verified compatibility claims. No fixed download size, RAM use, latency, accuracy, OS reach, or “safe device” claim is accepted until measured on supported app devices and tied to a specific model artifact, quantization, runtime, and version.

| Candidate task | Candidate family | Evaluation question |
|---|---|---|
| Merchant/category enrichment | Compact embedding/classification model | Does it improve the existing merchant/category resolver on a held-out, sanitized corpus without increasing harmful false classifications? |
| Entity extraction | Compact token-classification model | Does it improve a specific missing field while preserving deterministic amount/direction evidence? |
| Structured fallback | Small instruction model | Does its validated field proposal improve review outcomes enough to justify model size, load time, latency, and battery use? |
| System-provided inference | Platform-specific on-device API | Is the API available under the app’s target OS/runtime and distribution constraints, and can it meet the same privacy and fallback contract? |

Before selecting any candidate, record its exact artifact/version, license and redistribution terms, source URL, cryptographic digest, supported platforms/ABIs, measured package/storage footprint, peak memory, cold/warm latency, battery/thermal observations, and fixture evaluation. Remove any candidate that cannot be downloaded from a trusted source or whose license does not permit the intended use.

Avoid claims such as “zero hallucination,” “zero background crash risk,” universal device support, or zero resource use. Similarity models can misclassify; system inference still consumes app/system resources; and available-memory readings are snapshots, not guarantees.

## Runtime architecture and ownership

```text
message/import caller
        │ supplies ParseExecutionContext
        ▼
ParserOrchestrator.parseAsync()
        ├── deterministic parser ──► baseline StructuredExpense
        ├── policy-gated local model orchestration
        │       └── validated AIExtractionProposal (no persistence decision)
        ├── merge field evidence / record conflicts
        ▼
transactionDecisionService ──► existing TransactionDecisionPolicy
        └── shared application use case ──► repository

src/core/parser/ai/                  interfaces, proposal validation, routing rules
src/core/settings/                   preference contract
src/infrastructure/ai/               model engine and verified artifact manager
src/infrastructure/native/            device capability and platform-native adapters
src/services/ai/                      capability-facing service, if orchestration needs one
src/app/composition/                  concrete adapter and preference wiring
src/infrastructure/persistence/sqlite/ settings adapter (reuse current settings port)
```

Core owns contracts and deterministic orchestration decisions. Native/platform libraries and model files stay in infrastructure. Keep capability files grouped under `services/ai/` if a service facade is needed; do not add a general-purpose file directly under `src/services/`. Dependency construction remains in the composition root. No parser or model engine writes directly to SQLite.

## Model preferences and artifact lifecycle

Preferences must support: AI enabled/disabled, selected model IDs, and per-model availability. The default for a fresh install is **AI disabled until the user explicitly enables it**. A model that is not installed, supported, or healthy is treated as unavailable; deterministic parsing continues.

If an artifact is downloaded:

1. Require an explicit user action and disclose artifact size and network use using verified metadata.
2. Use HTTPS and an allowlisted publisher/source; verify a pinned cryptographic digest or signature before loading.
3. Enforce expected size and supported format; write to a temporary app-private path and atomically promote only after validation.
4. Support cancellation, interrupted-download recovery, insufficient-storage handling, versioned replacement, and user-triggered deletion.
5. Never execute or load an unverified artifact. Do not auto-download, auto-update, or silently delete a selected model.
6. Keep artifact download errors separate from transaction persistence outcomes. They must not delay or block ledger processing.

System-provided runtimes do not use the app artifact manager, but must expose availability, version/capability checks, timeout behavior, and the same local-only data boundary.

## Execution routing and limits

- `live_background`: deterministic parse first; only a separately verified fast model may run under a measured, strict budget. The initial safe default is no model call for this context. If inference is skipped or fails, preserve deterministic output and let the shared decision policy handle review/save.
- `foreground_interaction`: a selected and ready local model may run within a model-specific budget and an overall request deadline. UI responsiveness must not depend on a heavy model; cancellation or timeout returns the deterministic candidate.
- `historical_import`: process messages in the existing chronological shared-application path. Model failure for one row must not reorder or prevent other rows; existing partial success and deduplication semantics remain authoritative.
- `unknown`: use deterministic parsing only and preserve review behavior.

Unexpected model/runtime errors should be reported through the app-wide error-reporting capability once that cross-cutting feature is implemented. Do not report expected parser outcomes such as a rejected non-transaction message, review decision, duplicate, disabled model, or unsupported device as app errors. Error-report delivery failure must remain best-effort and must not alter transaction outcomes.

Do not hard-code the earlier generic 1,500 ms timeout. Benchmark each supported engine, set a per-model timeout and an overall context budget, and test both. A timeout race does not stop native inference by itself; adapter cancellation/unload behavior must be verified. Prevent overlapping loads/inferences from exceeding the measured memory budget. A model may be skipped or unloaded when the app is backgrounded, memory pressure is reported, or the engine is busy.

## Implementation sequence

1. **Baseline and candidate evaluation:** capture sanitized representative cases and current parser/policy decisions; benchmark a small candidate set on supported Android and iOS device tiers. Select only the smallest set with measured benefit. If no candidate meets quality/resource gates, keep AI disabled and report the phase incomplete rather than claiming support.
2. **Contracts and configuration:** add execution context, field-level proposal/provenance, validation, compatibility metadata, model preference contract, and test fakes. Preserve existing call behavior with a deterministic default for callers that do not yet provide context.
3. **Verified infrastructure adapters:** implement one selected runtime first; add device profiling as advisory capability; add artifact download/verification only if that runtime requires downloadable weights. Keep platform-specific implementations separately owned.
4. **Composition and parser integration:** wire selected adapters at `src/app/composition/`, pass explicit context from live and import call paths, merge only validated proposals, and send evidence through the existing transaction decision policy.
5. **Minimal user control:** expose enable/model choice through the existing settings capability and only the smallest necessary control in the current Settings screen. No new screen, model catalogue, warning modal, or redesign. If current Settings cannot expose a safe control without a broader UI change, keep the capability API ready and defer the control to replacement-UI work; do not silently enable a model.
6. **Verification and handoff:** run proposal validation, parser parity, policy, context routing, platform adapter, artifact lifecycle, timeout/cancellation, and import-order tests. Record exact model/version/device results and update the implementation changelog and current architecture docs.

## Verification and acceptance criteria

1. AI is disabled by default; unavailable/disabled/error/timeout/cancel paths preserve deterministic parsing and do not block persistence of a separately accepted transaction.
2. The model returns only a typed proposal. It cannot write data, invoke notifications, or choose reject/review/save.
3. Invalid JSON, non-finite/non-positive amount, unsupported currency/type/category, overlong strings, and unsupported fields are rejected safely.
4. Every merged field records its source and confidence. A conflict in amount, currency, or direction is never silently overwritten and routes through the shared decision policy with review required.
5. Model confidence cannot independently increase a candidate to auto-save. Existing parser thresholds and policy tests remain authoritative.
6. Context routing is explicit and tested for live background, foreground interaction, historical import, and unknown context. Heavy generation does not run for background input in the initial release.
7. Timeout and cancellation are measured per supported engine. Tests prove late model results cannot overwrite a fallback result or cause duplicate application writes.
8. Candidate quality is measured against a held-out sanitized fixture set with field-level precision/recall and regression comparison against deterministic parsing. Set numeric release gates from the baseline before selecting a production model; do not invent performance or accuracy claims in advance.
9. Downloaded artifacts are allowlisted, integrity-checked, versioned, installed atomically, cancellable, and removable. Failure leaves the previous usable model (if any) and transaction workflow intact.
10. Android and iOS behavior is explicitly recorded. Unsupported platform/runtime combinations fall back to deterministic parsing and review without build-time or runtime crashes.
11. Tests verify no raw message/sender values are emitted to telemetry or logs by AI/model code; the model cache does not persist raw messages.
12. Existing shared decision policy, application use cases, deduplication, repayment ordering, repository boundary, and migrations remain unchanged unless a separately reviewed migration is necessary.

## Out of scope and handoffs

- Replacement UI and comprehensive model-management screens.
- Cloud inference, remote parsing APIs, or sending message content off-device.
- Training/fine-tuning a model on user messages or uploading corrections.
- Changing transaction save/review thresholds or the shared decision policy as a side effect of model confidence.
- Reworking historical-import ordering, deduplication, repayment logic, transaction persistence, or completed migrations.
- Adding an unverified catalog of model specifications as user-facing promises.

The replacement UI can later use the model preference/settings capability without changing parser, decision, or persistence workflows. Any future change to transaction storage must follow the Phase 7 migration process. Phase 2 V2 is complete only when a specific model/runtime has passed the quality, privacy, platform, artifact integrity, and resource gates above; otherwise the documented outcome is that deterministic fallback remains active and AI support is still incomplete.
