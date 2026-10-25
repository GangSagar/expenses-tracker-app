# 🛠️ Technical Requirements Document (TRD)

# 📱 Smart Expense Tracker (SpendWise)

| Metadata                      | Details                                                            |
| :---------------------------- | :----------------------------------------------------------------- |
| **System Name**         | Smart Expense Tracker Technical Architecture                       |
| **Document Version**    | 1.6.0                                                              |
| **Language & Runtimes** | TypeScript 5.8, Kotlin, C++20, Node.js 22+                         |
| **Frameworks**          | React Native 0.85.3 (New Architecture / Bridgeless), Hermes Engine |
| **Database**            | Embedded SQLite 3 via `react-native-quick-sqlite` (JSI bindings) |
| **Observability**       | OpenTelemetry OTLP (HTTP/JSON) + Local Jaeger v1.60                |
| **Last Updated**        | October 2026                                                       |

---

## 1. System Architecture Overview

The system operates across three tightly integrated tiers:

1. **Native Android Subsystem (Kotlin)**: Intercepts low-level OS broadcasts (`SMS_RECEIVED` and `StatusBarNotification`), enforces early structural filtering, and transmits raw event payloads directly to JavaScript via JSI / TurboModules.
2. **React Native Processing Core (TypeScript / Hermes)**: Implements Unicode normalization, sender allowlists, Bayesian spam classification, structured async parser orchestration, one transaction decision policy, and local merchant/category correction learning. An offline AI fallback interface exists, but no inference runtime/model is currently configured.
3. **Local Persistence & State Layer (C++ / SQLite / Zustand)**: High-speed synchronous SQLite persistence using `react-native-quick-sqlite` C++ bindings, paired with reactive, memoized Zustand client stores.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ANDROID OPERATING SYSTEM                        │
│   ┌──────────────────────────┐         ┌───────────────────────────┐   │
│   │ Telephony (SMS Received) │         │ Notification System Event │   │
│   └────────────┬─────────────┘         └─────────────┬─────────────┘   │
└────────────────┼─────────────────────────────────────┼─────────────────┘
                 │                                     │
┌────────────────▼─────────────────────────────────────▼─────────────────┐
│                    NATIVE ANDROID LAYER (KOTLIN)                       │
│  ┌───────────────────────┐             ┌────────────────────────────┐  │
│  │     SmsReceiver       │             │ NotificationListenerService│  │
│  └───────────┬───────────┘             └─────────────┬──────────────┘  │
│              └───────────────────┬───────────────────┘                 │
│                                  ▼                                     │
│                     MessageModule (TurboModule)                        │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ JSI Event Bridge
┌──────────────────────────────────▼─────────────────────────────────────┐
│                 REACT NATIVE CORE ENGINE (TYPESCRIPT)                  │
│                                                                        │
│   1. Unicode Normalization (Mathematical sans-serif & stylized fonts)  │
│   2. Sender Validation (Filter personal 10-digit mobile numbers)       │
│   3. Content Blocklist (Filter OTPs, Promo, Telecom balance alerts)    │
│   4. Naive Bayes Spam Classifier (Local probability threshold)         │
│   5. Modular Parsing Engine (Tokenizer, Extractors, Resolvers, Rules)  │
│   6. Weighted Confidence Scoring & On-Device Learning Feedback         │
│   7. Multi-Source Deduplication (15-min window, Ref ID & Token scan)   │
│   8. Smart Split Auto-Repayment (Match incoming credit to split debts) │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Synchronous C++ JSI
┌──────────────────────────────────▼─────────────────────────────────────┐
│                  STORAGE & OBSERVABILITY SUBSYSTEM                     │
│  ┌─────────────────────────────────┐   ┌────────────────────────────┐  │
│  │   react-native-quick-sqlite     │   │   OpenTelemetry Service    │  │
│  │    (Local SQLite Engine)        │   │    (OTLP Tracing Client)   │  │
│  └────────────────┬────────────────┘   └─────────────┬──────────────┘  │
│                   │                                  │ OTLP HTTP :4318 │
│                   ▼                                  ▼                 │
│         expense_tracker.db                  Local Jaeger Server        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack & Decision Rationale

| Layer                      | Selected Technology           | Alternative Considered      | Technical Rationale                                                                                                                                                 |
| :------------------------- | :---------------------------- | :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Mobile Runtime**   | React Native 0.85 + Hermes    | Flutter / Native Kotlin UI  | Enables cross-platform TypeScript business logic with instant hot reloading, while running on the New Architecture with Bridgeless Hermes execution.                |
| **Database**         | `react-native-quick-sqlite` | WatermelonDB / AsyncStorage | Direct C++ JSI binding directly into SQLite. Executes synchronous SQL statements without the JSON serialization overhead of standard React Native bridge modules.   |
| **State Management** | Zustand 5.0                   | Redux Toolkit / MobX        | Ultra-lightweight footprint (~1.2kB), zero boilerplate, outside-React imperative access (crucial for background receivers), and high-frequency selective rendering. |
| **Native Bridge**    | TurboModules JSI              | Old React Native Bridge     | Direct memory access between C++/Kotlin and Hermes JS engine without asynchronous JSON string queues.                                                               |
| **Local Tracing**    | OpenTelemetry + Jaeger        | Firebase Performance        | Zero cloud telemetry constraint. Jaeger runs standalone on developer host machine, ingesting standard OTLP JSON traces over port `4318`.                          |

---

## 3. Native Android Subsystem Specifications

### 3.1 Android Manifest Configuration (`AndroidManifest.xml`)

The native subsystem requires specific permissions declared in `android/app/src/main/AndroidManifest.xml`:

```xml
<!-- SMS Interception -->
<uses-permission android:name="android.permission.RECEIVE_SMS" />
<uses-permission android:name="android.permission.READ_SMS" />

<!-- Contacts for Split Ledger -->
<uses-permission android:name="android.permission.READ_CONTACTS" />

<!-- System Alert for Floating Low-Confidence Dialogs -->
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
```

### 3.2 Native Broadcast Receiver (`SmsReceiver.kt`)

* **Trigger**: Listens for `android.provider.Telephony.SMS_RECEIVED` action with high priority (`android:priority="999"`).
* **Execution**:
  1. Reconstructs multipart SMS messages using `Telephony.Sms.Intents.getMessagesFromIntent(intent)`.
  2. Extracts originating address (`sender`) and body.
  3. Pre-filters non-transactional senders (e.g., standard 10-digit phone numbers starting with `+91` or `[6-9]`).
  4. Emits `onSMSReceived` event via React Native DeviceEventEmitter.

### 3.3 Notification Listener Service (`NotificationListener.kt`)

* **Trigger**: Extends Android `NotificationListenerService` bound to `android.service.notification.NotificationListenerService`.
* **Target Packages**: Intercepts notifications strictly from financial package identifiers:
  * `com.google.android.apps.nbu.paisa.user` (Google Pay)
  * `com.phonepe.app` (PhonePe)
  * `net.one97.paytm` (Paytm)
  * `in.org.npci.upiapp` (BHIM)
  * `com.dreamplug.androidapp` (Cred)
* **Payload**: Extracts notification title, body, subText, and timestamp; dispatches `onNotificationReceived` to JS.

### 3.4 Historical Paged SMS Querying (`MessageModule.kt`)

Exposes paged querying against `content://sms/inbox`:

* **`fetchPastMessagesSince(startTimestamp, pageSize, afterTimestamp)`**:
  * Implements cursor-based indexing ordered by `date ASC LIMIT ?`.
  * Filters non-alphabetic senders using regex `.*[a-zA-Z].* || ^\d{3,9}$`.
  * Resolves as a serialized JSON array without exceeding Android Binder IPC buffer limits (1MB).

### 3.5 Native Biometric & Keyguard Security Module (`SecurityModule.kt`)

* **Integration**: `androidx.biometric:biometric:1.1.0`.
* **Lifecycle & Concurrency Safety**:
  * Implements `LifecycleEventListener`: automatically cancels any active `BiometricPrompt` on `onHostPause()` and `onHostDestroy()` to prevent `IllegalStateException` crashes across activity lifecycle events.
  * Mutex protection via `isAuthenticating = AtomicBoolean(false)`: prevents duplicate concurrent `BiometricPrompt` launches.
* **Authenticators**: Version-adaptive authentication:
  * API 30+ (Android 11+): `setAllowedAuthenticators(BIOMETRIC_STRONG or DEVICE_CREDENTIAL)`.
  * API 24–29 (Android 7–10): `setDeviceCredentialAllowed(true)` with KeyguardManager fallback.
* **Window Security (`FLAG_SECURE`) & Privacy Shield**:
  * Enforced on `MainActivity.onCreate` and `MainActivity.onResume` with `window.addFlags(FLAG_SECURE)` to block recent apps task-switcher snapshots and screen captures across OEM launchers.
  * Dynamically toggled via `setSecureFlag(enable: Boolean, promise: Promise)`.
  * `SecurityGate.tsx` completely isolates `{children}` with `display: 'none'`, `pointerEvents="none"`, and `accessibilityElementsHidden={true}` when locked, rendering `<LockScreen />` exclusively with hardware `BackHandler` app-minimizing protection.
* **Methods**:
  * `isDeviceAuthAvailable(promise)`: Queries system `BiometricManager` and `KeyguardManager.isDeviceSecure` safely across all API versions without throwing `IllegalArgumentException`.
  * `authenticate(title, subtitle, promise)`: Launches Android `BiometricPrompt` on the UI thread with FragmentManager lifecycle guards, concurrency locks, and single-settle promise resolution.
  * `cancelAuthentication(promise)`: Cleanly cancels active biometric authentication and cleans up prompt references.
  * `setSecureFlag(enable, promise)`: Sets or clears `WindowManager.LayoutParams.FLAG_SECURE` on the host Activity window.

---

## 4. Modular Parsing Engine Specifications (`src/core/parser/`)

The parsing engine replaces brittle regex monoliths with a decoupled, clean-architecture 10-stage pipeline:

```
Raw Message & Sender
       │
       ▼
[1. Message Filter] ────────► Drop OTP / Telecom / Non-Financial Promos
       │
       ▼
[2. Composable Normalizers] ─► Unicode ➔ Currency ➔ Keyword ➔ Whitespace
       │
       ▼
[3. Lexical Tokenizer] ─────► Classifies Token Stream with Span Offsets
       │
       ▼
[4. Targeted Extractors] ───► Amount, Account, Bank, VPA, Ref, Balance, Mode
       │
       ▼
[5. Dynamic Bank Rules] ────► Declarative rules from bankRules.json
       │
       ▼
[6. Contextual Resolvers] ──► Merchant Aliases, Transaction Direction, Category
       │
       ▼
[7. Confidence Engine] ─────► Mathematical Multi-Factor Quality Score
       │
       ▼
[8. Learning Engine] ───────► On-Device SQLite Feedback & Pattern Cache
       │
       ▼
[9. AI Fallback Resolver] ──► Cached Local Fallback (if Confidence < 0.65)
       │
       ▼
[10. StructuredExpense] ────► Strongly Typed Immutable Financial Record
```

### 4.1 Composable Normalization Pipeline (`src/core/parser/normalizer/`)

The normalizer executes sequentially across four modular transformations:

1. **`unicodeNormalizer`**:
   - Maps mathematical bold, sans-serif, and styled glyphs (`0x1D400`–`0x1D7FF`) back to standard ASCII alphanumerics (`A-Z`, `a-z`, `0-9`).
   - Strips zero-width joiners, soft hyphens, and directional formatting marks.
2. **`currencyNormalizer`**:
   - Standardizes disparate currency symbols (`Rs.`, `Rs`, `INR`, `INR.`, `₹`) to uniform `INR` tokens with clean word boundaries.
3. **`keywordNormalizer`**:
   - Standardizes common abbreviations across Indian banking SMS (`a/c` / `acct` ➔ `account`, `txn` ➔ `transaction`, `ref no` ➔ `reference`, `bal` / `avl bal` ➔ `balance`).
4. **`whitespaceNormalizer`**:
   - Collapses consecutive whitespace, tabs, and line-breaks into single standard ASCII spaces.

### 4.2 Lexical Tokenizer (`src/core/parser/tokenizer/`)

The tokenizer transforms normalized text into a stream of typed `Token` objects, preserving token value, position, and semantic classification:

```typescript
export interface Token {
  type: TokenType;
  value: string;
  normalizedValue: string;
  startIndex: number;
  endIndex: number;
}

export type TokenType =
  | 'AMOUNT'
  | 'ACCOUNT'
  | 'VPA'
  | 'KEYWORD'
  | 'DATE'
  | 'REF_NUMBER'
  | 'MERCHANT_HINT'
  | 'WORD'
  | 'SEPARATOR'
  | 'UNKNOWN';
```

### 4.3 Data-Driven Declarative Rules (`src/core/parser/config/`)

All bank templates, merchant cleaning patterns, and categories are decoupled into declarative JSON schemas:

* **`bankRules.json`**:
  Defines patterns, sender prefixes, and priority overrides for 15+ major Indian banks (SBI, HDFC, ICICI, Axis, Kotak, Bank of Baroda, PNB, Canara, IndusInd, IDFC FIRST, Yes Bank, AU Small Finance Bank, Union Bank, Bank of India, Punjab & Sind Bank, Federal Bank, Standard Chartered, HSBC, RBL) and digital UPI platforms (Google Pay, PhonePe, Paytm, BHIM, Cred, Amazon Pay).
* **`merchantAliases.json`**:
  Maintains canonical brand maps and noise-stripping rules:
  - Noise prefixes stripped: `VPA`, `UPI/`, `PAYTM*`, `BILLDESK/`, `POS/`, `NEFT-`, `IMPS-`.
  - Canonical aliases: `ZOMATO LTD` ➔ `Zomato`, `SWIGGY_BLR` ➔ `Swiggy`, `AMZN-MKTPLACE` ➔ `Amazon`, `UBER INDIA` ➔ `Uber`, `FLIPKART-PAY` ➔ `Flipkart`.
* **`categoryRules.json`**:
  Maps canonical merchants and keywords to 8 primary spending buckets: `Food & Dining`, `Groceries`, `Shopping`, `Travel`, `Utilities`, `Health`, `Entertainment`, `Financial Services`.
* **`tokenDictionary.json`**:
  Lexical dictionary of debit triggers (`debited`, `spent`, `withdrawn`, `paid`), credit triggers (`credited`, `received`, `refund`, `deposited`), account prefixes, and reference labels.

### 4.4 Targeted Entity Extractors (`src/core/parser/extractor/`)

Specialized extractors operate on the token stream and normalized text independently:

| Extractor                          | Primary Responsibility                                                                                                         |
| :--------------------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| **`AmountExtractor`**      | Extracts financial figures; enforces positive values; validates against date/account collisions; checks post-currency markers. |
| **`AccountExtractor`**     | Identifies masked accounts (`XX1234`, `*5678`, `ending with 9012`, `Card 3456`).                                       |
| **`BankExtractor`**        | Correlates DLT sender headers (`VM-HDFCBK` ➔ `HDFC`) and body mentions against `bankRules.json`.                        |
| **`VpaExtractor`**         | Validates UPI VPA format (`user@bank`), isolating recipient identifiers while stripping trailing bank suffixes.              |
| **`ReferenceExtractor`**   | Extracts 12-digit UPI RRN, UTR, or bank reference numbers for multi-source deduplication.                                      |
| **`BalanceExtractor`**     | Isolates available/running account balance reported after transaction completion.                                              |
| **`PaymentModeExtractor`** | Disambiguates `upi`, `cc` (credit card), `dc` (debit card), `netbanking`, `atm`, `cash`.                           |
| **`RawMerchantExtractor`** | Extracts candidate merchant strings following positional markers (`at`, `to`, `spent on`, `VPA`).                      |

### 4.5 Contextual Business Resolvers (`src/core/parser/resolver/`)

* **`MerchantResolver`**:
  Cleans noisy SMS merchant tokens, removes trailing city tags, handles UPI handle sanitization, matches canonical aliases in `merchantAliases.json`, and verifies against known bank entities.
* **`TransactionResolver`**:
  Determines transaction directionality (`debit` vs `credit`). Resolves dual-action alerts (e.g., *"debited Rs 1.00 and credited to payee@upi"*) by prioritizing the user's debited account.
* **`CategoryResolver`**:
  Combines rule-based category matching, token keywords, and user corrections from `LearningEngine` to assign accurate spending categories.

### 4.6 Multi-Factor Confidence Scoring (`src/core/parser/confidence/`)

Calculates a normalized quality score between `0.0` and `1.0` representing extraction certainty:

$$
\text{Confidence} = \sum_{i} (w_i \times s_i) - \text{Penalties}
$$

| Extracted Field            | Weight ($w_i$) | Validation Criteria ($s_i = 1.0$)                             |
| :------------------------- | :--------------: | :-------------------------------------------------------------- |
| **Amount**           |     `0.35`     | Valid positive decimal extracted adjacent to currency marker.   |
| **Transaction Type** |     `0.25`     | Explicit debit/credit keyword detected without ambiguity.       |
| **Merchant**         |     `0.20`     | Payee entity identified and resolved via alias registry or VPA. |
| **Category**         |     `0.10`     | Category resolver finds a rule or learned mapping.              |
| **Account**          |     `0.10`     | Masked account/card pattern identified.                         |

* **Penalties**: Subtracted for conflicting directionality (-0.15), low-signal generic merchant strings (-0.10), or unverified account masks (-0.05).
* **Active decision policy**: The legacy classifier score below `0.5` rejects; scores from `0.5` to below `0.8` go to review; scores at or above `0.8` can auto-save. Parser confidence below `0.5` rejects and `requiresConfirmation` forces review. AI inference is not currently active.

### 4.7 Adaptive On-Device Learning Engine (`src/core/parser/learning/`)

Stores explicit merchant/category corrections locally through the repository used by parser resolvers:

```typescript
export interface ILearningRepository {
  save(mapping: LearnedMapping): void;
  get(rawMerchant: string): LearnedMapping | null;
  getAll(): LearnedMapping[];
}
```

* When a user edits a merchant or updates an expense category, `LearningEngine` stores the association.
* Subsequent merchant/category resolutions consult the saved mapping. Token frequency learning and confidence reinforcement are not implemented.

### 4.8 Offline AI Fallback Resolver (`src/core/parser/ai/`)

* `AIResolver` supports an injected inference handler and an in-memory `AICache`.
* No handler/model is currently configured, and `enableAI` defaults to `false`. Therefore no AI inference runs in production today.
* Selecting and integrating an on-device/offline inference runtime is approved future implementation work; network inference is out of scope.

### 4.9 Backward Compatibility Adapter (`src/core/parser/parseMessage.ts`)

To ensure zero regressions across legacy modules, `parseMessage()` wraps `ParserOrchestrator.parse()` and maps `StructuredExpense` to the legacy `ParsedTransaction` contract:

```typescript
export function parseMessage(
  message: string,
  sender = '',
  source: 'sms' | 'notification' | 'manual' = 'sms'
): ParsedTransaction | null;

export function parseStructured(
  message: string,
  sender = '',
  source: 'sms' | 'notification' | 'manual' = 'sms'
): StructuredExpense | null;

export function parseStructuredAsync(
  message: string,
  sender?: string,
  source?: 'sms' | 'notification' | 'manual'
): Promise<StructuredExpense | null>;
```

---

## 5. Database Architecture & Schema Specifications

### 5.1 Storage Engine

* **Engine**: SQLite 3 compiled with C++ JSI direct execution via `react-native-quick-sqlite`.
* **Database Name**: `expense_tracker.db`
* **Location**: App internal sandboxed directory (`/data/data/com.expensetracker/files/expense_tracker.db`).

### 5.2 Table Schemas

#### 1. `expenses` Table

Stores all individual transactional records:

```sql
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount REAL NOT NULL,
  merchant TEXT,
  alias TEXT,
  category TEXT NOT NULL DEFAULT 'Other',
  confidence REAL DEFAULT 1.0,
  timestamp INTEGER NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('sms', 'notification', 'manual')),
  raw_message TEXT NOT NULL,
  transaction_type TEXT NOT NULL DEFAULT 'debit' CHECK(transaction_type IN ('debit', 'credit')),
  account TEXT,
  bank TEXT,
  payment_mode TEXT DEFAULT 'unknown' CHECK(payment_mode IN ('upi', 'cc', 'dc', 'netbanking', 'atm', 'cash', 'unknown')),
  is_duplicate INTEGER DEFAULT 0,
  available_balance REAL,
  splits TEXT,               -- JSON serialized array of split entities
  reference_id TEXT,         -- Bank UTR or transaction reference
  is_invalid INTEGER DEFAULT 0, -- Soft delete flag for trashed items
  trash_reason TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_expenses_timestamp ON expenses(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_ref_id ON expenses(reference_id);
CREATE INDEX IF NOT EXISTS idx_expenses_account_bank ON expenses(bank, account);
CREATE INDEX IF NOT EXISTS idx_expenses_dedup ON expenses(amount, timestamp);
```

#### 2. `merchant_categories` Table

Stores user-trained dynamic merchant mappings:

```sql
CREATE TABLE IF NOT EXISTS merchant_categories (
  merchant TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  display_name TEXT
);
```

#### 3. `settings` Table

Key-value store for user configurations:

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## 6. Smart Ledger & Repayment Settlement Algorithm

When an incoming credit transaction is processed, the system executes an automated repayment scan:

```typescript
function matchAutoRepayment(creditTx: TransactionCandidate): SettlementPlan {
  // 1. Identify contact name in credit body using word-boundary matching
  // 2. Query all split-bearing ledger rows (independent of the UI's 30-day window)
  //    and locate eligible unpaid splits for the matched contact
  // 3. Sort active splits by timestamp ASC (oldest debt first)
  // 4. Iterate oldest-first, applying min(remaining credit, split outstanding)
  //    to each split's paidAmount; set isPaid only when no balance remains
  // 5. Insert the repayment credit and write all affected splits atomically
}
```

Split rows preserve their original `amount` and may store cumulative `paidAmount`. The outstanding amount is `max(0, amount - paidAmount)` while the row is not fully paid. Older rows without `paidAmount` are treated as unpaid by default; a legacy row with `isPaid = true` is treated as fully paid. Partial allocations are written atomically with the incoming repayment credit and are applied oldest-first.

---

## 7. OpenTelemetry Observability Specifications

### 7.1 Architecture

The app implements an OpenTelemetry OTLP JSON trace exporter running inside `src/services/telemetryService.ts`:

* **Receiver**: Local Jaeger v1.60 running on developer workstation (`:4318/v1/traces`).
* **Routing**:
  * Physical Device: Routed to `http://127.0.0.1:4318` via `adb reverse tcp:4318 tcp:4318`.
  * Emulator: Automatically routes via gateway `http://10.0.2.2:4318`.

### 7.2 Trace Schema & Exported Attributes

```json
{
  "resourceSpans": [{
    "resource": {
      "attributes": [
        { "key": "service.name", "value": { "stringValue": "expense-tracker-mobile" } },
        { "key": "os.type", "value": { "stringValue": "android" } }
      ]
    },
    "scopeSpans": [{
      "scope": { "name": "com.expensetracker.telemetry" },
      "spans": [{
        "traceId": "32_hex_chars",
        "spanId": "16_hex_chars",
        "name": "sms.process_pipeline",
        "kind": 1,
        "attributes": [
          { "key": "source", "value": { "stringValue": "sms" } },
          { "key": "sender", "value": { "stringValue": "AD-ICICIB" } },
          { "key": "amount", "value": { "doubleValue": 450.0 } },
          { "key": "bank", "value": { "stringValue": "ICICI" } },
          { "key": "type", "value": { "stringValue": "debit" } },
          { "key": "dropped", "value": { "boolValue": false } }
        ]
      }]
    }]
  }]
}
```

---

## 8. Build, Hardware & Compatibility Matrix

| Parameter                     | Specification                                              |
| :---------------------------- | :--------------------------------------------------------- |
| **Minimum Android SDK** | API 26 (Android 8.0 Oreo)                                  |
| **Target Android SDK**  | API 34 / 35 (Android 14 / 15)                              |
| **Supported ABIs**      | `arm64-v8a` (Physical Phones), `x86_64` (Emulators)    |
| **Java / JDK Version**  | OpenJDK 17                                                 |
| **Gradle Distribution** | Gradle 9.3.1                                               |
| **NDK Version**         | 27.1.12297006                                              |
| **Node.js Environment** | Node.js `>= 22.11.0` (Required for Metro `toReversed`) |
