# Phase 9: Documentation and Future Feature Readiness

**Status: Complete (documentation-only).** Phase 9 reconciled maintained project documentation with the active code, clarified implemented, partial, planned, and historical capabilities, and recorded extension points for likely future capabilities. It did not implement AI inference, new transaction sources, multi-currency, or a UI redesign. See the [Phase 9 completion record](./IMPLEMENTATION_CHANGELOG.md#phase-9--documentation-and-future-feature-readiness-complete).

## Why this phase exists

The project has evolved substantially since several overview documents were written. Current code has structured parser output, a shared transaction decision and application path, a SQLite transaction repository, versioned schema migrations, capability-oriented services, and an explicit composition root. Some docs still describe older phases as current, use old file paths, include stale verification counts, or describe capability interfaces as if they were active implementations.

The next UI will also consume these capabilities. The existing screens and `useSecurityStore` still import service instances from `src/app/composition/`; this presentation-to-global-wiring coupling was deferred during Phase 8 and must be visible to the future UI work.

The current transaction-saved notification capability remains grouped under `src/services/notifications/` and calls React Native native modules directly. This is a localized platform boundary seam, and Phase 8's import checker currently does not flag native-module imports from services. Phase 9 records the seam and defers a notification port plus infrastructure adapter until a provider/platform expansion needs that boundary; current ownership is documented in the extension guide and architecture docs.

The telemetry adapter also attaches the message sender to development spans. It truncates long values but does not redact phone numbers. Phase 9 documents this limitation; removing or redacting the attribute is a separate code/privacy hardening change and is not represented as completed here.

## Goals

1. Give each maintained document a clear purpose and source of truth.
2. Reconcile architecture, flow, implementation, setup, and feature claims against current code.
3. Label capabilities as **implemented**, **partial**, **planned**, or **historical** consistently.
4. Describe stable extension paths for future transaction sources and storage/provider adapters.
5. Record known seams and decisions without implying they are implemented.
6. Preserve Phase 2 local AI as a separate unresolved implementation, not a Phase 9 deliverable.

## Non-goals

- No runtime behavior, schema, transaction policy, parser threshold, or UI design changes.
- No implementation of local AI/model inference, receipt OCR, new notification providers, import formats, backup features, or multi-currency.
- No removal of historical records when retaining them is useful for audit.
- No broad prose rewrite that loses still-valid product requirements or native-platform details.

## Work plan

### 9.1 Establish documentation ownership and status vocabulary

- Identify one canonical document for each concern: product requirements, technical requirements, runtime architecture, live message flow, implementation roadmap, test strategy, and implementation history.
- Add a short scope/authority note to overlapping docs so implementation facts are not independently maintained in several places.
- Use the status vocabulary `Implemented`, `Partial`, `Planned`, and `Historical`. A claim of support must identify whether it is an interface, an active runtime path, or a tested capability.
- Preserve detailed phase history in the improvement-plan directory; make the README link to the current roadmap and architecture plan.

### 9.2 Reconcile runtime architecture and data-flow documentation

- Update `docs/ARCHITECTURE.md` diagrams and descriptions to match the actual entry path from native event hooks through `messageService`, parser composition, decision service, transaction application, repository, and presentation state.
- Show SQLite/native/telemetry adapters and `src/app/composition/` in their current locations.
- Correct parser-learning and spam-classifier persistence descriptions; distinguish model logic, repository ports, and concrete adapters.
- Mark local AI inference as **Partial/Planned**: `AIResolver`/cache interfaces exist, but no inference runtime/handler is configured.
- Keep `docs/APP_MESSAGE_LISTENER_FLOW.md` focused on the live native event flow, including transaction-saved notification behavior and best-effort failure behavior where present.
- Review `docs/architecture.drawio` against the same source. Update it only if its detail is still useful and can be kept consistent; otherwise mark it historical and point to the maintained Mermaid diagrams.

### 9.3 Reconcile product, technical, setup, and verification claims

- Update `README.md` links, feature descriptions, privacy statements, setup instructions, and test badge/count claims to verifiable current facts. Avoid absolute claims such as “100% passing” unless they are automatically maintained.
- Update `docs/TRD.md` and `docs/IMPLEMENTATION_PLAN.md` to current source locations, phases, SQLite migration behavior, service composition, and capability status.
- Update `docs/TESTING_STRATEGY.md` with commands that exist in `package.json`, the import-boundary lint check, test scope, and current release verification expectations.
- Correct old paths and test counts in `docs/REVISION_HISTORY.md` only where a current-facing claim is misleading; preserve historical snapshots as historical records.
- Verify every documentation command/script name against `package.json` and actual scripts before keeping it.

### 9.4 Record feature extension recipes and unresolved scope

Add a concise extension guide/table that gives each future capability an entry path, existing use cases to reuse, and the contracts it must not bypass:

| Future capability | Intended entry point | Reuse / design constraint |
|---|---|---|
| Additional transaction source | Source adapter in services/application edge | Normalize to a candidate and reuse the shared decision/application operations; do not write transaction SQL directly. |
| Receipt OCR | Image/OCR adapter and parser candidate mapper | OCR produces uncertain evidence; reuse review/decision policy and preserve raw evidence only under an explicit privacy/retention rule. |
| CSV or other historical import | Import adapter/preview | Reuse chronological batch application, deduplication, and per-row outcomes; never bypass repository/use-case rules. |
| New notification provider | Notification capability port and provider adapter | Trigger only after persistence succeeds; provider failure must not roll back the saved transaction. |
| Backup/restore provider | Backup adapter and existing backup application operations | Preserve transaction, split-allocation, and migration invariants; validate before destructive overwrite. |
| Multi-currency | Domain amount/currency representation plus migration/repository changes | Define base currency, conversion source/time, rounding, historical-rate semantics, and display rules before UI work. Do not treat currency as a label-only UI feature. |
| Replacement UI | Presentation-facing composition/API boundary | Do not import `src/app/composition/` singleton instances into screens/hooks; keep UI independent of concrete repositories/providers. |

Do not invent product decisions for OCR retention, CSV formats, backup destinations, exchange-rate provider, or conversion timing. List these as decisions required when a corresponding feature is approved.

## Expected documentation changes

| File | Planned work |
|---|---|
| `docs/ARCHITECTURE.md` | Correct runtime diagrams, ownership, adapter locations, and implemented/partial/planned status. |
| `docs/APP_MESSAGE_LISTENER_FLOW.md` | Match the current listener, parser, transaction, persistence, and notification path. |
| `docs/TRD.md` | Reconcile requirements/architecture assertions with current contracts, persistence, and migrations. |
| `docs/IMPLEMENTATION_PLAN.md` | Replace stale “current phase” descriptions and point to the maintained v2 phase plan. |
| `docs/TESTING_STRATEGY.md` | Align verification guidance with current npm scripts and boundary checks. |
| `README.md` | Keep entry-point documentation and capabilities accurate; remove stale absolutes/counts. |
| `docs/architecture.drawio` | Update if maintainable, otherwise mark historical and defer to source-controlled Mermaid diagrams. |
| `docs/v2.0 - improvement_plan/ARCHITECTURE_RESTRUCTURING_PLAN.md` | Link Phase 9 plan and maintain phase status. |
| `docs/v2.0 - improvement_plan/IMPLEMENTATION_CHANGELOG.md` | Record the reconciliation and all docs changed with reasons. |
| `docs/v2.0 - improvement_plan/PHASE_8_DOMAIN_ORGANIZATION_AND_DEPENDENCY_GUARDRAILS.md` | Keep the deferred presentation-to-composition coupling visible for replacement UI integration. |
| New extension guide (location selected during implementation) | Document the feature-entry recipes and decisions table from section 9.4. |

## Risks and safeguards

- **Conflicting docs:** use one canonical source per concern and link to it from secondary docs.
- **Historical detail lost:** retain dated history and label it historical rather than silently rewriting it as current.
- **Overstated capability:** inspect active call sites and tests before describing a path as implemented.
- **Unintended feature scope:** this phase records extension points; it does not implement the listed features or resolve product choices prematurely.
- **UI coupling forgotten:** keep direct composition-root imports in the deferred UI integration checklist and make the new UI boundary an explicit acceptance criterion.
- **Platform adapter ownership unclear:** review the existing transaction notification provider and state whether capability ownership remains in `services/notifications` with a localized native bridge or moves to an infrastructure adapter behind a port. Extend the import check only after choosing the boundary.
- **Verification drift:** state tested commands and results with dates or avoid hard-coded counts that quickly become stale.

## Verification and exit criteria

1. Current-facing documentation agrees with active code for the live transaction path, repository/migration behavior, service ownership, notifications, and security integration.
2. Every significant capability is labeled implemented, partial, planned, or historical with an evidence path when appropriate.
3. README commands and links resolve; referenced npm scripts exist.
4. The extension guide identifies a reuse path and a boundary rule for each proposed capability without prescribing unapproved product details.
5. The replacement UI checklist records the deferred presentation-to-composition coupling from Phase 8.
6. The transaction-saved notification provider's ownership is documented and the native-import boundary rule is either clarified or scheduled for the provider-port change.
7. Device-derived fixtures and telemetry are not described as anonymized when their implementations do not redact identifiers.
8. No code behavior changes are included in this documentation phase; verify links, paths, Mermaid rendering where tooling allows, and `git diff --check`.

## Decisions deferred until feature approval

- Local AI inference runtime/model and its offline operating constraints (Phase 2 V2).
- Receipt image retention, OCR engine, and review requirements.
- Supported CSV/import formats and malformed-row policy.
- Backup destinations, encryption, and overwrite confirmation.
- Multi-currency base currency, exchange-rate source/timestamp, and rounding rules.
- Presentation-facing injection API for the replacement UI; the architectural requirement is clear, while its exact shape should be chosen with the new UI integration.
- Whether to remove/redact sender attributes from development telemetry; no redaction change is included in this documentation phase.

## Implementation record

- Current-facing documentation, feature claims, source paths, verification commands, and privacy limitations were reconciled against the active source and package scripts.
- The maintained Mermaid architecture and listener-flow documents describe the current runtime. The legacy draw.io and older class/state diagrams are explicitly historical.
- Added `docs/FEATURE_EXTENSION_GUIDE.md` with entry paths and reuse constraints for future sources, OCR, imports, notifications, backup, currency, and replacement UI.
- Kept Phase 2 local AI/model integration as a separate unresolved implementation. UI-to-composition imports, the notification native bridge, and telemetry sender redaction remain explicit deferred seams.
- No runtime code or UI behavior changed.
- Verification: `git diff --check` passed; relative Markdown links and referenced npm scripts were checked. No Markdown renderer was available for a visual Mermaid render.
