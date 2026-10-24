# SpendWise: Implementation Plan & Engineering Roadmap

## 1. Executive Overview & Methodology

The SpendWise architecture was executed via a **progressive hardening lifecycle**, transitioning from a pure regex-based SMS scraper into an intelligent, zero-network, on-device financial operating system.

The implementation strategy adheres to four core engineering tenets:

1. **Zero Cloud Egress**: Zero external server dependencies for transaction parsing, storage, or AI intelligence.
2. **Native Asynchronous Offloading**: High-throughput Android Telephony ContentResolver querying decoupled from the React Native JS thread.
3. **Data Integrity & Determinism**: ACID-compliant local relational persistence with schema migration safeguards and idempotent deduplication.
4. **Developer Operability**: Automated test-case collection from physical hardware, headless CLI diagnostics, and distributed OpenTelemetry tracing.

---

## 2. Chronological Implementation Phases

```mermaid
gantt
    title SpendWise Engineering Lifecycle
    dateFormat  YYYY-MM-DD
    section Phase 1: Foundation
    React Native & Native SMS Bridge       :done, p1_1, 2026-05-17, 2026-05-17
    Regex Parsing Engine & DLT Filtering   :done, p1_2, 2026-05-17, 2026-05-17
    Quick-SQLite Schema v1 & Zustand Store :done, p1_3, 2026-05-17, 2026-05-17
    section Phase 2: Reconciliation & Splits
    Available Balance Extraction           :done, p2_1, 2026-05-17, 2026-05-17
    Android Contacts Split Debt Ledger     :done, p2_2, 2026-05-17, 2026-05-17
    Manual Cash FAB & Transaction Editor   :done, p2_3, 2026-05-17, 2026-05-17
    Accounts Carousel Screen               :done, p2_4, 2026-05-17, 2026-05-17
    section Phase 3: AI Intelligence
    On-Device Naive Bayes Classifier       :done, p3_1, 2026-05-17, 2026-05-18
    Predictive Burn-Rate Budget Advisor   :done, p3_2, 2026-05-17, 2026-05-18
    Mathematical Unicode Normalizer        :done, p3_3, 2026-05-18, 2026-05-18
    section Phase 4: Production Hardening
    Timestamp-based SMS Paging & Syncer    :done, p4_1, 2026-05-18, 2026-05-18
    Cross-Bank Reference Deduplication     :done, p4_2, 2026-05-18, 2026-05-19
    Income/Cash Multi-Type Support         :done, p4_3, 2026-05-19, 2026-05-20
    Danger Zone Full Reset & Backup        :done, p4_4, 2026-05-18, 2026-05-20
    section Phase 5: Observability & Tooling
    OpenTelemetry & Jaeger Tracing         :done, p5_1, 2026-05-20, 2026-10-18
    Headless CLI Diagnostics (`npm run parse`) :done, p5_2, 2026-10-18, 2026-10-18
    Device SMS Collection Harness          :done, p5_3, 2026-10-18, 2026-10-19
    section Phase 6: Learning-Based Engine
    Data-Driven Bank & Merchant Rules      :done, p6_1, 2026-10-20, 2026-10-22
    Lexical Tokenizer & Extractors         :done, p6_2, 2026-10-22, 2026-10-23
    Confidence Engine & SQLite Learning    :done, p6_3, 2026-10-23, 2026-10-24
    10-Stage Orchestrator & Backward Adapt :done, p6_4, 2026-10-24, 2026-10-24
```

---

## 3. Phase-by-Phase Technical Breakdown

### Phase 1: MVP & Core Ingestion Pipeline (v1.0.3 - v1.0.4)

* **Goal**: Establish the basic capability to read local SMS, detect debits/credits via regular expressions, and persist records in local SQLite.
* **Key Deliverables**:
  - `android/.../MessageModule.kt`: Custom React Native native module querying Android's `Telephony.Sms.CONTENT_URI` with projected columns (`_id`, `address`, `body`, `date`, `read`).
  - `src/services/sms/parser.ts`: Initial regex patterns for parsing amount (`(?:rs\.?|inr)\s*([\d,]+(?:\.\d{2})?)`), transaction type (`debited|spent|paid` vs `credited|deposited`), merchant (`at|to|vpa\s+([\w\s]+)`), and account number (`(?:ac|a/c|card|acct)\s*no\.?\s*([x\d]+)`).
  - `src/services/sms/filter.ts`: TRAI DLT alphanumeric header filter (e.g., `VM-HDFCBK`, `AD-SBIINB`, `BP-KOTAKB`) and OTP rejection filter (`otp|one time password|verification code`).
  - `src/services/db/db.ts`: SQLite database initialization utilizing `react-native-quick-sqlite` for sub-millisecond synchronous C++ JSI bindings.
  - `src/store/useExpenseStore.ts`: Centralized state management via Zustand storing parsed transactions and current month aggregates.
* **Verification Criteria**: Successfully ingest 100 SMS messages in under 500ms on a standard Android emulator with accurate debit detection.

---

### Phase 2: Reconciliation, Splits & Accounts (v1.1.0 - v1.2.0)

* **Goal**: Transition from a passive expense log to an active financial ledger supporting multi-account tracking, peer debt splits, and manual cash adjustments.
* **Key Deliverables**:
  - `src/screens/AccountsScreen.tsx` & `src/components/AccountsSlider.tsx`: Visual carousel of detected financial institutions, displaying individual available balances, last transaction timestamp, and net account breakdown.
  - `src/screens/SplitLedgerScreen.tsx` & `src/services/db/splitsRepo.ts`: Peer-to-peer split tracker integrating Android Contacts (`react-native-contacts`) allowing users to split transactions, calculate owed vs owing balances, and mark splits settled.
  - `src/components/EditTransactionModal.tsx` & `src/components/AddExpenseFAB.tsx`: Floating Action Button and modal interface allowing manual entry of cash expenses and manual overrides for category, merchant, or notes.
  - Schema Migration v2: Added `available_balance`, `reference_id`, `is_invalid`, `split_with`, and `split_settled` columns to `expenses` table.
* **Verification Criteria**:
  - Running balance extraction across ICICI, HDFC, SBI, BOB, and Axis Bank alerts with >90% extraction accuracy.
  - Seamless split calculation where an expense divided 50/50 deducts only the user's portion from net monthly spending.

---

### Phase 3: AI Intelligence & Unicode Normalization (v1.2.1 - v1.4.0)

* **Goal**: Eliminate false positives from transactional spam, provide predictive burn-rate warnings, and parse promotional unicode fonts.
* **Key Deliverables**:
  - `src/services/ai/spamClassifier.ts`: On-device Naive Bayes probabilistic classifier trained on financial SMS vocabulary (tokenized unigrams and bigrams). Computes log probabilities to classify messages as `TRANSACTION`, `SPAM_PROMO`, or `UNKNOWN`.
  - `src/services/ai/budgetAdvisor.ts`: Deterministic burn-rate predictive algorithm calculating:

    $$
    \text{Burn Rate} = \frac{\text{Total Spent in Month}}{\text{Days Elapsed}}
    $$

    $$
    \text{Projected Spend} = \text{Burn Rate} \times \text{Days in Month}
    $$

    Generates actionable financial warnings (e.g., "At current rate of ₹1,450/day, you will exceed your ₹40,000 budget by the 22nd").
  - `src/services/sms/unicode.ts`: Mathematical font normalization mapping stylized Unicode characters (Mathematical Bold, Sans-Serif, Script used by brands like Swiggy, Zomato, and Cred) back to standard ASCII `[A-Za-z0-9]`.
* **Verification Criteria**:
  - Spam classifier rejects 99% of promotional credit card offers and loan solicitations.
  - Unicode normalizer translates `₹ 𝟓𝟒𝟗 𝐝𝐞𝐛𝐢𝐭𝐞𝐝` to standard ASCII `₹ 549 debited` with 100% regex fidelity.

---

### Phase 4: Production Hardening & High-Fidelity Sync (v1.3.1 - v1.5.0)

* **Goal**: Prevent message sync timeouts on devices with 10,000+ messages, resolve multi-SMS debit/credit duplicate records, and support income logging.
* **Key Deliverables**:
  - `src/services/sms/syncer.ts`: Timestamp-based paging querying native Android SMS in rolling 30-day batches using cursor offsets, with persistent checkpointing in `settings` table (`last_sms_sync_timestamp`).
  - `src/services/sms/dedup.ts`: Multi-stage deduplication:
    - Exact hash matching: `MD5(account + amount + timestamp)`.
    - UPI Reference ID matching (`UPI-Ref: 312345678901`).
    - Sliding window fuzzy match: Matching SMS received within 180 seconds bearing identical amount and merchant token.
  - `src/services/sms/orchestrator.ts`: Unified pipeline coordinating normalization, classification, regex extraction, deduplication, auto-repayment detection, and repository insertion.
  - Multi-Type Transaction Support: Support for `DEBIT`, `CREDIT`, `TRANSFER`, and `CASH` across queries, filters, and analytics.
* **Verification Criteria**:
  - Paged synchronization runs smoothly on phones with 5,000+ total SMS without freezing the UI or exceeding 35MB RAM footprint.
  - Duplicate notification vs SMS events correctly de-duplicated to a single database entry.

---

### Phase 5: Observability, Diagnostics & Real Hardware Testing (Current)

* **Goal**: Provide enterprise-grade telemetry, automated physical device testing harnesses, and headless debugging scripts.
* **Key Deliverables**:
  - `src/services/telemetryService.ts`: OpenTelemetry instrumented tracer sending OTLP spans over HTTP (port 4318) to a local standalone Jaeger collector. Captures span attributes: `sms.count`, `sms.parsed_count`, `sms.duplicates`, `sms.duration_ms`.
  - `scripts/jaeger/`: Standalone Jaeger binary deployment with npm management scripts (`npm run jaeger:start`, `npm run jaeger:stop`).
  - `scripts/collect-testcases.py`: Python ADB automation harness that queries physical Android devices (`adb shell content query --uri content://sms`), strips personal phone numbers for privacy, and generates executable Jest test suites (`src/__tests__/collected-real.test.ts`).
  - `scripts/parse-sms.sh` & `npm run parse`: Headless CLI runner executing TypeScript parser logic against arbitrary SMS strings in the terminal.
* **Verification Criteria**:
  - Complete execution of real device test suite with 432 collected SMS validating parser regressions.
  - End-to-end trace visualization in Jaeger UI at `http://localhost:16686`.

---

### Phase 6: Generic & Learning-Based Parsing Engine (v1.6.0)

* **Goal**: Modernize parsing from brittle monolithic regexes to a Clean Architecture 10-stage pipeline that is data-driven, modular, self-learning, and zero-code extensible for 15+ banks, UPI apps, wallets, and future institutions.
* **Key Deliverables**:
  - `src/core/parser/config/`: Declarative JSON schemas (`bankRules.json`, `merchantAliases.json`, `categoryRules.json`, `tokenDictionary.json`).
  - `src/core/parser/normalizer/`: Composable normalization pipeline (`unicodeNormalizer`, `currencyNormalizer`, `keywordNormalizer`, `whitespaceNormalizer`).
  - `src/core/parser/tokenizer/`: Lexical token classifier preserving token streams and character offsets.
  - `src/core/parser/extractor/`: Targeted extractors (`AmountExtractor`, `AccountExtractor`, `BankExtractor`, `VpaExtractor`, `ReferenceExtractor`, `BalanceExtractor`, `PaymentModeExtractor`, `RawMerchantExtractor`) coordinated via `EntityExtractor`.
  - `src/core/parser/resolver/`: Contextual business resolvers (`MerchantResolver`, `TransactionResolver`, `CategoryResolver`).
  - `src/core/parser/confidence/`: Weighted multi-factor confidence scoring engine.
  - `src/core/parser/learning/`: Adaptive on-device learning engine (`LearningEngine`) with repository abstraction (`ILearningRepository`, `InMemoryLearningRepository`, `SQLiteLearningRepository`).
  - `src/core/parser/ai/`: Offline AI fallback interface (`AIResolver`) with persistent local caching (`AICache`).
  - `src/core/parser/orchestrator/`: 10-stage pipeline coordinator (`ParserOrchestrator`).
  - `src/core/parser/parseMessage.ts`: Backward compatibility adapter returning typed `ParsedTransaction`.
* **Verification Criteria**:
  - 100% test pass rate across 599 tests across 22 test suites with 0 regressions.
  - 64 unit tests covering every parser stage in `src/__tests__/parser/`.
  - Seamless support for 15+ Indian financial institutions (SBI, HDFC, ICICI, Axis, Kotak, BOB, PNB, Canara, etc.).

---

## 4. Work Breakdown Structure (WBS) & Responsibility Matrix

| Module                          | Core Files                                                       | Responsibility                                                   | Dependencies                  |
| :------------------------------ | :--------------------------------------------------------------- | :--------------------------------------------------------------- | :---------------------------- |
| **Android Native Bridge** | `android/.../MessageModule.kt`, `MessagePackage.kt`          | Cursor pagination, contact lookup, SMS listener                  | Android SDK 34, Kotlin        |
| **Modular Parsing Engine**| `src/core/parser/*` (`config`, `normalizer`, `tokenizer`, etc.) | 10-stage pipeline, tokenization, entity extraction, resolvers    | Pure TypeScript               |
| **Confidence & Learning** | `src/core/parser/confidence/`, `learning/`, `ai/`                | Multi-factor scoring, on-device SQLite learning, AI fallback    | `react-native-quick-sqlite`   |
| **AI Classifier**         | `src/services/ai/spamClassifier.ts`                            | On-device Naive Bayes spam scoring                               | Pure TypeScript               |
| **Budget Advisor**        | `src/services/ai/budgetAdvisor.ts`                             | Predictive burn rate calculation                                 | Pure TypeScript               |
| **Persistence Engine**    | `src/services/db/db.ts`, `expenseRepo.ts`, `splitsRepo.ts` | ACID relational storage, migrations, aggregation queries         | `react-native-quick-sqlite`   |
| **State Layer**           | `src/store/useExpenseStore.ts`, `useSettingsStore.ts`        | In-memory reactive state, cache hydration                        | Zustand                       |
| **UI Components**         | `src/screens/*.tsx`, `src/components/*.tsx`                  | Glassmorphic dark dashboard, charts, modals                      | React Native Core, SVG        |
| **Telemetry & QA**        | `telemetryService.ts`, `collect-testcases.py`                | Distributed tracing, device message extraction                   | OpenTelemetry, ADB, Python    |

---

## 5. Technical Risk Analysis & Mitigation

| Identified Risk                                   | Severity | Probability | Mitigation Strategy                                                                                                                      |
| :------------------------------------------------ | :------: | :---------: | :--------------------------------------------------------------------------------------------------------------------------------------- |
| **Google Play SMS Permissions Rejection**   | Critical |    High    | Maintain strict separation of financial analysis; distribute via GitHub Releases and F-Droid; avoid non-essential permissions.           |
| **Manufacturer Battery Aggressive Killing** |   High   |    High    | Rely on explicit foreground sync on app resume rather than untrusted background wake-locks (`READ_SMS` sync on startup).               |
| **Irregular Bank SMS Templates**            |   High   |   Medium   | Continuous automated test collection (`npm run test:collect`) across varied user devices; extensible bank regex maps.                  |
| **SQLite DB Corruption on Power Loss**      |  Medium  |     Low     | Enable SQLite WAL (Write-Ahead Logging) mode; atomic transaction wrapping for batch insertions.                                          |
| **Large Message Sync UI Freezes**           |   High   |   Medium   | Implemented cursor pagination with chunked processing (100 messages/batch) and cooperative event-loop yielding (`setTimeout(..., 0)`). |

---

## 6. Future Architectural Roadmap

```mermaid
graph LR
    subgraph Upcoming Milestones
        M1[Milestone 6: Cloud Encrypted Backup] --> M2[Milestone 7: UPI Notification Listener]
        M2 --> M3[Milestone 8: On-Device Receipt OCR]
        M3 --> M4[Milestone 9: Multi-Currency & FX Engine]
    end
```

### Milestone 6: End-to-End Encrypted Cloud Backup

- Client-side AES-GCM-256 encryption using user password via PBKDF2 key derivation.
- Optional Google Drive / WebDAV export without storing keys on any intermediary server.

### Milestone 7: UPI Push Notification Real-Time Listener

- Android `NotificationListenerService` integration to intercept instant UPI payment notifications from GPay, PhonePe, Paytm, and BHIM before SMS arrives.
- Unified deduplication between notification and SMS payloads.

### Milestone 8: On-Device Receipt OCR

- Integration with Google ML Kit Text Recognition for offline scanning and parsing of printed physical store receipts and restaurant bills.
- Automatic itemization and split assignment.

### Milestone 9: Multi-Currency & Cross-Border Ledger

- Offline historical foreign exchange rate tables.
- Automatic conversion of international transactions (USD, EUR, GBP, AED) to default base currency (INR).
