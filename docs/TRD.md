# 🛠️ Technical Requirements Document (TRD)

# 📱 Smart Expense Tracker (SpendWise)

| Metadata                      | Details                                                            |
| :---------------------------- | :----------------------------------------------------------------- |
| **System Name**         | Smart Expense Tracker Technical Architecture                       |
| **Document Version**    | 1.5.0                                                              |
| **Language & Runtimes** | TypeScript 5.8, Kotlin, C++20, Node.js 22+                         |
| **Frameworks**          | React Native 0.85.3 (New Architecture / Bridgeless), Hermes Engine |
| **Database**            | Embedded SQLite 3 via `react-native-quick-sqlite` (JSI bindings) |
| **Observability**       | OpenTelemetry OTLP (HTTP/JSON) + Local Jaeger v1.60                |
| **Last Updated**        | October 2026                                                       |

---

## 1. System Architecture Overview

The system operates across three tightly integrated tiers:

1. **Native Android Subsystem (Kotlin)**: Intercepts low-level OS broadcasts (`SMS_RECEIVED` and `StatusBarNotification`), enforces early structural filtering, and transmits raw event payloads directly to JavaScript via JSI / TurboModules.
2. **React Native Processing Core (TypeScript / Hermes)**: Implements Unicode normalization, sender whitelisting, keyword blocklists, Bayesian spam classification, regex pattern matching, entity extraction, deduplication, and confidence scoring.
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
│   5. Regex Entity Parser (Amounts, Types, Modes, Merchants, Accounts)  │
│   6. Multi-Source Deduplication (15-min window, Ref ID & Token scan)   │
│   7. Smart Split Auto-Repayment (Match incoming credit to split debts) │
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

---

## 4. Processing & Parsing Engine Specifications

### 4.1 Unicode Normalization (`normalizeUnicodeText.ts`)

Bank alerts (particularly Bank of Baroda UPI alerts) often arrive with stylized Mathematical Sans-Serif or bold Unicode glyphs (e.g., `𝖡𝖮𝖡`, `𝐔𝐏𝐈`).

* Maps stylized mathematical alphanumerics (`0x1D400`–`0x1D7FF`) back to standard ASCII characters (`A-Z`, `a-z`, `0-9`).
* Strips zero-width joiners, directional marks, and extraneous formatting whitespace.

### 4.2 Multi-Stage Message Pipeline (`messageService.ts`)

```
Input Message (cleanSender, cleanBody)
  │
  ├──► [Stage 1: Sender Filter]
  │       Regex: /^[A-Z0-9]{2,3}-[A-Z0-9]{5,9}$/i or shortcodes (3-9 digits)
  │       If false ──► DROP ("non_transactional_sender")
  │
  ├──► [Stage 2: Content Blocklist]
  │       Regex: OTP, verification codes, login alerts, balance enquiry promos
  │       If matches ──► DROP ("blocked_body_filter")
  │
  ├──► [Stage 3: Bayesian Spam Classifier]
  │       Local word frequency probability check
  │       If spamScore > 0.85 ──► DROP ("spam_classifier")
  │
  ├──► [Stage 4: Entity Parser]
  │       Amount, Mode, Type, Bank, Merchant, Account, Balance
  │       If amount === null ──► DROP ("missing_amount")
  │
  └──► [Stage 5: Multi-Source Deduplication]
          Cross-source scan (15-min window, Ref ID, token match)
          If duplicate ──► Flag is_duplicate = 1
```

### 4.3 Regex Extraction Rules (`regexRules.ts`)

* **Amount Regex**:
  `/(?:Rs\.?|INR|₹)\s*(\d+(?:[,\d]*)?(?:\.\d{1,2})?)/i`
* **Debit Keywords**:
  `/\b(?:debited?|spent|paid|withdrawn|purchase|paying|sent|deducted|transferred?|trf|Dr\.?)\b/i`
* **Credit Keywords**:
  `/\b(?:credited?|received|refund|reversed|deposited|added|Cr\.?)\b/i`
* **Account Mask Matching**:
  `/(?:A\/c|Acct|Account|Card|ending in|A\/c no\.)\s*(?:[X*]*\s*)(\d{3,4})\b/i`

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
function matchAutoRepayment(creditTx: ParsedTransaction, activeExpenses: Expense[]): SettlementPlan {
  // 1. Identify contact name in credit body using word-boundary matching
  // 2. Locate active splits across all historical expenses where split.contact === matchedContact AND isPaid === false
  // 3. Sort active splits by timestamp ASC (oldest debt first)
  // 4. Iterate and mark splits as isPaid = true up to creditTx.amount
  // 5. Append corresponding settlement ledger reference to creditTx.splits
}
```

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
