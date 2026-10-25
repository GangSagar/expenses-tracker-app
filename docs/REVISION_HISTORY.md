# SpendWise: Git Revision History & Architectural Audit

> **Historical record:** Commit descriptions, test counts, performance claims, and architecture statements below are snapshots from their recorded dates. They are not current runtime guarantees. Use [current architecture](./ARCHITECTURE.md), [live message flow](./APP_MESSAGE_LISTENER_FLOW.md), and the [active restructuring plan](./v2.0%20-%20improvement_plan/ARCHITECTURE_RESTRUCTURING_PLAN.md) for present-day behavior and status.

## 1. Executive Summary

This document provides a comprehensive, chronological audit of the SpendWise repository's development lifecycle. Every git commit—from the initial foundation commit (`e381d05`) to the latest production release and observability instrumentation—is cataloged with technical rationales, pull request associations, and architectural impacts.

### High-Level Release Milestones

| Release Tag | Merge Date | PR # | Primary Focus / Milestone |
| :--- | :---: | :---: | :--- |
| **v1.0.3** | 2026-05-17 | — | Initial repository scaffolding and core Android SMS ingestion proof-of-concept. |
| **v1.0.4** | 2026-05-17 | #1 | Available balance extraction, initial Splits and Accounts screens, history filtering. |
| **v1.1.0** | 2026-05-17 | #2 | Peer-to-peer split debts ledger, native contacts integration, manual cash entry FAB. |
| **v1.1.1** | 2026-05-17 | #3 | Dedicated AccountsScreen for bank balance tracking and reconciliation, app icons. |
| **v1.2.0** | 2026-05-17 | #4 | Bank reference ID extraction, transaction soft-delete trashing lifecycle, and modal refactors. |
| **v1.2.1** | 2026-05-17 | #5 | On-device Bayesian SMS spam classifier, predictive burn-rate smart budget advisor. |
| **v1.3.0** | 2026-05-17 | #6 | App rebranding to SpendWise, CI GitHub Release APK uploader, accounts carousel. |
| **v1.3.1** | 2026-05-18 | #7 | Timestamp-based SMS paging syncer, acceptance of 3-6 digit carrier shortcodes. |
| **v1.3.x (PR #8)** | 2026-05-18 | #8 | Cross-bank UPI reference deduplication, dynamic Bayes category auto-training. |
| **v1.4.0** | 2026-05-18 | #9 | Mathematical font Unicode normalization, settings danger zone full data wipe. |
| **v1.5.0** | 2026-05-20 | #10 | Income & cash multi-type transaction support, transaction orchestrator, retry queue. |
| **v1.6.0** | 2026-10-24 | — | Generic, extensible, learning-based parsing engine: 10-stage pipeline, data-driven JSON rules, lexical tokenizer, confidence engine, on-device SQLite learning, and AI fallback interface. |
| **Unreleased snapshot (historical)** | 2026-10-24 | — | At that snapshot: OpenTelemetry/Jaeger tooling, headless CLI, ADB fixture collector, and a recorded 599-test suite. This is not the current test count or status. |

---

## 2. Exhaustive Commit-by-Commit Audit Table

| Commit Hash | Author | Date (IST) | Pull Request | Component / Module | Commit Subject & Technical Details |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `e381d05` | HRN Harshit | 2026-05-17 | — | Core Scaffolding | **first commit**: Initial React Native 0.85 project template, Android build configuration, and base folder hierarchy. Tagged `v1.0.3`. |
| `97e5659` | HRN Harshit | 2026-05-17 | #1 | Parser & UI | **feat: implement balance extraction from SMS, add Splits and Accounts screens, and update history filtering logic**: First pass at parsing bank available balances, adding screen skeletons, and date filtering. |
| `59ee6a6` | GangSagar | 2026-05-17 | #1 | Release Merge | **Merge pull request #1 from GangSagar/feature/v1.0.4-history-and-backup**: Promoted branch to main; tagged `v.1.0.4`. |
| `602ef32` | HRN Harshit | 2026-05-17 | #2 | Parser | **feat(parser): extract available balance from bank SMS alerts**: Implemented dedicated regex extractors for ICICI, BOB, BOI, and PSB available balances; integrated into `parseMessage.ts`. |
| `cca5fed` | HRN Harshit | 2026-05-17 | #2 | Database | **feat(db): implement available balance and split migrations**: Database migration adding `available_balance`, `split_with`, and `split_settled` columns; Zustand actions for manual expenses. |
| `7d005de` | HRN Harshit | 2026-05-17 | #2 | UI / Components | **feat(ui): add manual cash entry FAB and transaction editor**: Added Floating Action Button for logging offline cash expenses; restructured `EditTransactionModal` for creation and editing. |
| `e53b787` | HRN Harshit | 2026-05-17 | #2 | Splits | **feat(splits): add contacts split ledger and native split manager**: Integrated `react-native-contacts` with `READ_CONTACTS` permission; created Split Ledger screen for tracking and settling peer debts. |
| `ed01f0a` | GangSagar | 2026-05-17 | #2 | Release Merge | **Merge pull request #2 from GangSagar/feature/v1.1.0-reconciliation-and-splits**: Merged reconciliation and splits functionality; tagged `v.1.1.0`. |
| `a0c5f42` | HRN Harshit | 2026-05-17 | #3 | Screens & Branding | **feat: add AccountsScreen for bank balance tracking and reconciliation and update app icons and display name**: Added dedicated AccountsScreen displaying detected bank accounts, last sync times, and app icons. |
| `f3abf26` | GangSagar | 2026-05-17 | #3 | Release Merge | **Merge pull request #3 from GangSagar/feature/v1.1.1-screen-update**: Merged screen updates and asset refreshes; tagged `v1.1.1`. |
| `bb2847e` | HRN Harshit | 2026-05-17 | #4 | Parser | **fix(parser): resolve DLT operator carrier prefix blocklist bug**: Fixed bug where valid bank SMS with prefixes (e.g., `AD-`, `VM-`, `BP-`) were erroneously rejected by the alphanumeric filter. |
| `0352aa2` | HRN Harshit | 2026-05-17 | #4 | Utilities | **refactor(utils): extract unified date range and currency format helpers**: Consolidated ad-hoc Indian Rupee formatting (`₹ 1,234.56`) and date ranges into reusable helper utilities. |
| `c0cabc7` | HRN Harshit | 2026-05-17 | #4 | UI Refactor | **refactor(ui): extract reusable CalendarModal and ExpenseItem components**: Decoupled date selection calendar and individual expense row items into standalone modular components. |
| `95ef22f` | HRN Harshit | 2026-05-17 | #4 | Tests | **test: resolve Jest async environment leaks and add filter test suite**: Fixed Jest hanging handles in asynchronous database tests; added comprehensive sender filter unit tests. |
| `a7cc820` | HRN Harshit | 2026-05-17 | #4 | Database | **feat(db): add reference_id and is_invalid columns with migrations**: Database migration v3 introducing `reference_id` for UPI tracking and `is_invalid` flag for soft-deleted transactions. |
| `83d29e7` | HRN Harshit | 2026-05-17 | #4 | Parser | **feat(parser): extract reference ID and available balance from bank SMS**: Added regex extraction for 12-digit UPI reference numbers and running account balances across major banks. |
| `02e8927` | HRN Harshit | 2026-05-17 | #4 | Store / State | **feat(store): integrate transaction updates and soft-delete trashing lifecycle**: Added Zustand actions `trashExpense` and `updateExpense` to enable nondestructive user corrections. |
| `7953e75` | HRN Harshit | 2026-05-17 | #4 | UI / Screens | **feat(ui): enable transaction trashing, edit controls, and update docs**: Added swipe/tap controls to trash invalid transactions, manual edit dialogs, and updated in-app documentation. |
| `82cddf6` | GangSagar | 2026-05-17 | #4 | Release Merge | **Merge pull request #4 from GangSagar/feature/v1.2.0-sms-reference-and-trashing**: Merged reference extraction and trashing lifecycle; tagged `v1.2.0`. |
| `fa4a413` | HRN Harshit | 2026-05-17 | #5 | AI / ML | **feat(ai): integrate on-device Bayesian SMS Spam Classifier**: Implemented lightweight Naive Bayes probabilistic classifier to reject promotional loan/credit offers mentioning amounts. |
| `4f1a83c` | HRN Harshit | 2026-05-17 | #5 | AI / Advisor | **feat(advisor): create predictive burn-rate smart budget advisor engine**: Created linear projection engine calculating daily spend velocity and predicting budget exhaustion dates. |
| `8a2d9e7` | HRN Harshit | 2026-05-17 | #5 | Settings | **feat(settings): persist custom monthly budget limit settings**: Added budget limit configuration in settings, stored in SQLite `settings` table with instant recalculation. |
| `8c05839` | HRN Harshit | 2026-05-17 | #5 | UI / Dashboard | **feat(ui): lock dashboard header and render glassmorphic AI insights card**: Rendered glassmorphic gradient card on HomeScreen displaying AI advisor warnings and pinned header. |
| `11e42ec` | GangSagar | 2026-05-17 | #5 | Release Merge | **Merge pull request #5 from GangSagar/feature/v1.2.1-local-ai-budget-advisor**: Merged on-device AI classifier and budget advisor; tagged `v1.2.1`. |
| `9ff3bcb` | HRN Harshit | 2026-05-17 | #6 | Branding | **chore: rebrand app to SpendWise and configure custom release APK naming**: Renamed application from generic template to `SpendWise`; configured Gradle to output `SpendWise-vX.Y.Z-release.apk`. |
| `59b49a8` | HRN Harshit | 2026-05-17 | #6 | Database | **feat: enhance database schema and repository layer with rule-based categorization**: Optimized SQL query indexing on `timestamp` and `category`; added rule-based auto-categorizer. |
| `5bf596f` | HRN Harshit | 2026-05-17 | #6 | Native Bridge | **feat: implement Android SMS Bridge and transaction message parser**: Upgraded Kotlin `MessageModule` with structured cursor queries and batch read support. |
| `6f9224a` | HRN Harshit | 2026-05-17 | #6 | Store | **feat: upgrade Zustand state store for synced and historical expenses**: Centralized synced vs manual state with persistent SQLite hydration on cold app launch. |
| `b7c89c9` | HRN Harshit | 2026-05-17 | #6 | UI / Dashboard | **refactor: upgrade HomeScreen dashboard and implement Accounts Slider carousel**: Replaced static header with horizontal swipeable bank cards displaying individual account balances. |
| `57a443a` | HRN Harshit | 2026-05-17 | #6 | Features | **feat: add full data reset, transaction search-filters, and splits workflows**: Implemented real-time search bar, category filtering, split settlement triggers, and reset actions. |
| `e6eb47a` | HRN Harshit | 2026-05-17 | #6 | CI / CD | **ci: add GitHub Release APK uploader and update project documentation**: Configured GitHub Actions workflow to build release APK and attach signed binaries to release tags. |
| `e830e52` | GangSagar | 2026-05-17 | #6 | Release Merge | **Merge pull request #6 from GangSagar/feature/v1.3.0-Production-Release-and-UI-Enhancements**: Tagged `v1.3.0` production release. |
| `4c0af1d` | HRN Harshit | 2026-05-18 | #7 | SMS Syncer | **fix(sync): add timestamp-based SMS paging and accept 3-6 digit shortcode senders**: Fixed memory bloat on large inboxes by paging SMS via timestamps; added support for commercial shortcodes. |
| `b1d04d2` | GangSagar | 2026-05-18 | #7 | Release Merge | **Merge pull request #7 from GangSagar/feature/v1.3.1-sms-sync-lint-fixes**: Tagged `v1.3.1` hotfix release. |
| `acccf16` | HRN Harshit | 2026-05-18 | — | Documentation | **Updated the readme file**: Documentation updates detailing feature matrix and offline privacy guarantees. |
| `bfadd73` | HRN Harshit | 2026-05-18 | #8 | UI / Accounts | **refactor(ui): standardize bank card dimensions and align dashboard card balances fallback**: Polished account slider layout; added graceful fallback when balance cannot be parsed. |
| `01c99c0` | HRN Harshit | 2026-05-18 | #8 | UI / Ledger | **feat(ledger): add context-aware dynamic expand and collapse all controls**: Added accordion expand/collapse controls for monthly expense groupings in History screen. |
| `b86768d` | HRN Harshit | 2026-05-18 | #8 | Deduplication | **feat(dedup): implement robust cross-bank reference scanning and shared numeric token matching**: Prevented double-counting when user receives both sender and payee SMS alerts for the same UPI transaction. |
| `b249250` | HRN Harshit | 2026-05-18 | #8 | Database | **refactor(db): modularize schema constants and optimize transaction storage**: Extracted raw SQL strings into centralized schema constants in `db.ts`. |
| `f0ac2c9` | HRN Harshit | 2026-05-18 | #8 | AI / Spam | **feat(spam): integrate dynamic bayes spam classifier and category auto-training**: Added continuous training capability updating Bayes token probabilities when user reclassifies transactions. |
| `36c710a` | HRN Harshit | 2026-05-18 | #8 | Parser | **refactor(parser): extend regex matching rules and bank contact detection**: Added bank contact name detection in Kotlin bridge; expanded account regex to support masked cards (`*1234`, `CC`). |
| `d57918b` | HRN Harshit | 2026-05-18 | #8 | UI / Theme | **refactor(ui): create centralized design theme and common styles core**: Extracted hex codes and typography into `theme.ts` and `commonStyles.ts`. |
| `22210b7` | HRN Harshit | 2026-05-18 | #8 | Database | **refactor(db): modularize schema constants and optimize transaction storage**: Final schema hardening and index verification across `expenses` and `splits` tables. |
| `f7f4698` | GangSagar | 2026-05-18 | #8 | Release Merge | **Merge pull request #8 from GangSagar/feature/v1.3.0-ledger-ux-and-deduplication-enhancements**: Merged deduplication enhancements and UX polish. |
| `725406a` | HRN Harshit | 2026-05-18 | #9 | Parser | **feat(parser): add unicode normalization and robust message parsing support**: Implemented mathematical font normalization converting stylized Unicode glyphs to standard ASCII. |
| `80fade6` | HRN Harshit | 2026-05-18 | #9 | Native Bridge | **feat(bridge): optimize native sms query and listener bridge**: Reduced Android cursor memory footprint; optimized broadcast receiver latency. |
| `dffb024` | HRN Harshit | 2026-05-18 | #9 | Settings | **feat(settings): add danger zone option to delete all transaction data**: Added two-step confirmation dialog allowing complete purge of SQLite tables without app reinstallation. |
| `a9d76b7` | HRN Harshit | 2026-05-18 | #9 | UI / Styles | **refactor(ui): extract screen css stylesheets to styles directory**: Modularized styles across screens into standalone style sheets. |
| `d225b49` | HRN Harshit | 2026-05-18 | #9 | Documentation | **docs(arch): add high-level draw.io architecture diagram**: Created initial XML architecture diagrams depicting data flow. |
| `169c0ba` | GangSagar | 2026-05-18 | #9 | Release Merge | **Merge pull request #9 from GangSagar/feature/v1.4.0-unicode-normalization-and-style-refactoring**: Tagged `v1.4.0`. |
| `d72c553` | HRN Harshit | 2026-05-20 | #10 | Database | **feat(db): support transaction type updates in SQLite queries**: Added SQL query support for updating `transaction_type` (`DEBIT`, `CREDIT`, `TRANSFER`, `CASH`). |
| `a8d228c` | HRN Harshit | 2026-05-20 | #10 | Hooks | **feat(hooks): add transactionType support to useExpenses update hook**: Exposed transaction type mutators in React hooks. |
| `f90c831` | HRN Harshit | 2026-05-20 | #10 | UI | **feat(ui): add transaction type selector to EditTransactionModal**: Added visual segmented control allowing user to toggle between Debit, Credit, and Cash expense types. |
| `093a9bf` | HRN Harshit | 2026-05-20 | #10 | Core Engine | **feat(core): implement transaction orchestrator, spam filtering, and retry queue**: Integrated unified transaction orchestrator, resilient retry queue, and spam filtering pipeline. |
| `05555e4` | GangSagar | 2026-05-20 | #10 | Release Merge | **Merge pull request #10 from GangSagar/feature/v1.5.0-cash-income-support**: Promoted to main; tagged `v1.5.0`. |
| `a49bf10` | HRN Harshit | 2026-10-18 | — | Observability & QA | **feat(telemetry): add OpenTelemetry, Jaeger, Hardware Collection & Comprehensive Docs**: Added `telemetryService.ts` for distributed tracing, standalone Jaeger setup, `scripts/collect-testcases.py` ADB harvester, `scripts/parse-sms.sh` CLI diagnostic runner, and complete `docs/` technical documentation suite. |
| `27d85c1` | HRN Harshit | 2026-10-24 | — | Parsing Engine | **feat(parser): implement extensible learning-based financial SMS parsing engine**: Replaced monolithic regex with 10-stage decoupled Clean Architecture pipeline, data-driven declarative JSON rules (`bankRules.json`, `merchantAliases.json`, `categoryRules.json`), lexical tokenizer, targeted extractors, weighted confidence engine, on-device SQLite learning engine, and AI fallback resolver. Expanded test coverage to 599 tests across 22 suites with 0 regressions. Tagged `v1.6.0`. |
| `044a9e3` | HRN Harshit | 2026-10-24 | — | Documentation | **docs: update architectural specifications, PRD, TRD, and roadmap**: Documented extensible parsing engine architecture, data flows, and test strategies. |
| `acf455f` | HRN Harshit | 2026-10-24 | — | Performance | **perf(benchmarking): add high-speed parser CLI, in-memory dedup cache, and throughput test suite**: Created standalone native Node CLI benchmark harness (`scripts/parse-cli.js`) proving 3,600+ msg/sec throughput; added in-memory deduplication cache. |
| `9f94c11` | HRN Harshit | 2026-10-24 | — | Assets / UI | **feat(assets): update app icon with glossy green wallet and full-bleed Android adaptive icon**: Generated modern Android 8+ Adaptive Icon with custom background gradient and eliminated white circle backplate. |
| `7df9c02` | HRN Harshit | 2026-10-24 | — | Governance | **chore(agents): add workspace rules for pre-implementation review, SOLID, graphify, and testing**: Established `.agents/` workspace rules governing coding agent workflows. |
| `bfd6c10` | HRN Harshit | 2026-10-25 | — | Refactoring | **refactor(src): remove dead code and deduplicate shared logic across modules**: Removed 4 dead files, consolidated split settlement logic, extracted `accountHelpers.ts`, and cut code duplication by 50%. |
| *Working Tree* | HRN Harshit | 2026-10-25 | — | Governance | **chore(agents): add Rule 5 (Developer-Controlled Commits) and Rule 6 (Continuous Documentation & Graphify Synchronization)**: Enforced strict commit delegation and mandatory doc/graph synchronization. |

---

## 3. Deep Dive into Major Architectural Transitions

### Transition 1: From Simple Regex Scraper to ACID Relational Ledger (v1.0.3 $\to$ v1.1.0)
* **Problem**: Early versions logged SMS as ephemeral text snippets without tracking account identities, debt splits, or manual adjustments.
* **Architectural Change**: Migrated to `react-native-quick-sqlite` using C++ JSI bindings. Added indexed columns for `bank`, `account`, `available_balance`, `split_with`, and `split_settled`.
* **Impact**: Enabled sub-millisecond aggregate queries over tens of thousands of records and introduced the Contacts Split Ledger.

### Transition 2: On-Device AI Classification & Predictive Budgeting (v1.2.0 $\to$ v1.2.1)
* **Problem**: Promotional SMS from banks advertising personal loans, credit limits, or insurance policies frequently matched regex amount patterns (e.g., "Get Rs. 5,00,000 personal loan"), contaminating spending calculations.
* **Architectural Change**: Integrated an on-device Naive Bayes spam classifier trained on financial unigrams/bigrams and implemented linear burn-rate predictive budgeting.
* **Impact**: False positive rate dropped by 99% with zero cloud egress or latency impact (<1ms execution time).

### Transition 3: Paged Cursor Synchronization & Cross-Bank Deduplication (v1.3.0 $\to$ v1.3.1 $\to$ PR #8)
* **Problem**: Devices with 5,000+ SMS experienced UI thread stutter during full inbox sync. Additionally, UPI payments generated dual SMS alerts (sender debit alert + payee confirmation), leading to double-counting.
* **Architectural Change**:
  - Implemented timestamp-based cursor paging with persistent checkpoints in the `settings` table (`last_sms_sync_timestamp`).
  - Added multi-factor deduplication: exact hash matching, 12-digit UPI reference ID matching, and temporal sliding-window fuzzy matching (180s threshold).
* **Impact**: Total sync time reduced from seconds to <500ms; duplicate records eliminated.

### Transition 4: Mathematical Unicode Normalization & Unified Orchestration (v1.4.0 $\to$ v1.5.0)
* **Problem**: Merchants and aggregators (e.g., Swiggy, Cred, Zomato) adopted stylized Unicode mathematical fonts (e.g., `₹ 𝟓𝟒𝟗 𝐝𝐞𝐛𝐢𝐭𝐞𝐝`), causing standard ASCII regular expressions to fail.
* **Architectural Change**:
  - Added Unicode code-point translation mapping stylized glyph ranges (`0x1D400` - `0x1D7FF`) back to standard ASCII `[0-9A-Za-z]`.
  - Encapsulated the entire parsing, filtering, deduplication, and persistence lifecycle into a single unified `TransactionOrchestrator` supported by an exponential backoff `RetryQueue`.
* **Impact**: 100% regex match fidelity on branded promotional Unicode messages; robust fault recovery.

### Transition 5: Enterprise Observability & Hardware-in-the-Loop QA
* **Problem**: Developers lacked real-time visibility into pipeline latency on physical devices and had no automated mechanism to test real SMS without building full APKs.
* **Architectural Change**:
  - Integrated OpenTelemetry distributed tracing transmitting OTLP spans to a local standalone Jaeger collector.
  - Built Python ADB test harvester (`collect-testcases.py`) that copies raw messages from the app database into Jest fixtures. It does not scrub PII; see current [testing data-care notes](./TESTING_STRATEGY.md).
  - Implemented headless CLI runner (`parse-sms.sh`) for sub-second parser testing in the terminal.
* **Impact**: Instant visibility into pipeline performance and continuous benchmarking against 432 real bank transactions.

### Transition 6: From Hardcoded Monolithic Regex to Extensible Learning-Based Engine (v1.5.0 $\to$ v1.6.0)
* **Problem**: A monolithic regex parsing function was brittle, unmaintainable across 15+ Indian banks and fintech apps, prone to catastrophic backtracking or cross-pattern interference, and incapable of learning from user corrections. Adding new banks or merchants required risky code edits.
* **Architectural Change**:
  - Re-architected parsing into Clean Architecture under `src/core/parser/` across 10 specialized stages: Pre-Filter, Composable Normalizers, Lexical Tokenizer, Targeted Extractors, Declarative Bank Rules, Contextual Resolvers, Weighted Confidence Scoring, On-Device SQLite Learning, and Local AI Fallback.
  - Moved all bank schemas, merchant alias normalizations, categories, and keywords to declarative JSON configuration (`bankRules.json`, `merchantAliases.json`, `categoryRules.json`, `tokenDictionary.json`).
  - Added an adaptive `LearningEngine` that learns merchant and category corrections from user interactions directly inside SQLite.
  - Preserved 100% backward compatibility via `parseMessage()` adapter while exposing `parseStructured()` returning typed `StructuredExpense`.
* **Impact**: 599/599 tests passing across 22 test suites with 0 regressions, sub-2ms parse latency, and zero-code extensibility for future banks and payment providers.

### Transition 7: High-Throughput Benchmarking, Modern Branding, & Deduplication Refactoring (v1.6.0 $\to$ v1.6.1)
* **Problem**: Perceived latency during bulk parsing due to test harness startup; white circular background plate on Android 8+ OEM launchers; code duplication across screens and dead database wrappers.
* **Architectural Change**:
  - Engineered standalone native CLI parser (`scripts/parse-cli.js`) delivering >3,600 messages/sec throughput (~0.2ms per message) with in-memory deduplication caching.
  - Implemented full-bleed Android Adaptive Icons with gradient background XML and tightly cropped high-resolution foreground assets.
  - Removed 4 obsolete database re-export wrappers and extracted shared balance calculations into `src/utils/accountHelpers.ts`, cutting jscpd duplication by 50%.
  - Formalized agent pair-programming governance in `.agents/` across 6 core rules (pre-implementation plan review, SOLID, graphify, test verification, developer-controlled commits, continuous doc/graph sync).
* **Impact**: 601 tests passing, streamlined codebase, professional icon presentation on physical devices, and rigorous development governance.

