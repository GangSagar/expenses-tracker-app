# UI Replacement Issues and Deferred Work

**Status: Deferred.** The current presentation is retained under `src/presentation/legacy/` while the core transaction and persistence workflows are stabilized. No broad redesign is part of the completed restructuring phases. Track this document from [`docs/Plan.md`](./Plan.md); do not treat it as active delivery until UI work is scheduled.

## Issue list

| Priority | Issue | Current evidence | Work for the replacement UI |
|---|---|---|---|
| P1 | Screens and hooks are coupled to global composition singletons. | `HomeScreen`, `AccountsScreen`, `SettingsScreen`, `HistoryScreen`, `ModelLibraryScreen`, and `useSecurityStore` import services from `src/app/composition/`. | Define a presentation-facing capability API and inject it into screens/hooks. UI code must not import the composition root, database repositories, or native providers directly. |
| P1 | Existing screens and Zustand stores are transitional adapters, not the replacement presentation contract. | Screens use `useExpenseStore` and `useSecurityStore`; current screen files live in `src/presentation/legacy/`. | Rebuild the presentation layer around existing application operations and query capabilities. Keep transaction decisions, persistence, split settlement, repayment, and deduplication outside screen components. |
| P1 | Review, save, duplicate, and failure states need consistent presentation across all entry paths. | Live parsing, historical import, manual entry, review confirmation, edit, and repayment operations return distinct application outcomes. | Map each outcome to a clear screen state. Show success only after persistence; preserve retry/review paths for failures and possible duplicates. |
| P2 | The Models screen is a legacy placeholder and the app model catalog is empty. | `ModelLibraryScreen` exists, but no fine-tuned model packages or production adapters are registered. Phase 2 V2 is deferred. | When Phase 2 V2 resumes, present model install, progress/cancel, task assignment, deterministic-only selection, unload, and removal through `ModelLibraryService`; do not move model lifecycle rules into UI state. |
| P2 | Support-reporting consent and settings are not implemented. | The support reporting plan requires an opt-out control and privacy notice; no reporting service is implemented yet. | When support reporting is scheduled, add a simple Settings opt-out and concise disclosure of diagnostic fields and delivery, using the backend/mobile capability rather than screen-owned networking. See [`APP_WIDE_SUPPORT_ERROR_REPORTING_PLAN.md`](./APP_WIDE_SUPPORT_ERROR_REPORTING_PLAN.md). |
| P2 | Existing UI actions can depend on platform-specific notification behavior. | Transaction-saved notifications are implemented through a localized React Native provider; a provider port is deferred. | Keep notification requests behind application-facing capabilities. Map pending/saved/error feedback to the replacement UI without making persistence depend on notification success. |
| P3 | Navigation, visual design, screen layout, and accessibility have not been redesigned for the future product direction. | Existing Home, History, Splits, Accounts, Settings, and Models screens are explicitly legacy. | Decide the new information architecture and visual system when UI work is scheduled. Preserve the established domain operations and include accessibility, loading, empty, and error states in the screen acceptance criteria. |

## Replacement UI acceptance checks

- Screens consume presentation-facing APIs and do not import `src/app/composition/` singletons or transaction repositories.
- Screen actions delegate to existing application/use-case operations; screens do not make transaction decisions or write ledger rows directly.
- Save, review, duplicate, failure, cancellation, and retry states reflect the returned application outcome.
- Model and support-reporting screens, if delivered, remain thin clients over their service capabilities.
- Navigation, loading/empty/error states, accessibility, and the required Android/iOS device workflows are reviewed before release.

## Related architecture references

- [Phase 8: Domain Organization and Dependency Guardrails](./v2.0%20-%20improvement_plan/PHASE_8_DOMAIN_ORGANIZATION_AND_DEPENDENCY_GUARDRAILS.md)
- [Phase 9: Documentation and Future Feature Readiness](./v2.0%20-%20improvement_plan/PHASE_9_DOCUMENTATION_AND_FUTURE_FEATURE_READINESS.md)
- [Feature Extension Guide](./FEATURE_EXTENSION_GUIDE.md)
- [Architecture](./ARCHITECTURE.md)
