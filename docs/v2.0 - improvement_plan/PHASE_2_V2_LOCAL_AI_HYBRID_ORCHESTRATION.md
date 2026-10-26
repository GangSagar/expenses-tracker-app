# Phase 2 V2: Local and Opt-in Cloud Model Orchestration

**Status: Paused by the owner; resume later.** Implemented so far: typed proposal validation and parser boundary; a digest-verified artifact installer with a strict 100,000,000-byte exclusive limit; multi-model inventory; per-task intent/category/extraction assignments with legacy single-selection migration; a runtime selector seam; and a minimal model library screen. The Hugging Face app catalog is intentionally empty until the owner supplies fine-tuned artifact paths and verified metadata. Three upstream base checkpoints have been downloaded to Git-ignored `data/models/` and smoke-tested one at a time on the development host; these tests do not activate inference in the app or establish expense-task quality. Concrete adapters are not yet registered in production. The selected checkpoints and remaining one-run sequence are documented below. The private unlabeled device corpus remains a parser behavior baseline, not an accuracy measure. This plan does not reopen completed transaction-policy, application-use-case, repository, deduplication, or migration work.

## Purpose and boundaries

The parser has a proposal contract and local-runtime adapter, but no inference engine is wired into production. The proposal may add validated extraction evidence; it cannot make a transaction decision. This phase will add explicitly selected local or cloud inference while keeping deterministic parsing useful when inference is not selected, unavailable, too slow, incompatible, or returns invalid data.

There is one authoritative transaction decision policy. A model may propose extraction evidence; it must never decide whether a transaction is saved, reviewed, or rejected, write to the ledger, or bypass deduplication and application use cases.

Local inference and normal message processing remain on-device. Network access can be used for a user-requested model download or, when the user explicitly chooses a cloud provider and initiates a foreground operation, to send only the required parsing request. Raw messages, sender identifiers, and derived financial data must never be included in model-download telemetry or error reports. Do not send the local device export to cloud providers for evaluation.

The app-wide requirement to report unexpected errors to customer support is cross-cutting work, not AI inference work. The selected delivery mode is a secure backend forwarding to `hrnharshit1@gmail.com`; the backend is not yet implemented or configured. This phase must not send email directly from parser/model code. AI failures should use the same future centralized reporter as other app errors, with a sanitized error summary, component/screen, and named user-action breadcrumbs where relevant. Do not include model input/output or financial/message content. Model failures still fall back locally and must not block transaction processing. See the [app-wide reporting plan](../APP_WIDE_SUPPORT_ERROR_REPORTING_PLAN.md).

## Scope decisions

- **Extraction contract:** AI returns a typed, field-level extraction proposal. It may propose amount, currency, direction, merchant, category, and reference only when that model supports the relevant fields. It does not produce a persistence outcome.
- **Provider choice:** Give the user explicit modes: deterministic parsing only, an installed local model, or a named cloud provider. Default to deterministic parsing until the user chooses and enables a model. Never switch from local to cloud automatically after an error or low-confidence result; deterministic parsing and the shared review policy remain the fallback.
- **Cloud privacy and execution:** A cloud provider receives message text and possibly deterministic parser context, so require explicit opt-in and a clear disclosure before any data leaves the device. Run cloud inference only after a foreground user action, never for background SMS ingestion or silent imports. Do not send the device export to providers for evaluation. Use synthetic or separately consented, sanitized examples for cloud tests.
- **Cloud credential ownership:** Never embed a developer-owned provider API key in the mobile app. Before implementing cloud adapters, choose either a secure backend proxy (developer owns provider billing, authentication, quotas, and abuse controls) or bring-your-own-key (the user owns provider billing and key setup; store the key only in OS secure storage). Keep this as an explicit architecture decision; the selected secure backend for support-email delivery does not automatically authorize using that backend as an inference proxy.
- **Provider neutrality:** Each local or cloud adapter implements the same proposal-only engine contract and returns the existing validated evidence shape. Provider-specific prompts, request formats, errors, and model names stay in infrastructure adapters. The transaction policy, repository, and decision outcomes remain provider-independent.
- **Local artifact limit:** Every downloadable local model must have a verified artifact size strictly below 100 MB. Record exact bytes and digest. Treat peak RAM, runtime overhead, context cache, latency, quality, and thermal behavior as separate gates; a small file does not guarantee low runtime memory or adequate extraction quality.
- **User model library:** The user can browse a catalog, explicitly install more than one compatible local model, assign one installed model per task slot, switch/clear assignments, and remove unassigned models. Installation never starts automatically. Keep catalog and library operations in application/service capabilities so the future UI can change without changing parser, download, or inference workflows. Unload before loading a different runtime by default to limit memory use; installed artifacts may remain side-by-side in app-private storage.
- **Artifact distribution:** The app source repository does not need to store model binaries or host the app. Keep model metadata and integrity pins in a catalog; host each model file separately on a public HTTPS model registry or release/download host. The catalog can be bundled with the app (new catalog entries require an app update) or served as a versioned static JSON document (model catalog updates can happen separately). In either case restrict allowed hosts and verify exact size and SHA-256 before making the artifact available. Do not place large model files in ordinary Git history.
- **Deterministic evidence:** Preserve parser facts and their provenance. Do not replace a valid high-confidence deterministic amount, currency, or direction silently. If a proposal conflicts on a financially material field, retain the deterministic value and mark the candidate for review through the shared policy.
- **Confidence:** Do not raise global confidence using `max(parserConfidence, modelConfidence)`. Track confidence and provenance per proposed field, validate the proposal, then pass combined evidence to the existing decision policy. Only that policy can return accept/review/reject.
- **Execution context:** Callers explicitly identify live background processing, foreground interaction, or historical import. Unknown context is treated conservatively as background; heavy generation is skipped and the deterministic result proceeds to the existing policy.
- **Background safety:** Heavy generative inference is disabled for background message ingestion in the initial release. Device capability checks are advisory and cannot guarantee that the OS will keep a process alive. A low-RAM or unavailable profiler must never cause a missed transaction; use deterministic parsing and review instead.
- **UI scope:** A minimal model library is required for the requested browse/install/switch/remove flow. Its implementation is paused with Phase 2 V2. Keep presentation concerns and the broader replacement UI issue list in [UI Replacement Issues](../UI_REPLACEMENT_ISSUES.md), indexed by [`docs/Plan.md`](../Plan.md); keep model preferences, catalog, installation, switching, and removal behind application-facing capabilities.
- **Platforms:** Shared contracts and fallback behavior work on Android and iOS. A runtime is enabled only on platforms where its native engine is implemented and verified. Android-only system AI is optional; unsupported platforms use deterministic parsing and review.
- **Persistence:** Store model preferences through the existing settings capability. Do not add a new table unless a concrete metadata requirement cannot fit the current settings boundary; any schema change must be an appended, transactional migration under Phase 7 rules.

## Current contracts and required extension

The legacy `AIResolutionResult` contains `merchant`, `category`, `confidence`, optional `reasoning`, and `timestamp`. It cannot represent amount, currency, direction, reference, field-level confidence, or conflict evidence. Phase 2 V2 now provides a separate validated proposal contract and an injectable parser boundary. The legacy resolver no longer raises parser confidence; production composition injects a task-slot selector, but its adapter registry and catalog remain empty and no candidate artifact has passed evaluation.

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
  source: 'deterministic' | 'local_model' | 'cloud_model' | 'user_correction';
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

### Available local corpus and baseline

The user-provided `data/extracted_messages.json` is used only by the opt-in local baseline test `src/__tests__/deviceCorpusBaseline.test.ts`. It currently contains 1,035 records (1,014 inbox and 21 sent/other). Running the current parser and decision policy on inbox records produced 436 parsed candidates and outcomes of 313 auto-save, 123 review, and 578 reject; 83 inbox bodies repeated after NFKC normalization, trimming, and case-folding. Direction among parsed records was 350 debit, 75 credit, and 11 other/unspecified. These are observed behavior counts, **not accuracy or quality scores**. The export has no verified expected transaction fields/outcomes, so it cannot be used as a labeled test set or sent to an external model service. The test prints only aggregate counts and keeps raw content out of logs. `/data/` is Git-ignored; keep the export on the developer's machine and do not copy its contents into fixtures or planning documents.

The synthetic JSON fixture under `src/__tests__/__fixtures__/sanitized-scenarios.json` is the current labeled regression set. Its test checks parser outputs, candidate classification, and important transaction-direction semantics. It is useful for regression coverage, but its limited size and synthetic provenance are not enough for model selection. Build a larger sanitized, manually labeled holdout from representative formats before calculating field-level precision/recall. Keep the holdout separate from any examples used to tune prompts or rules.

### Selected Hugging Face training checkpoints

The starting checkpoints are now selected: [`sentence-transformers/all-MiniLM-L6-v2`](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) for the intent slot, [`google/mobilebert-uncased`](https://huggingface.co/google/mobilebert-uncased) for category classification, and [`HuggingFaceTB/SmolLM2-135M-Instruct`](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct) for structured extraction. Their task-specific fine-tuning, export targets, package requirements, and evaluation gates are recorded in the [one-run completion plan](#one-run-inference-and-model-library-completion-plan).

These are upstream training starting points, not installable app artifacts or proof of task accuracy. Fine-tune them externally, then supply final deployment paths. The app catalog remains empty until the final package (weights plus tokenizer/config) has a pinned immutable location, verified license, exact byte size strictly below 100,000,000 bytes, SHA-256, task labels, and runtime/platform compatibility. MiniLM and MobileBERT will share a new ONNX runtime adapter; SmolLM2 will use the existing llama.rn integration after its lifecycle is verified. The 88.2 MB Q3_K_S community GGUF remains a size reference only; it is not the selected fine-tuned artifact. The previous 491 MB Qwen candidate remains excluded by the app size limit.

No fixed download size, RAM use, latency, accuracy, OS reach, or “safe device” claim is accepted until measured on supported app devices and tied to a specific fine-tuned artifact, quantization, runtime, and version.

Avoid claims such as “zero hallucination,” “zero background crash risk,” universal device support, or zero resource use. Similarity models can misclassify; system inference still consumes app/system resources; and available-memory readings are snapshots, not guarantees.

## Runtime architecture and ownership

```text
message/import caller
        │ supplies ParseExecutionContext
        ▼
ParserOrchestrator.parseAsync()
        ├── deterministic parser ──► baseline StructuredExpense
        ├── explicitly selected local/cloud model orchestration
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

Preferences must support inference mode (`deterministic`, `local`, or `cloud`), selected provider/model IDs, and local model availability. Keep installed-model inventory separate from selection. Because the selected local models have different responsibilities, assign at most one installed model to each slot (`intent`, `category`, and `extraction`); users may leave any slot disabled. The default for a fresh install is **deterministic-only until the user explicitly enables a provider**. A model that is not installed, supported, or healthy is treated as unavailable; deterministic parsing continues. Selecting cloud must never silently upload message content: the user must first see and accept a data disclosure and choose a provider. Changing an API provider or credential ownership must be explicit.

If an artifact is downloaded from the user-facing model library:

1. Show the model's purpose, publisher, license, artifact size, expected network use, supported runtime/platform, and current evaluation status before an explicit user install action.
2. Use HTTPS and an allowlisted publisher/source; verify a pinned cryptographic digest or signature before loading.
3. Enforce expected size and supported format; write to a temporary app-private path and atomically promote only after validation.
4. Support cancellation, interrupted-download recovery, insufficient-storage handling, versioned replacement, and user-triggered deletion.
5. Never execute or load an unverified artifact. Do not auto-download, auto-update, or silently delete a selected model. Permit multiple verified model IDs/versions to coexist; clear/reassign the matching task slot before removing its assigned model.
6. Keep artifact download errors separate from transaction persistence outcomes. They must not delay or block ledger processing.

System-provided runtimes do not use the app artifact manager, but must expose availability, version/capability checks, timeout behavior, and remain on-device. Cloud adapters expose provider/model availability and request deadlines; failures fall back to deterministic output, never to another cloud provider without a new user choice.

## Execution routing and limits

- `live_background`: deterministic parse first; only a separately verified fast model may run under a measured, strict budget. The initial safe default is no model call for this context. If inference is skipped or fails, preserve deterministic output and let the shared decision policy handle review/save.
- `foreground_interaction`: a selected and ready local model may run within a model-specific budget; a selected cloud model may run only after explicit consent and a foreground action. UI responsiveness must not depend on inference; cancellation or timeout returns the deterministic candidate.
- `historical_import`: process messages in the existing chronological shared-application path. Model failure for one row must not reorder or prevent other rows; existing partial success and deduplication semantics remain authoritative.
- `unknown`: use deterministic parsing only and preserve review behavior.

Unexpected model/runtime errors should be reported through the app-wide error-reporting capability once that cross-cutting feature is implemented. Do not report expected parser outcomes such as a rejected non-transaction message, review decision, duplicate, disabled model, or unsupported device as app errors. Error-report delivery failure must remain best-effort and must not alter transaction outcomes.

Do not hard-code the earlier generic 1,500 ms timeout. Benchmark each supported engine, set a per-model timeout and an overall context budget, and test both. A timeout race does not stop native inference by itself; adapter cancellation/unload behavior must be verified. Prevent overlapping loads/inferences from exceeding the measured memory budget. A model may be skipped or unloaded when the app is backgrounded, memory pressure is reported, or the engine is busy.

## Implementation sequence

1. **Labeled holdout and candidate evaluation:** manually label representative cases from the local corpus through the procedure in [private device corpus annotation protocol](#private-device-corpus-annotation-protocol), then benchmark task-specific candidates and only local language-model artifacts below 100 MB on supported Android/iOS tiers. Cloud-provider evaluation uses synthetic or separately consented sanitized cases, never the raw device corpus. Select only candidates with measured benefit. If none meet quality/privacy/resource gates, keep inference disabled and report the phase incomplete.
2. **Contracts and configuration:** add execution context, field-level proposal/provenance, validation, compatibility metadata, model preference contract, and test fakes. Preserve existing call behavior with a deterministic default for callers that do not yet provide context.
3. **Verified infrastructure adapters:** implement the catalog and multi-artifact library lifecycle over the existing artifact manager; enforce the strict under-100 MB limit in code; implement one selected local runtime first; add device profiling as advisory capability. Add a selected cloud adapter only after deciding backend proxy versus bring-your-own-key and completing data-disclosure, secure-credential, quota, and provider-retention review. Keep providers separately owned behind the proposal contract.
4. **Composition and parser integration:** wire selected adapters at `src/app/composition/`, pass explicit context from live and import call paths, merge only validated proposals, and send evidence through the existing transaction decision policy.
5. **Minimal user control:** expose deterministic/local/cloud mode and model library capabilities through application-facing services. Implement the requested minimal, replaceable model library for catalog/install/slot assignment/unload/remove. Never silently enable a model or cloud provider.
6. **Verification and handoff:** run proposal validation, parser parity, policy, context routing, platform adapter, artifact lifecycle, timeout/cancellation, and import-order tests. Record exact model/version/device results and update the implementation changelog and current architecture docs.

## Verification and acceptance criteria

1. Deterministic-only is the default; unavailable/disabled/error/timeout/cancel paths preserve deterministic parsing and do not block persistence of a separately accepted transaction.
2. The model returns only a typed proposal. It cannot write data, invoke notifications, or choose reject/review/save.
3. Invalid JSON, non-finite/non-positive amount, unsupported currency/type/category, overlong strings, and unsupported fields are rejected safely.
4. Every merged field records its source and confidence. A conflict in amount, currency, or direction is never silently overwritten and routes through the shared decision policy with review required.
5. Model confidence cannot independently increase a candidate to auto-save. Existing parser thresholds and policy tests remain authoritative.
6. Context routing is explicit and tested for live background, foreground interaction, historical import, and unknown context. Heavy generation does not run for background input in the initial release.
7. Timeout and cancellation are measured per supported engine. Tests prove late model results cannot overwrite a fallback result or cause duplicate application writes.
8. Candidate quality is measured against a held-out sanitized fixture set with field-level precision/recall and regression comparison against deterministic parsing. Set numeric release gates from the baseline before selecting a production model; do not invent performance or accuracy claims in advance.
9. Downloaded artifacts are allowlisted, integrity-checked, versioned, installed atomically, cancellable, and removable. Failure leaves the previous usable model (if any) and transaction workflow intact.
10. A catalog can list multiple models; users can install several under 100 MB each, assign compatible models to task slots, switch/clear assignments, unload models, and remove an unassigned model. The runtime unloads before loading another model unless device measurements explicitly justify concurrent loading.
11. Android and iOS behavior is explicitly recorded. Unsupported platform/runtime combinations fall back to deterministic parsing and review without build-time or runtime crashes.
12. Tests verify no raw message/sender values are emitted to telemetry or logs by AI/model code; the model cache does not persist raw messages.
13. Cloud inference runs only after explicit user choice, consent, and foreground action; no cloud API key is embedded in the mobile bundle; provider failures never trigger silent data transfer to another provider.
14. Existing shared decision policy, application use cases, deduplication, repayment ordering, repository boundary, and migrations remain unchanged unless a separately reviewed migration is necessary.

## Out of scope and handoffs

- General UI replacement/redesign beyond the small model-library screen in this phase.
- Cloud inference, remote parsing APIs, or sending message content off-device.
- Training/fine-tuning a model on user messages or uploading corrections.
- Changing transaction save/review thresholds or the shared decision policy as a side effect of model confidence.
- Reworking historical-import ordering, deduplication, repayment logic, transaction persistence, or completed migrations.
- Adding an unverified catalog of model specifications as user-facing promises.

The replacement UI can later use the model preference/settings capability without changing parser, decision, or persistence workflows. Any future change to transaction storage must follow the Phase 7 migration process. Phase 2 V2 is complete only when a specific model/runtime has passed the quality, privacy, platform, artifact integrity, and resource gates above; otherwise the documented outcome is that deterministic fallback remains active and AI support is still incomplete.

## One-run inference and model library completion plan

### 1. Selected Hugging Face starting checkpoints

These are upstream training checkpoints, not the files the app will download. The owner will fine-tune them outside the app, export the deployment formats below, and supply the resulting repository/file paths. Every complete installable package (weights, tokenizer, config, and runtime metadata together) must be strictly smaller than 100,000,000 bytes. Training checkpoints may exceed that cap because users will download only the final, optimized export.

| Product slot | Selected Hugging Face checkpoint | Fine-tune task | App artifact/runtime target | Key constraint |
|---|---|---|---|---|
| Intent and direction hints | [`sentence-transformers/all-MiniLM-L6-v2`](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) (Apache-2.0; 22.7M parameters) | Fine-tune a classifier head over normalized message embeddings for `transaction`, `non_transaction`, `ambiguous`, plus direction hints where labels support it. | Quantized ONNX encoder/classifier plus tokenizer assets; shared ONNX Runtime adapter. | Upstream is a sentence-embedding model, not a pre-trained bank-message classifier. Intent and direction outputs are only evidence; deterministic direction remains authoritative. |
| Category hint | [`google/mobilebert-uncased`](https://huggingface.co/google/mobilebert-uncased) (Apache-2.0) | Fine-tune a sequence-classification head for the app's category set, including `Other` and uncertain/ambiguous examples. | Quantized ONNX classifier plus tokenizer assets; shared ONNX Runtime adapter. | The upstream checkpoint is a pretraining model and its original weight file exceeds the app limit. Fine-tuning happens off-device; quantized deployment package must pass the total-package size gate. |
| Structured extraction proposal | [`HuggingFaceTB/SmolLM2-135M-Instruct`](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct) (Apache-2.0) | Fine-tune for schema-constrained JSON with explicit nulls, evidence/confidence by field, and no policy/persistence decisions. | GGUF Q3_K_S first candidate, loaded through the existing llama.rn engine. The quantized GGUF and required metadata must fit within the cap. | Q3_K_S is a size-led candidate with quality trade-offs. Do not list the original base or a community conversion as the app's final artifact. Evaluate the owner's fine-tuned export. |

These selections are starting points for the user's own fine-tuning. The MiniLM checkpoint is documented for sentence similarity; the MobileBERT checkpoint is documented for pretraining. Neither is assumed to perform the intended product task until fine-tuned and measured. Hugging Face model cards identify the licenses and intended tasks; verify the final repository's license and redistribution rights again before release.

### 1.1 Local base-checkpoint smoke test

The upstream files are kept only on the development host under Git-ignored `data/models/`; they are not catalog entries or shipped model packages. The reproducible local runner is `data/models/.venv/bin/python scripts/test-local-models.py --model <minilm|mobilebert|smollm2>`. It loads only the selected model and uses a synthetic example; it does not read the private device corpus or contact a network service.

| Checkpoint tested | Local result | Interpretation |
|---|---|---|
| MiniLM QInt8 ONNX, 23,026,053 bytes | ONNX inference passed; output shape `[1, 128, 384]`; host inference 0.024 s. | Confirms the quantized encoder runs. The upstream model has no expense-intent classification head. |
| MobileBERT quantized ONNX, 26,715,553 bytes | ONNX inference passed; output shape `[1, 20, 512]`; host inference 0.017 s. | Confirms the pretraining encoder runs. It has no expense-category classification head. |
| SmolLM2 Q3_K_S GGUF, 88,201,792 bytes | Local llama.cpp generation produced schema-constrained JSON in 1.019 s. | On the synthetic cafe-debit sample, amount, currency, direction, and merchant were plausible, but the model predicted `Bills & Utilities` instead of the expected food category. This is an observed quality failure, not a passing task-accuracy result. |

These are development-host timings, not Android/iOS measurements. The isolated Python ONNX/llama.cpp runner validates artifact loading and raw inference only; app-level runtime selection remains unimplemented and the Models tab will continue to report an empty catalog. Re-run each slot individually with the command above after updating the artifacts. Do not fine-tune, quality-approve, or publish a model based on this smoke test.

### 2. Target runtime design

```text
input source and execution context
              |
              v
ParserOrchestrator.parseAsync()
   | deterministic parse first
   |-- optional intent ONNX adapter (bounded classifier output)
   |-- optional category ONNX adapter (bounded classifier output)
   |-- optional SmolLM2 GGUF adapter (validated extraction proposal)
              |
              v
validate proposal -> merge field evidence -> existing decision policy
              |
              v
existing application use case -> dedupe/persistence/review
```

- Keep the existing `AIExtractionEngine` proposal-only contract as the parser-facing seam. Extend it only to carry model-slot results, execution context, cancellation, and sanitized inference metadata; it must not gain repository, notification, UI, or decision-policy access.
- Add a runtime registry keyed by `{modelId, version, task, runtime}`. It resolves catalog metadata to one adapter and rejects incompatible platform, task, tokenizer, or artifact manifests before loading.
- Implement one shared `OnnxRuntimeSessionProvider` and tokenizer boundary, then thin intent and category adapters with task-specific input/output mapping. Do not duplicate ONNX session lifecycle per model.
- Keep `LlamaExtractionEngine` as the GGUF adapter, behind the same engine interface. Add model lifecycle methods (`load`, `unload`, `isReady`, `infer`, `cancel` where the native runtime supports it); timeout alone is not cancellation.
- Validate all class names against catalog labels, all scores as finite values in `[0,1]`, and all generated JSON with the existing proposal validator. Unknown labels, malformed output, timeout, unsupported native runtime, or corrupt files produce an inference failure and deterministic fallback.
- Deterministic amount/currency/direction facts stay authoritative. A material disagreement or missing required field is routed through the existing transaction decision policy for review; model confidence never grants auto-save.

### 3. Model assignment and preferences

The present implementation stores one `activeModel`. That is insufficient for the selected three-task pipeline. In this completion run, replace that setting with an optional assignment per task slot:

```ts
interface LocalModelAssignments {
  intent?: { id: string; version: string } | null;
  category?: { id: string; version: string } | null;
  extraction?: { id: string; version: string } | null;
}
```

- Installed inventory stays separate from assignments; users can install several candidates, enable one compatible model per slot, and leave any slot disabled.
- Keep deterministic-only as a first-class setting that clears or disables assignments without deleting installed files.
- Migrate the current `activeModel` preference safely: map its catalog task to the matching slot only if the model exists and its verified artifact is installed; otherwise clear it and retain the artifact as installed. Preserve the previous settings API during the migration window.
- Selecting a model verifies digest, package manifest, platform support, model task, tokenizer version, and runtime availability before saving the assignment.
- Model switching unloads only the replaced slot's runtime. Add a shared memory coordinator that serializes model loads and enforces an empirically measured resident-memory budget; default to at most one loaded model at a time on low-memory devices.
- Removing an assigned model requires either clearing that slot or selecting another installed compatible model first. Never remove model files while an inference session is using them.

### 4. Artifact/package and catalog work

The current manager handles one downloaded file. ONNX requires weights plus tokenizer/config, so add an integrity-checked package manifest and atomic bundle installation before publishing classifier entries.

1. Define a versioned manifest listing model ID/version/task/runtime, platform/ABI requirements, license/source, exact package byte count, package SHA-256, contained file paths/sizes/digests, tokenizer identity, labels, input/output tensor names, max sequence length, and quantization.
2. Download a single archive per model entry with HTTPS host allowlisting, redirect validation, progress/cancel, free-space preflight, and the strict whole-archive limit.
3. Verify archive size and SHA-256 before extraction. Reject absolute paths, `..`, duplicate paths, symlinks, unexpected files, and expanded-size limits; verify each extracted file digest. Extract to a temporary directory and atomically promote only after all checks pass.
4. Use the archive's content digest and model/version as a stable storage key. Clean incomplete downloads and staging directories on cancel, crash recovery, or verification failure.
5. Keep the bundled catalog empty until the owner supplies final paths and metadata. Add entries only after the actual package has been built and checked; never commit dummy URLs/hashes or claim an upstream base checkpoint is an installable app model.
6. Pin immutable Hugging Face revisions or use immutable release URLs for final artifacts. Record the exact final artifact repository and revision in the catalog, even if a later catalog refresh mechanism is added.

The manifest and catalog are public metadata. Do not store tokens or private keys in them. Model downloads are user-initiated; they never send SMS content.

### 5. Parser runtime selection and execution rules

- Add a `ModelRuntimeSelector` application service that reads mode, task assignments, app state, execution context, and platform support. `ParserOrchestrator` receives an injected proposal provider rather than reading settings or composition singletons itself.
- Run deterministic parsing first. For foreground parse/review, call only enabled task slots and merge their proposals. If a task slot is disabled/unavailable, skip it without blocking other slots.
- For `live_background`, `historical_import`, and `unknown`, initially skip generative SmolLM2. The two classifiers may run only after measurements demonstrate they fit strict per-message CPU/memory/time budgets; otherwise skip all AI and continue deterministic parsing.
- Apply a global per-message budget, per-adapter timeout, concurrency limit, cancellation, and cooldown after repeated native errors. A late result after timeout must be ignored; unload/recovery must be tested with the native engine.
- If the deterministic parser returns no candidate due to missing amount, a local model may propose amount and transaction type only in foreground, and the result must be review-only. It cannot bypass the preflight transaction filter for promotional/OTP messages.
- Cloud inference is not part of this local-runtime completion slice. It remains a separately opt-in provider behind the same contract until API credential ownership, secure backend proxy versus user-owned key, data disclosure, and retention policy are decided. No failure may trigger cloud fallback.

#### Cloud provider carry-forward

The broader Phase 2 V2 plan still allows an explicit cloud mode, but cloud integration is not required to complete the three local model slots in this run. The earlier plan has an unresolved credential-ownership decision (secure developer proxy versus user-owned API key), and no concrete provider list is selected. Keep deterministic/local paths complete and safe without cloud. Before implementing cloud, choose the provider(s), key ownership/storage, request disclosure, retention/logging rules, quotas, and supported foreground flows. The support-email backend must not be assumed to be an AI proxy. A cloud provider must implement the same proposal-only contract and must never be a fallback triggered by a local model error.

### 6. Device evaluation plan

#### Dataset and quality

- Complete human labels for a sanitized, de-identified corpus. Store no raw sender, account, phone, transaction IDs, or unrelated message text in committed fixtures.
- Split by normalized message template/source family (not random near-duplicate rows) into train, validation, and untouched test sets. Keep the untouched test set unavailable during fine-tuning and prompt selection.
- Report per-class precision, recall, F1, confusion matrix, calibration, abstention rate, and false-positive rate for transaction/non-transaction, direction, category, and each proposed field. Report coverage separately from quality.
- Compare each adapter against the deterministic baseline and the existing synthetic regression corpus. Measure incremental accepted-candidate quality and harm; do not use aggregate device-corpus counts as accuracy.
- Gate each model independently. A failed model slot stays disabled; passing one slot does not imply the other slots pass.

#### Device and runtime matrix

Test a low-memory supported Android device, a mid-tier Android device, and a current iOS device (once native build tooling/device is available). Record exact OS/device/RAM/ABI, app build, model revision, runtime version, and quantization. For each model and combinations:

- download bytes, verification/install time, storage before/after, cancel/resume/retry behavior, and corrupt/truncated artifact recovery;
- cold-load and warm inference p50/p95, maximum resident memory/peak native heap where available, CPU duration, battery/thermal trend over a repeated batch, and app responsiveness;
- background kill/restart and low-memory behavior; concurrent request serialization; unload/switch/remove while idle and while inference is active;
- Android and iOS runtime availability and failure fallback separately. Unsupported platform means deterministic mode, not a broken parser.

Set release thresholds from measurements before final device runs. Do not invent universal latency/RAM limits in advance; the chosen targets must be documented per supported device tier. The 100 MB model package ceiling remains independent of in-memory runtime usage.

#### Private device corpus annotation protocol

## Goal

Measure whether a selected inference adapter improves extraction over the deterministic parser without increasing harmful financial-field errors. The test set must contain expected values verified by a human; the parser's current output is a prediction to compare, never a label to copy automatically.

## Source and privacy boundary

- Read from the developer's local `data/extracted_messages.json`, which is Git-ignored.
- Keep raw records and annotation drafts under `data/`; never add them to Git, docs, screenshots, or external issue trackers.
- Do not send any device-export record to Gemini, ChatGPT, or another cloud provider for labeling or evaluation. Cloud adapter tests must use synthetic or separately consented, sanitized cases.
- Before a record enters the shareable test fixture, redact account/card numbers, phone numbers, reference IDs, personal names, and any other identifying text. Preserve only the structure needed to evaluate extraction. Have a human check redactions; automated masking is not sufficient to claim de-identification.
- Merchant names can themselves identify a person through purchase history. Replace them with stable synthetic merchant tokens and label the expected category; only retain real merchant text if the owner explicitly approves that specific use.

## Label schema

Use one record per unique normalized message body. Keep the raw source in the local draft only; the eventual committed fixture contains only the reviewed sanitized message and these labels.

```json
{
  "id": "DEV-0001",
  "message": "sanitized message text",
  "isTransaction": true,
  "expected": {
    "amount": 123.45,
    "currency": "INR",
    "direction": "debit",
    "merchant": "SYNTHETIC_MERCHANT_01",
    "category": "Food & Dining",
    "referencePresent": true
  },
  "reviewStatus": "verified",
  "notes": "optional, non-identifying clarification"
}
```

Use `null` when the message does not state a field. Use `isTransaction: false` for non-transaction messages. Keep the expected direction as the account holder's direction, not the payee's. Never infer a missing amount, currency, merchant, or reference. Do not record account number, bank account ID, contact, date of birth, or sender identity as a target field in this phase.

## Sampling and splits

1. Normalize bodies with NFKC, whitespace trim, and case-folding; collapse exact normalized duplicates before sampling.
2. Review the generated 100-record random draft first. Then create additional targeted samples for underrepresented parser outcomes (auto-save/review/reject), parsed directions, and missing-field cases. Preserve a stable message/template group so near-duplicate bank templates cannot appear in both development and holdout splits.
3. Have the owner review and correct every expected label independently of parser output. Uncertain examples are marked `needs_review` and excluded until resolved.
4. Split by template group, not individual message: 60% development, 20% validation, 20% locked holdout. Keep the locked holdout out of prompt/rule/model tuning.
5. If the corpus does not provide enough clean examples for a stratum, record the shortage; do not duplicate examples or invent labels to fill quotas. Add synthetic cases for rare edge cases and mark their provenance.

## Evaluation measures and gates

Compare the same cases across deterministic-only, each local candidate below 100 MB, and any explicitly approved cloud adapter tested on synthetic/consented sanitized data:

- Per-field exact-match accuracy and precision/recall for amount, currency, direction, merchant normalization, and category.
- Transaction/non-transaction precision and recall.
- Count of dangerous direction errors (debit labeled credit or vice versa), invalid amount changes, and unsupported values.
- Review/auto-save outcome changes after evidence passes through the existing shared decision policy.
- Local model file size in exact bytes, load time, cold/warm latency, peak memory, and thermal behavior by device tier.
- Cloud request latency, failures, cancellation, estimated request cost, and confirmation that no raw body is logged by the app. Never use the private export for cloud calls.

Set numeric release gates only after the verified baseline labels exist. A model is not acceptable merely because it fits under 100 MB or improves average accuracy; it must not introduce unacceptable debit/credit errors or bypass review policy.

## Implementation handoff

The first work item is complete: the local-only generator samples and deduplicates inbox messages and writes a private draft under `data/` with all expected labels blank. It deliberately omits parser predictions so reviewers label independently. The generated draft is not a test fixture until the owner verifies labels, reviews redaction, and approves which sanitized examples may be committed. After that review, add only the sanitized, labeled set to `src/__tests__/__fixtures__/` and keep the locked holdout separate from tuning examples.

## Provider-choice handoff

The app should eventually let the user select deterministic-only, an installed local model, or a named cloud provider. Keep this preference independent from the parser contract. Cloud inference requires a later decision between a secure backend proxy (simpler user setup, but the app owner pays and operates auth, quotas, and provider credentials) and bring-your-own-key (user pays the provider and owns the key, but setup is harder and the app must store it with OS secure storage). Never ship a shared provider API key in the app. No backend/API-key decision or cloud transmission is authorized by this evaluation plan.

### 7. Deferred model-management UI

The AI-specific model-library presentation work is paused with Phase 2 V2. Its detailed screen and presentation-boundary issues are tracked outside this folder in [UI Replacement Issues](../UI_REPLACEMENT_ISSUES.md), with the backlog indexed from [`docs/Plan.md`](../Plan.md). When resumed, keep the UI as a thin client of `ModelLibraryService` and `ModelRuntimeSelector`; do not move catalog, install, assignment, unload, or removal rules into screens.

### 8. Files and test coverage expected in the implementation run

| Area | Expected work |
|---|---|
| `src/core/parser/ai/` | Task-slot assignments, runtime/proposal interfaces, package manifest and validation contracts, model status/failure types. |
| `src/core/parser/orchestrator/ParserOrchestrator.ts` | Accept injected selected-model proposal provider; deterministic-first merge and conservative context routing remain explicit. |
| `src/infrastructure/ai/` | Shared ONNX session provider/tokenizer and task adapters; GGUF lifecycle adapter; hardened archive manager; device capability/memory profile adapter. |
| `src/services/ai/` | Runtime selector, per-task assignments, install/list/remove coordination, load/unload state and error translation. |
| `src/services/settings/` | Backward-compatible setting migration from one `activeModel` to task slots. |
| `src/app/composition/` | Build concrete ONNX/GGUF/runtime services once and inject them into parser and presentation capabilities. |
| `src/presentation/legacy/` | Isolated model library screens/components/routes; no general UI redesign. |
| `src/__tests__/` | Contract tests, adapter fake-session tests, package security tests, selector/context/fallback tests, preference migration tests, and service/UI lifecycle tests. |
| Android/iOS native project files | Add and pin the selected ONNX Runtime React Native dependency only after compatibility with current React Native/New Architecture is verified; preserve the existing llama.rn native setup. |
| README and architecture/Phase 2 docs | Document exact supported formats/runtime/platforms, privacy, catalog provenance, release gates, setup, and known unsupported cases. |

Specific dependency versions and model native binaries must be pinned after checking the current React Native version, Android/iOS deployment targets, ABIs, and New Architecture support. Do not add an unpinned `latest.integration` runtime dependency.

### 9. Implementation sequence (one coordinated run)

1. Inspect current RN/native versions and existing llama.rn lifecycle; pin a compatible ONNX Runtime React Native version and confirm both platforms can build before adding model adapters.
2. Implement task-slot settings migration and runtime contracts; unit-test migration and disabled/default deterministic behavior.
3. Implement the package manifest, secure bundle install/unpack/verify, and lifecycle service; test hostile archive paths, mismatch, disk failure, cancellation, and atomic cleanup.
4. Implement ONNX shared runtime/tokenizer then MiniLM intent and MobileBERT category adapters; run against tiny checked-in synthetic model fixtures or mocked runtime sessions, not real model binaries.
5. Harden/wrap GGUF runtime lifecycle and add SmolLM2 structured proposal adapter with bounded output tokens, schema validation, and cancellation/unload tests.
6. Inject runtime selection into parser composition; verify deterministic first, task compatibility, context gates, no hidden cloud fallback, and that model evidence cannot auto-save or bypass policy.
7. Build the small model library UI over service APIs; verify installation, cancellation, task assignment, deterministic mode, unload, switch, and removal.
8. Add finalized catalog entries only after the owner supplies fine-tuned artifacts and each total package passes size, hash, license, tokenizer, schema, runtime, and platform checks.
9. Run sanitized held-out quality evaluation and the Android/iOS device matrix; disable any model slot that misses quality/privacy/stability/measurement gates.
10. Run TypeScript, import-boundary checks, full tests, lint, native Android/iOS builds where available, and `git diff --check`; update Graphify and record measured evidence and remaining limitations.

### 10. Completion gates

Phase 2 V2 can be marked complete only when all applicable gates pass:

1. The owner has supplied final fine-tuned model paths and rights to redistribute each artifact.
2. Every installable package is pinned, hosted, manifest-validated, and strictly below 100,000,000 bytes including tokenizer/config files.
3. ONNX and GGUF adapters load/unload safely on declared platforms; unsupported platforms cleanly use deterministic behavior.
4. Parser runtime selection uses per-task user assignments; fresh installs remain deterministic-only; no provider is silently enabled.
5. Model failure, invalid output, timeout, cancellation, low-memory skip, and native runtime absence all preserve the deterministic policy path.
6. Held-out quality and device/resource reports meet documented release thresholds for each enabled model slot.
7. User can install multiple models, assign compatible models per task, switch, unload, remove, and return to deterministic-only in the model library.
8. No raw message, sender, or transaction content is added to logs, telemetry, crash reports, or support emails.
9. Documentation, full automated verification, and available native platform builds agree with shipped behavior.
