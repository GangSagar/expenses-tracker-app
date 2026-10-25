# Phase 6: Unified Transaction Deduplication

**Status: Complete.** Live ingestion, historical import, review confirmation, and maintenance deduplication now use one pure policy. Repository queries and in-memory indexes provide candidate records without defining matching semantics.

Phase 6 also implements the requested notification after each transaction creation or explicit edit is successfully saved.

## Implementation result

- Exact normalized reference IDs match globally across eligible history. Exact normalized message matches require equal amount and transaction type within five minutes. Weak amount/merchant/type/time similarity returns a possible-match result; it does not silently block a write.
- Live possible matches enter the existing review queue. Historical preview shows possible matches unchecked with a short review hint. A user-selected row may pass a weak match at commit, but exact matches remain blocked.
- Manual creation retains its explicit-entry dedup bypass. Live, confirmation, import, and maintenance use the shared policy. Maintenance only auto-invalidates definite matches and retains Phase 5 settlement-history guards.
- A shared indexed cache supports chronological import/preview; SQLite returns broad global-reference and timestamp-window candidate rows. Invalidated and duplicate rows are excluded by the pure policy.
- Successful live, manual, confirmed, imported, and edited transactions request a local notification containing transaction type, amount, and merchant/description. Android uses the existing bridge; iOS uses a new `UNUserNotificationCenter` module. Notification failures do not alter persistence results.
- The existing import UI remains intact apart from a small possible-duplicate hint and unchecked default for those rows.

Files, rationale, and verification are recorded in the Phase 6 section of the [implementation changelog](./IMPLEMENTATION_CHANGELOG.md#phase-6--unified-deduplication-complete).

## Goal

Prevent the same transaction from being recorded twice across SMS, notifications, imports, and review confirmation while preserving legitimate repeated purchases. Make a duplicate result explainable through a typed match reason, and ensure invalidated or already-duplicate rows do not suppress valid transactions.

The existing preview/progress UI stays in place. This phase does not include a UI redesign.

## Transaction-saved notification requirement

After a transaction is successfully persisted or explicitly edited, send the user a local notification with brief details such as transaction type, amount, and merchant/description. Apply this to successful live auto-saves, manual creation, review confirmation, transaction edits, and each successfully imported transaction. A duplicate, rejected, pending-review, or failed transaction must not produce a “saved” notification. A notification delivery failure must be logged/handled separately and must not change the successful persistence result or cause a retry that inserts the transaction again.

The app already has an Android bridge, `MessageModule.showExpenseNotification()`, but it is currently called only for live auto-saves while the app is backgrounded. Phase 6 should route all saved-transaction notifications through one service/adapter after persistence succeeds, and remove the current listener-specific duplicate notification logic. Send the notification regardless of whether the app is foregrounded or backgrounded so every successful save follows the same rule. Do not include raw message contents, full account identifiers, or other unnecessary transaction details.

Keep the notification side effect outside the core dedup policy and repository transaction. The notification is informational; database persistence remains authoritative. During a historical import, notify once for each row whose persistence result is `saved`; do not notify for duplicates or failed rows.

The current bridge is Android-specific. The implementation must check the supported runtime platforms and provide an equivalent local-notification adapter where this app supports another platform; if notifications are unavailable or permission is denied, persistence still succeeds and the failure is reported without changing the transaction result.

## Baseline behavior before Phase 6

| Path | Current implementation | Semantic difference or risk |
|---|---|---|
| Live message and review confirmation | `src/core/dedup/duplicateCheck.ts` scans a five-minute recent slice; matches reference IDs, reference text embedded in a message, shared 6–12 digit tokens with equal amount/type, or equal amount + normalized merchant + type. The time test compares existing timestamps to `Date.now()`, not to the candidate timestamp. | Reference identity is unintentionally limited by the fetched slice. Embedded and arbitrary numeric tokens can match unrelated content. The merchant fallback can suppress two real repeated purchases. Invalid and duplicate rows can enter the recent slice. |
| Historical preview | `previewHistoricalMessage()` calls SQLite cache matching, then immediately adds each nonduplicate preview candidate to the same cache. | Cache matching uses a 15-minute timestamp window and amount only; reference and raw message matches are case-sensitive. Preview rows can suppress later rows even if the user later deselects them. |
| Historical commit | `importHistoricalTransactions()` uses the 15-minute cache policy, then adds successful imported rows. Candidates are processed chronologically. | It can disagree with live ingestion and match different merchants or debit/credit types solely by amount/time. |
| Manual creation | `persistAcceptedTransaction()` receives no duplicate predicate. | Manual rows bypass deduplication, intentionally allowing direct user entry but also allowing accidental double-entry. |
| Maintenance dedup | `deduplicateDatabase()` uses a separate five-minute amount + normalized merchant + type scan, then soft-invalidates later rows. | It ignores reference/message evidence, has its own time semantics, and can classify differently from both ingestion paths. It already refuses to invalidate rows with split/payment history (Phase 5 safeguard). |
| SQLite helpers | `isDuplicateTransaction()`, `isDuplicateWithCache()`, and `createDedupCache()` each encode their own field selection, normalization, window, and invalid-row rules. | SQL/index performance helpers also define business semantics, so a cache optimization changes behavior. |

## Shared policy implemented

The policy receives a normalized candidate and a set/index of eligible existing transactions. It returns a typed result such as `no_match` or `match` with a reason and matched transaction ID. SQL and cache layers only supply candidates; they do not decide whether two transactions are duplicates.

Matching order:

1. **Reference ID:** exact normalized `referenceId` match across all eligible history, regardless of source, merchant, amount, or time. Normalize case and surrounding whitespace. Do not use substring matching inside arbitrary message text.
2. **Exact message delivery:** normalized full raw-message match, equal amount and transaction type, and timestamps within the shared window. This catches redelivery across SMS/notification sources without treating recurring templates as globally identical.
3. **Weak similarity:** equal amount, transaction type, normalized merchant, and timestamps within the shared window is a possible match, not proof. It must not silently suppress a candidate unless the policy decision below explicitly chooses that behavior. If exposed as a review result, retain the evidence and matched row.

Additional recommended rules:

- Compare `abs(candidate.timestamp - existing.timestamp)`; do not use the wall clock to define historical matches.
- Use one shared default time window. Recommended initial value: **5 minutes**, matching the live path and limiting false matches. Make it a named policy constant and test the boundary.
- Exclude `isInvalid` and `isDuplicate` existing rows from matching. A restored row becomes eligible again after restoration.
- Do not limit cross-source comparisons; SMS and notification records for the same event should deduplicate.
- Do not compare arbitrary numeric tokens from raw text. Only structured `referenceId` values count as reference evidence.
- Keep `source` as evidence for diagnostics, not a condition that prevents cross-source matching.
- Preserve caller-specific behavior for explicit manual entry unless the user chooses to include manual entries in automatic deduplication. Manual user input should not be silently rejected by default.
- Keep dedup maintenance conservative: only auto-mark rows that the shared policy identifies as definite duplicates. Do not bulk invalidate weak similarities. Continue to reject an operation if it would invalidate Phase 5 split/repayment history.

## Policy choices applied

Implementation follows the plan's recommended defaults:

1. Weak amount/merchant/time similarity is possible and requires review; it never silently suppresses a transaction.
2. The shared timestamp window is five minutes; reference IDs match globally.
3. Explicit manual entry bypasses automatic deduplication.
4. Maintenance only marks definite matches and leaves possible matches untouched.

## Implementation plan

### 1. Extract the policy into the core

- Replace the boolean-only `isDuplicate()` with a pure policy that accepts normalized candidates and eligible prior rows/index hits.
- Define typed evidence/reasons: `reference_id`, `exact_message`, and (if approved) `amount_merchant_time` as a possible match.
- Use injected time-window options only where useful for tests; default to the single shared constant.
- Normalize reference IDs and message text consistently. Do not move matching conditions into SQLite.

### 2. Make the repository supply candidate data

- Replace semantic SQL helpers with repository methods that return policy inputs or indexed candidates.
- Ensure persisted lookups exclude invalid and duplicate rows, including reference matches.
- Make the in-memory cache store the fields required by the shared policy: transaction ID, amount, merchant, transaction type, timestamp, source, reference ID, raw message, invalid flag, duplicate flag.
- Keep an indexed lookup for reference IDs and time/amount candidates so import remains efficient; preserve policy parity with full-row evaluation.
- Keep `deduplicateDatabase()` as an orchestration/persistence operation that calls the shared policy and uses an atomic write for definite matches.

### 3. Route every automatic entry path through it

- Live ingestion and review confirmation call the same application dedup operation before `persistAcceptedTransaction()`.
- Historical preview uses the same policy against a snapshot of the persisted ledger plus rows already seen in the current scan. Preview must not mutate the persisted-ledger cache merely by proposing a row.
- Historical commit re-evaluates selected candidates against current persisted state and previously successful rows using the same policy. This handles changes made between preview and commit and preserves chronological commit order.
- Manual entry follows the confirmed behavior above; do not accidentally inherit an automatic path's predicate.
- Keep import progress, partial success, retry selection, and transaction persistence atomicity unchanged.
- Emit the transaction-saved notification only after the repository confirms persistence. Centralize the effect so live, manual, review-confirmed, and imported writes cannot silently omit it or send twice.

### 4. Preserve Phase 5 guarantees

- Maintenance dedup must continue refusing to invalidate a candidate with settlement or repayment history.
- Duplicate candidates must not be used for repayment planning or insert.
- A failed dedup maintenance transaction must leave all selected rows unchanged.
- Restoring an invalidated transaction must make it eligible for subsequent comparisons according to the same policy.

### 5. Remove obsolete policy implementations and update records

- Remove or reduce `isDuplicateTransaction()` and the existing semantic `isDuplicateWithCache()` to thin candidate retrieval/index adapters.
- Remove the duplicate scan logic from `deduplicateDatabase()` and any import-only duplicate rules from `SettingsScreen.tsx`.
- Update the application/repository contracts, architecture, Phase 6 plan, and implementation changelog with the accepted policy and actual files changed.

## Test plan and exit criteria

1. Pure policy tests cover normalized exact reference IDs, exact-message evidence, weak amount/merchant similarity, amount/type mismatch, source differences, timestamp boundaries, and legitimate repeated purchases.
2. In-memory cache results match policy results from a full list of the same eligible transactions.
3. Invalidated and duplicate rows do not suppress new candidates; restoring one makes it eligible again.
4. Live ingestion, review confirmation, import preview, and import commit produce the same dedup result for equivalent candidates and ledgers, except for the explicitly retained manual-entry behavior.
5. Preview-only rows do not contaminate the commit cache; deselected proposals do not suppress selected rows during final import.
6. Historical import remains chronological, partial successes remain committed, failures remain retryable, and repeated attempts do not create duplicates.
7. Maintenance dedup applies only definite matches under the approved policy, is atomic, and retains Phase 5 settlement-history protection.
8. No UI redesign; existing import progress/selection remains usable.
9. Exactly one saved notification is requested for each persisted creation path (live, manual, review confirmation, and each imported row) and successful edit; duplicates, rejects, pending reviews, and failed writes produce none. Notification failure does not roll back persistence or report the transaction as unsaved.
10. TypeScript, focused dedup/import/notification tests, full suite, lint, `git diff --check`, and Graphify pass. Exact verification is recorded in the implementation changelog.

## Out of scope

- Phase 5 split/repayment allocation and legacy reconciliation behavior.
- Phase 7 schema migration framework (since completed; see the Phase 7 plan and changelog).
- Local/offline AI from Phase 2.
- Reworking the import UI beyond presenting the already available preview/selection state for an approved possible-match result.
