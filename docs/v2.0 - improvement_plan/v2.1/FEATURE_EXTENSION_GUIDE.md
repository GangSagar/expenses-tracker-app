# Feature Extension Guide

This guide describes where future input sources and providers should connect to the current transaction architecture. It is an extension map, not a commitment to implement every capability listed here.

## Current transaction path

```text
SMS / supported payment notification
  → native bridge
  → useMessageListener
  → messageService (normalize, filter, parse)
  → transactionDecisionService
  → core decision policy
  → transactionApplication
  → core transaction use case + TransactionRepository
  → SQLiteTransactionRepository
  → local SQLite
```

Manual entry, review confirmation, edits, and historical import should continue to use the transaction application operations. Do not write transaction rows from a new input adapter or UI screen directly.

## Extension points

| Capability                                           | Entry point and contracts                                                                                                                | Reuse and constraints                                                                                                                                                                                                                                  |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New transaction source                               | Add a source adapter at the service/application edge; map the input to `IncomingMessage` or a `TransactionCandidate` as appropriate. | Reuse parser evidence collection, `decideTransaction`, shared deduplication, and transaction application writes. Preserve source timestamp and provenance.                                                                                           |
| New bank or message format                           | Update parser config/rules where sufficient; add extractor/resolver code when the format needs new behavior.                             | Add sanitized regression examples. JSON-only changes do not guarantee support for formats needing new extraction logic.                                                                                                                                |
| Receipt OCR                                          | Add an image/OCR adapter that produces a candidate and evidence.                                                                         | Route uncertain results into review; do not make OCR directly persist. Decide image/text retention and privacy policy before implementation.                                                                                                           |
| Historical CSV/import format                         | Add a format reader and preview mapper.                                                                                                  | Reuse chronological import, per-row outcomes, deduplication, and repayment planning. Define malformed-row behavior for each format.                                                                                                                    |
| Notification provider                                | Keep the notification request behind a capability interface and implement platform/provider adapters outside transaction policy.         | Trigger only after a successful write. Notification errors remain best-effort and must not roll back a transaction. The current `transactionSavedNotification.ts` is React Native-specific and its ownership remains a documented Phase 9 follow-up. |
| Backup provider                                      | Add an export/import adapter around the existing snapshot application operations.                                                        | Preserve IDs and split-allocation semantics; validate the complete input before destructive overwrite. Decide encryption and destination before implementation.                                                                                        |
| Multi-currency                                       | Extend transaction amount and currency contracts, calculations, persistence, and migrations.                                             | Define base currency, exchange-rate source and timestamp, historical conversion, and rounding before adding UI labels.                                                                                                                                 |
| Replacement UI                                       | Use a presentation-facing API/composition boundary for capability services.                                                              | Do not import concrete SQLite repositories or `src/app/composition/` singletons directly in screens/hooks. See the [UI replacement issue list](./UI_REPLACEMENT_ISSUES.md).                                                                           |
| [App-wide error reporting](#app-wide-error-reporting) | Route unexpected failures through a centralized error-reporting capability with a replaceable delivery adapter.                          | Expected outcomes (reject, review, duplicate, validation, permission denial) are not crashes. Reports must be privacy-filtered and must never interrupt transaction processing.                                                                        |

## App-wide error reporting

The product requirement is to send unexpected app errors to customer support, regardless of which feature produced them. Automatic delivery through a secure backend is selected. Reports should include the error, affected component/screen, user-action flow, and reproduction-relevant technical details. The configured recipient is `hrnharshit1@gmail.com`; no backend endpoint or app-wide reporting provider is currently configured. See the [app-wide support error reporting plan](./APP_WIDE_SUPPORT_ERROR_REPORTING_PLAN.md) for the backend and mobile implementation sequence.

The reporting boundary should:

- Accept unexpected, actionable failures (uncaught exceptions, native bridge failures, failed persistence operations, and operational errors that need investigation). Ordinary business outcomes such as filtered messages, rejected candidates, review decisions, duplicates, user validation errors, and denied optional permissions should not generate support reports.
- Create a small allowlisted diagnostic payload: error category/fingerprint, sanitized error summary and stack, component and screen identifiers, a bounded breadcrumb sequence of named user actions leading up to the error, app version, OS/platform version, and a non-identifying event ID. Breadcrumbs describe actions (for example `open_history`, `select_filter`, `save_edit`) and must not capture field values, screen text, or message contents. Exclude SMS/notification bodies, sender or contact identifiers, merchant names, amounts, account data, database rows, PINs, credentials, model input/output, and arbitrary exception payloads unless a separate review explicitly approves a field.
- Avoid sending raw exception strings by default because native and third-party errors may embed message contents, file paths, or identifiers. Sanitize and bound the report before it leaves the device.
- Deliver through an authenticated HTTPS backend that forwards reports to the configured support mailbox. Never embed SMTP credentials or private API keys in the mobile app. Do not send email directly from the parser or native modules.
- Define the user's consent/opt-out behavior, offline queue and retention, retry/backoff limits, duplicate suppression, rate limiting, and deletion controls before implementation. Reporting must be best-effort and must not delay or change a successful transaction write.
- Be disabled in tests and development telemetry should remain local unless deliberately configured. Do not reuse the local Jaeger endpoint as a production support channel.

**Open decisions before implementation:** backend hosting/operator, email provider, app-attestation strategy, report retention, and whether repeated errors are emailed individually or grouped. Automatic delivery, the recipient, and the initial reproduction context are approved. Keep the recipient and provider credentials on the backend; do not embed secrets in the app.

## Stable ownership map

- `src/core/`: domain policies, parser contracts, and deterministic business logic.
- `src/services/`: application capabilities and orchestration.
- `src/database/` and `src/infrastructure/`: concrete storage, native, and telemetry adapters.
- `src/app/composition/`: current concrete runtime wiring. The existing UI and two services still import its configured singletons; the replacement UI should not copy this coupling.
- `src/presentation/legacy/` and `src/hooks/`: existing UI/state adapters, scheduled for replacement or reconsideration with the new UI.

## Decisions required when a capability is approved

The extension does not select product-specific behavior in advance. Record the decisions relevant to the feature before implementation:

- OCR source, retention, correction/review, and itemization requirements.
- Supported import formats, duplicate policy, and malformed-row recovery.
- Backup destination, encryption, overwrite confirmation, and recovery behavior.
- Multi-currency base currency, exchange-rate source/time, and rounding.
- Notification permission and provider behavior on each target platform.
- Presentation-facing dependency injection shape for the replacement UI.
- Support-report recipient, delivery mode, consent, data fields, retention, retry/rate limits, and backend ownership for app-wide error reporting.
