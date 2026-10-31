# App-Wide Support Error Reporting Plan

**Status: Planned; product requirements recorded, implementation not started.** This is cross-cutting work and can proceed independently of Phase 2 V2. The report recipient, automatic delivery mode, and reproduction context were supplied by the product owner. Hosting, mail transport, and privacy-retention details remain to be selected before implementation/deployment.

## Goal

Automatically deliver actionable, unexpected app errors to the support mailbox `hrnharshit1@gmail.com` through a secure backend. Reports should let support identify the affected component/screen and reproduce the user flow while excluding transaction/message content and other sensitive values.

The app is a personal finance application. Reporting is diagnostic only: it must never delay or change parser decisions, transaction saves, repayment allocation, notification behavior, or recovery flows.

## Approved requirements

- Capture unexpected errors from any feature, not only the parser or Phase 2 V2.
- Send reports automatically through a backend that forwards email to `hrnharshit1@gmail.com`. Do not open an email composer as the delivery mechanism.
- Include a sanitized error summary, affected component and screen, a sequence of user actions before the error, and other allowlisted technical context that materially helps reproduce it.
- Delivery and capture are best-effort. A failed report submission must not cause another app failure or change a successful transaction result.
- The backend is part of the planned work. No backend, report endpoint, support email configuration, or mail provider currently exists in this repository.

## Error scope

Report unexpected, actionable failures, including:

- Uncaught JavaScript errors and unhandled promise rejections.
- React render errors captured by a root error boundary.
- Unexpected failures from database operations, native bridges, local AI/model runtime, file/backup operations, and service/application operations when the failure is not already handled as a normal result.
- Native fatal crashes where a platform adapter can safely record a minimal crash marker and submit a sanitized report on the next app launch without replacing normal OS crash handling.

Do not report normal product outcomes: filtered or non-transaction messages, reject/review decisions, duplicates, expected validation errors, user cancellations, denied optional permissions, unsupported models/devices, or an offline report queue. A handled failure should be reported once, at the boundary that knows the operation/component context; avoid reporting the same error again at each caller.

## Diagnostic payload and privacy rules

Use an allowlisted, versioned payload. Proposed fields:

| Field | Meaning / limit |
|---|---|
| `reportId` | Random non-identifying ID used for idempotency. |
| `occurredAt` | UTC timestamp, with no location data. |
| `errorCode`, `errorFingerprint` | Stable app-defined category and deduplication key; do not derive from financial values. |
| `summary` | Sanitized, length-limited error description. Never forward arbitrary exception text without filtering. |
| `stackFrames` | Bounded app-relative function/file/line frames; strip absolute paths, query strings, memory addresses, and values. |
| `component`, `screen` | Static component and route identifiers, not user-provided labels. |
| `breadcrumbs` | Small bounded ring of named actions and relative timestamps (for example `open_history`, `select_filter`, `save_edit`). Never capture input values, message text, rendered text, or full route parameters. |
| `appVersion`, `platform`, `osVersion`, `deviceClass` | Minimum build/runtime context needed to reproduce a platform-specific error. No advertising ID, serial, phone number, or stable device identifier. |
| `featureContext` | Allowlisted non-sensitive context such as parser stage or model ID/version. Never include model prompt/input/output. |

Never include SMS/notification bodies, sender/contact identities, merchant names, transaction amounts, account/card/reference numbers, transaction/database rows, split details, contacts, PINs, credentials, access tokens, arbitrary UI state/props, or raw parser/model input/output. “Other relevant detail” means additional allowlisted technical metadata, not a dump of application state.

Breadcrumbs should live in a bounded in-memory ring during normal app use. If crash recovery requires persistence across process death, persist only the sanitized action IDs and timestamps, cap count/age, and clear them after the report is acknowledged or expires. Do not persist raw errors or transaction context in the outbox.

## Architecture and ownership

```text
UI / services / native adapters
        │ unexpected failure + static component/screen/action context
        ▼
src/services/errorReporting/errorReporter.ts
        ├── allowlist, sanitize, fingerprint, deduplicate
        ├── bounded breadcrumb context
        └── submit to local outbox (best effort)
                    │ app foreground/network available
                    ▼
src/infrastructure/errorReporting/SupportReportClient.ts
                    │ HTTPS, versioned API, bounded retry
                    ▼
support-api/ POST /v1/support/error-reports
        ├── authenticate/attest where supported, validate schema, rate-limit
        ├── deduplicate and suppress abuse
        ├── render a safe plain-text email
        └── mail provider adapter → hrnharshit1@gmail.com
```

- `src/core/` should not import React Native, `fetch`, a mail provider, or support-backend code.
- `src/services/errorReporting/` owns the application-facing capture API and feature-neutral error classification.
- `src/infrastructure/errorReporting/` owns the mobile HTTP client and local outbox adapter.
- Platform-specific fatal-crash capture and installation attestation belong under `src/infrastructure/native/`.
- Wire dependencies in `src/app/composition/`. Instrument screens through small route/action identifiers; no screen redesign is in scope.
- Add `support-api/` as a separate deployable Node.js/TypeScript service in this repository, with a versioned HTTP API and a `Mailer` interface. Keep the hosting platform and mail provider behind adapters so they can be selected without changing the mobile capture contract.
- The backend is the only component that knows the recipient mailbox or mail-provider credentials. Store credentials in the deployment secret manager/environment, never in mobile source, the bundled app, or source control.

## Backend implementation plan

### Endpoint

Implement `POST /v1/support/error-reports` with:

- HTTPS only; reject oversized requests and unsupported content types.
- Strict runtime schema validation, unknown-field rejection, maximum field lengths, and server-side sanitization. Client-side filtering alone is not a privacy boundary.
- A `reportId` idempotency key so retries do not send duplicate email.
- Abuse controls: per-source and per-installation quotas, burst/rate limits, payload-size limits, automated abuse monitoring, and platform app-attestation evaluation for Android/iOS where practical. Do not rely on an embedded static API secret; it can be extracted from a mobile app.
- Generic responses that do not expose server internals or mail-provider details. Return accepted/duplicate/rate-limited/unavailable outcomes.
- Email header injection protection; render only validated fields as plain text. Escape HTML if an HTML format is ever introduced.
- Server logs limited to request ID, status, timing, and rate-limit/security metadata. Do not log full report bodies or mail contents.

### Mail delivery and retention

- Implement a `Mailer` adapter with provider credentials read only from deployment secrets. Keep `hrnharshit1@gmail.com` as a server-side recipient setting, not a mobile constant.
- Send a concise report containing the report ID, UTC time, error category/summary, app/platform versions, component/screen, breadcrumbs, and safe stack frames.
- Use an outbox/queue so mail-provider downtime does not lose accepted reports. Retry with bounded exponential backoff and idempotency; dead-letter and alert on persistent backend delivery failures without sending report contents to logs.
- Retain the full report only as long as required to deliver and investigate it. Select a retention period and deletion process before deployment; store minimal operational metadata after report-body deletion.
- Apply deduplication/grouping and per-client quotas to prevent loops or a broken release from flooding the support mailbox. Preserve occurrence counts and timestamps without retaining sensitive payloads.

## Mobile delivery, consent, and failure behavior

- Implement a small, best-effort local outbox containing only sanitized reports. Bound its size and age; remove entries after backend acknowledgement or expiration. Report queue writes must not depend on transaction table changes.
- Flush on app startup/foreground and when connectivity is available. Use capped exponential backoff, honor `Retry-After`, and avoid retrying permanent validation/authentication failures.
- Keep reporting enabled by default as requested, and add a simple Settings opt-out plus a clear privacy notice describing the diagnostic fields and recipient. The reporting toggle must not change unrelated app behavior. If the user disables reporting, remove queued reports and stop collecting breadcrumbs.
- Do not show a modal during a failed transaction. A report ID can be included in a safe error message only where it helps the user contact support.
- Existing local Jaeger development telemetry is separate. Do not repoint it to the support mailbox or use it as the production reporting transport.

## Existing error-handling cleanup

Before enabling support delivery, audit existing `console` output and telemetry attributes. Remove sender identifiers from message-listener logs, avoid raw error messages in telemetry, and ensure support reporting receives sanitized structured errors rather than scraped console logs. Keep local debugging useful with error codes and safe context.

The current app has no centralized error reporter, root error boundary, action breadcrumb facility, or backend. `src/infrastructure/observability/telemetryService.ts` is development-only and targets local Jaeger. `App.tsx`, `index.js`, `AppNavigator`, the transaction services, database adapter, native bridges, and async catches are likely integration points; inventory them before editing so every failure has one reporting owner.

## Implementation sequence

1. Inventory failure boundaries and classify expected outcomes versus reportable failures. Remove existing sender/raw-error logging leaks before shipping reports.
2. Define the versioned report schema, sanitizer, stable error codes, breadcrumb API, capture API, and opt-out setting. Unit-test redaction with financial/SMS fixtures.
3. Add the Node.js/TypeScript `support-api/` service, schema validation, abuse controls, idempotency, queue, mailer adapter, health checks, and backend tests. Keep provider configuration in deployment secrets.
4. Add the mobile reporter, bounded breadcrumb ring, sanitized local outbox, HTTP client, retry policy, and composition wiring.
5. Integrate the root UI boundary, JS/unhandled promise handlers, and known operational error boundaries. Add native fatal-crash capture only with verified platform-safe handling and next-launch submission.
6. Add the small reporting opt-out/privacy notice to the current Settings screen only if needed; no redesign or new screen.
7. Configure staging recipient/endpoint, verify delivery and abuse controls, then configure production to forward to `hrnharshit1@gmail.com`. Do not enable production delivery until secrets, TLS, retention, privacy notice, and rate limits are verified.
8. Record endpoint ownership, deployment instructions, incident response, data retention, and verification in the implementation changelog and architecture docs.

## Verification and exit criteria

1. Unit tests prove sensitive values are removed from summaries, stacks, and breadcrumbs, including nested/native error cases.
2. Component/screen identifiers and named action breadcrumbs appear in a test report, while action values and transaction/message content do not.
3. Expected transaction outcomes do not create reports; each unexpected failure is captured once with a stable category/fingerprint.
4. Reporting disabled, backend offline, queue full, timeout, HTTP 4xx/5xx, mail outage, or storage failure never blocks normal app use or changes transaction results.
5. Retries are bounded and idempotent; rate limits/dedup prevent loops and mailbox floods.
6. Backend rejects invalid/oversized/unknown-field payloads, protects against header injection, and never logs report bodies or credentials.
7. Only the backend can access mail-provider credentials and the recipient setting. Mobile builds contain no SMTP/API secrets.
8. Android/iOS capture and report delivery are verified on supported targets; native fatal capture does not replace OS crash handling.
9. Opt-out stops capture and deletes queued reports; privacy notice describes what is sent and where.
10. Staging email delivery reaches the configured test mailbox, and production configuration targets `hrnharshit1@gmail.com` only after the service is deployed and secrets are provisioned.

## Open deployment decisions

- Backend hosting/runtime environment and who operates it.
- Transactional email provider and credentials/secrets management.
- Android/iOS app-attestation strategy and fallback/rate-limit policy.
- Report-body retention duration, deletion procedure, and mailbox retention expectations.
- Whether to send one email per unique error or periodic grouped summaries after repeated occurrences. The backend must suppress floods either way.
- Production endpoint and staging recipient. These values must be configured at deployment; no endpoint or provider is currently available in the repository.
