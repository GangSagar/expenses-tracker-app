# 📱 Smart Expense Tracker

[![React Native](https://img.shields.io/badge/React_Native-0.85.3-blue.svg?logo=react&logoColor=white)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![SQLite](https://img.shields.io/badge/SQLite-Quick--SQLite-green.svg?logo=sqlite&logoColor=white)](https://github.com/margelo/react-native-quick-sqlite)
[![Privacy First](https://img.shields.io/badge/Privacy-Offline--first-success.svg)]()

**Smart Expense Tracker** is an offline-first personal finance application for Android. It parses supported bank SMS messages and payment notifications locally and stores the ledger on-device. Optional developer telemetry can send traces to a locally configured Jaeger collector. Local AI inference is not configured.

---

## 📚 Project Documentation

Detailed system specifications, architectural diagrams, engineering plans, and test methodologies are documented in the [`docs/`](./docs) directory:

| Document                                         | File Link                                                       | Summary & Contents                                                                                                                                                                                                                                                   |
| :----------------------------------------------- | :-------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Product Requirements** | [`docs/PRD.md`](./docs/PRD.md) | Product goals and requirements; implementation status is tracked separately. |
| **Technical Requirements** | [`docs/TRD.md`](./docs/TRD.md) | Current technical contracts, native integrations, persistence, and known partial capabilities. |
| **Runtime Architecture** | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Current architecture and runtime data flow. |
| **Live Message Flow** | [`docs/APP_MESSAGE_LISTENER_FLOW.md`](./docs/APP_MESSAGE_LISTENER_FLOW.md) | Active SMS/notification ingestion through decision and persistence. |
| **Implementation Roadmap** | [`docs/v2.0 - improvement_plan/ARCHITECTURE_RESTRUCTURING_PLAN.md`](./docs/v2.0%20-%20improvement_plan/ARCHITECTURE_RESTRUCTURING_PLAN.md) | Authoritative phased restructuring plan and status. |
| **Feature Extension Guide** | [`docs/FEATURE_EXTENSION_GUIDE.md`](./docs/FEATURE_EXTENSION_GUIDE.md) | Where proposed sources and providers should enter and which use cases to reuse. |
| **Testing Strategy** | [`docs/TESTING_STRATEGY.md`](./docs/TESTING_STRATEGY.md) | Available verification commands and release checklist. |
| **Historical architecture diagram** | [`docs/architecture.drawio`](./docs/architecture.drawio) | Original v1 diagram; not authoritative for current runtime structure. |

## 💡 Why Smart Expense Tracker?

Most expense tracking apps either:

1. **Require tedious manual entry** for every cup of coffee, which leads to abandoned tracking after a few days.
2. **Upload your financial data to remote cloud servers**, compromising your privacy and exposing your account numbers and transaction history.

**Smart Expense Tracker solves both problems:**

* **Zero Manual Effort**: Incoming bank SMS messages and UPI notifications are automatically extracted, categorized, and reconciled.
* **Offline-first & private**: Transaction parsing and SQLite ledger storage run on-device. Optional developer telemetry targets a local Jaeger collector; no cloud AI inference is configured.

---

## 🌟 Key Features

### 🧠 Generic, Extensible & Learning-Based Parsing Engine
- **Structured parsing**: SMS and supported app notifications pass through filtering, normalization, tokenization, extraction, rules, resolvers, and confidence scoring. The parser may consult learned merchant/category mappings. `AIResolver` and its in-memory cache exist, but no inference handler/model is configured.
- **Declarative provider rules**: Bank and merchant configuration is data-driven. A new format may still require extractor/resolver code and regression examples; support is not guaranteed by editing JSON alone.
- **Correction learning**: Explicit merchant/category corrections are stored locally and can influence later parsing. Token-frequency learning and confidence reinforcement are not implemented.
- **One transaction decision policy**: Parser and classifier evidence feed the shared reject/review/auto-save policy before a transaction is persisted.

### 📩 Automatic SMS & Notification Tracking

- Seamlessly extracts **amount**, **type** (debit / credit), **payment mode** (UPI, Card, ATM, Net Banking), **merchant name**, **bank name**, and **account number**.
- Captures real-time push notifications from popular payment apps (Google Pay, PhonePe, Paytm, etc.).
- Robust anti-spam filters automatically ignore OTPs, promotional SMS, cellular operator ads, and personal chats.

### 💳 Accounts & Card Management

- Track balances across multiple bank accounts and credit cards in one unified dashboard.
- Interactive card carousel with dynamic visual styling tailored to each bank (SBI, HDFC, ICICI, Axis, Bank of Baroda, etc.).
- Automatic balance reconciliation against your bank's reported available balance to keep your ledger synchronized.

### 🤝 Bill Splitting & Smart Ledger

- Split expenses effortlessly with friends or roommates directly from any logged transaction.
- **Smart Auto-Repayment**: When a friend transfers money back via UPI or bank transfer, the app automatically matches the contact name, marks outstanding debts as settled, and logs the repayment history.
- Accidental click protection with single-tap unsettle and bulk balance restoration options.

### 🏷️ Intelligent Categorization

- Automatically tags expenses into categories (Food & Dining, Groceries, Shopping, Travel, Bills, Entertainment, etc.).
- Learns from your habits: renaming a merchant or updating a category applies intelligently across future transactions.

### 📊 Clean Analytics & Cash Flow Insights

- Visual breakdown of monthly spending trends, burn rate, and top expenditure categories.
- Full chronological transaction history with multi-filter search (by date range, category, payment mode, or account).

### 🔒 App Security & Privacy Lock
- **4-Digit Personal Passcode**: Protect your financial ledger with an app-specific PIN. Passcodes are salted and hashed using SHA-256 for maximum security.
- **Biometric & Device Screen Lock**: Authenticate seamlessly using your phone's Fingerprint, Face ID, or system PIN/Pattern via lifecycle-hardened `androidx.biometric.BiometricPrompt`.
- **Recent Apps & Task Switcher Privacy**: Enforces native Android `FLAG_SECURE` (`onCreate` and `onResume`) alongside an instant JS privacy veil to completely hide sensitive transaction previews and account balances in the recent apps switcher.
- **View Subtree Isolation**: Completely isolates app content (`display: 'none'`) during locked states, with hardware `BackHandler` app-minimizing protection to prevent accidental navigation leaks.
- **Configurable Auto-Lock**: Choose when the app locks upon entering the background (Immediately, 30s, 1m, or 5m).
- **Background Ingestion Guard**: While the UI remains safely locked, background SMS and notification listeners continue safely capturing incoming transactions.

### ⚡ Ultra-Low Battery & Resource Footprint

- Built with event-driven native Android broadcast receivers (`SmsReceiver` and `NotificationListenerService`).
- The app wakes up momentarily when a financial alert arrives, logs the entry in milliseconds, and immediately goes back to sleep — consuming less than 1% battery per day.

---

## 📥 How to Download & Install the App

### Option 1: Build & Install via APK (Direct to Phone)

If you have the source repository, you can generate a standalone Android APK directly:

1. **Build the Debug APK**:
   ```bash
   cd android
   ./gradlew assembleDebug
   ```
2. The generated APK will be located at:
   ```
   android/app/build/outputs/apk/debug/app-debug.apk
   ```
3. Transfer this file to your phone and tap to install, or install it over USB using `adb`:
   ```bash
   adb install android/app/build/outputs/apk/debug/app-debug.apk
   ```

---

## ⚙️ Essential Permissions Setup

For automatic transaction detection to work, Android requires two runtime permissions:

1. **SMS Permission**:
   - `Settings → Apps → ExpenseTracker → Permissions → SMS → Allow`
   - *Why?* Allows the local parser to read incoming bank debit and credit alerts.
2. **Notification Listener Access**:
   - `Settings → Apps → Special app access → Notification access → Enable ExpenseTracker`
   - *Why?* Allows instant capture of UPI payment notifications (e.g., GPay, Paytm) even when no SMS is sent.

> [!NOTE]
> All processing happens locally inside the app. No message or notification content ever leaves your phone.

---

## 🚀 Developer Quick Start

### Prerequisites

- **Node.js**: `>= 22.11.0` (LTS recommended)
- **JDK**: Version `17`
- **Android Studio**: Android SDK 26+ (API 34/35/36)
- Connected physical Android device (with USB debugging enabled) or an Android Virtual Device (AVD).

### 1. Environment Setup

Ensure your shell exports the Android SDK paths.

#### Linux / macOS (`~/.bashrc` or `~/.zshrc`)

```bash
export ANDROID_HOME=$HOME/Android/Sdk           # On macOS: $HOME/Library/Android/sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
export PATH=$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH
```

Reload your terminal: `source ~/.bashrc` (or `source ~/.zshrc`).

#### Windows

- Set environment variables `ANDROID_HOME` and `ANDROID_SDK_ROOT` to `%LOCALAPPDATA%\Android\Sdk`.
- Add `%ANDROID_HOME%\emulator` and `%ANDROID_HOME%\platform-tools` to your system `Path`.

### 2. Install & Configure

```bash
# Clone the repository
git clone https://github.com/GangSagar/expenses-tracker-app.git
cd expenses-tracker-app

# Install dependencies
# (A postinstall hook will validate Node version and auto-configure android/local.properties)
npm install
```

### 3. Run the App

```bash
# 1. Start your Android Emulator (or connect your physical device via USB)
emulator -avd Medium_Phone_API_36 &

# 2. Terminal 1: Start the Metro bundler
npm start

# 3. Terminal 2: Build and deploy to your device
npm run android
```

---

## 🛠️ Troubleshooting & Common Setup Issues

| Problem                                                                                                       | Root Cause                                                                                                                                                                                    | Solution                                                                                                                                                         |
| :------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`TypeError: configs.toReversed is not a function`**                                                 | Running Node < 20 (e.g., default Node 18 from Linux package managers).                                                                                                                        | Upgrade to Node 22+: `nvm install 22 && nvm use 22`                                                                                                            |
| **`SDK location not found. Define a valid SDK location...`**                                          | `android/local.properties` is missing and `ANDROID_HOME` is unset.                                                                                                                        | Run `npm run setup:android` or copy `android/local.properties.example` to `android/local.properties` with your SDK path.                                   |
| **`Failed to launch emulator. Reason: No emulators found...`**                                        | `emulator` binary is not in your `$PATH`. | Add `$ANDROID_HOME/emulator` to your shell `PATH` in `~/.bashrc`, or launch the emulator via Android Studio's **Device Manager**. |                                                                                                                                                                  |
| **`PANIC: Cannot find AVD system path. Please define ANDROID_SDK_ROOT`**                              | Apt package `google-android-emulator-installer` hijacked `/usr/bin/emulator`.                                                                                                             | Remove the apt package with `sudo apt remove google-android-emulator-installer` and ensure `$ANDROID_HOME/emulator` precedes `/usr/bin` in your `$PATH`. |
| **App closes immediately / `SoLoaderDSONotFoundError: couldn't find DSO to load: libreactnative.so`** | APK only built for `arm64-v8a` while desktop emulator runs `x86_64`.                                                                                                                      | In `android/gradle.properties`, ensure `reactNativeArchitectures=arm64-v8a,x86_64`.                                                                          |

---

## 🏗️ Architecture & Tech Stack

```
src/
├── app/
│   └── composition/    # Selects concrete persistence/native adapters for runtime services
├── core/
│   ├── parser/          # Modular 10-stage learning-based parsing engine
│   │   ├── config/      # Declarative bank, merchant & category JSON rules
│   │   ├── models/      # Strongly typed StructuredExpense & Token models
│   │   ├── normalizer/  # Composable Unicode, currency, keyword & whitespace normalizers
│   │   ├── tokenizer/   # Lexical tokenizer producing categorized token streams
│   │   ├── extractor/   # Targeted extractors (Amount, Account, Bank, VPA, Ref, Balance)
│   │   ├── resolver/    # Business heuristics (Merchant alias, directionality, category)
│   │   ├── confidence/  # Multi-factor mathematical quality scoring engine
│   │   ├── learning/    # Learning policies and repository contracts
│   │   ├── ai/          # Optional inference interface; no runtime is configured
│   │   ├── filter/      # Pre-parsing non-financial & OTP message filter
│   │   └── orchestrator/# Pipeline coordinator & backward-compatible adapter
│   ├── classifier/      # Spending category rules & merchant mappings
│   ├── confidence/      # Transaction validation & quality scoring
│   └── dedup/           # Multi-source duplicate transaction detection
├── database/            # SQLite queries, schemas, transaction adapter & migrations
├── infrastructure/
│   ├── native/          # React Native device-auth adapter
│   ├── observability/   # Telemetry implementation
│   └── persistence/sqlite/ # SQLite settings, learning and spam adapters
├── services/
│   ├── transactions/    # Transaction application operations and orchestration
│   ├── messaging/       # Incoming message analysis and parser adapter
│   ├── notifications/   # Saved-transaction notification capability
│   ├── advisor/         # Budget advisor
│   ├── security/        # Security service
│   └── settings/        # Focused settings capability API
├── hooks/               # Zustand reactive store (accounts, splits, transactions)
├── presentation/
│   └── legacy/          # Existing screens, components, styles & navigation; UI replacement boundary
└── types/               # TypeScript data models and interfaces
```

| Layer                      | Technology                    | Key Role                                            |
| :------------------------- | :---------------------------- | :-------------------------------------------------- |
| **Framework**        | React Native 0.85             | High-performance cross-platform rendering           |
| **Native Bridge**    | Kotlin                        | Event-driven Broadcast Receivers & Android Services |
| **Parsing Engine**   | Modular Clean Architecture    | 10-stage data-driven lexical parsing & self-learning|
| **Database**         | `react-native-quick-sqlite`   | C++ direct SQLite binding for instant local storage |
| **State Management** | Zustand                       | Lightweight reactive state store                    |
| **Navigation**       | React Navigation 7            | Native gesture and tab-based navigation             |

---

## 🧪 Testing

Run the current Jest suite to verify the checked-out revision; test counts are intentionally not hard-coded here because they change as tests are added:

```bash
# Run all test suites
npm test

# Run core unit test suites excluding real hardware dataset
npm test -- --testPathIgnorePatterns="collected-real"

# Run tests in watch mode
npm test -- --watch

# Run ESLint and the import-boundary check
npm run lint

# Check TypeScript types
npx tsc --noEmit

# Run parser diagnostic CLI (see scripts/parse-sms.sh for supported arguments)
npm run parse

# Run parser throughput benchmark
npm run benchmark
```

### 📱 Collecting Real Test Cases from Your Phone

You can extract real bank messages from your phone and turn them into local test scenarios. **The collector copies raw `raw_message` text and does not redact account numbers, names, phone numbers, or other PII.** Treat the generated fixture as sensitive; inspect and sanitize it before sharing or committing.

1. Connect your phone via USB with USB Debugging enabled.
2. In the app on your phone, go to **Settings → Backfill Ledger** to import your messages.
3. Run the automated collector:
   ```bash
   npm run test:collect
   ```

   The collector extracts raw transaction messages from the app's local database, saves unique samples into `src/__tests__/__fixtures__/collected-real-samples.json`, and generates `src/__tests__/collected-real.test.ts`.
4. Run tests against your real phone's scenarios:
   ```bash
   npm test src/__tests__/collected-real.test.ts
   ```

---

## 🔍 Local OpenTelemetry & Jaeger Monitoring

The app includes optional OpenTelemetry tracing for message processing and selected SQLite repository calls. It is disabled outside `__DEV__` and tests, and sends to the configured local Jaeger collector. The current span includes a sender attribute; phone-number redaction is not implemented, so keep the collector local and treat traces as sensitive.

### 1. Start Local Jaeger

```bash
npm run jaeger:start
```

* **Jaeger Web Dashboard**: Open [http://localhost:16686](http://localhost:16686) in your browser.
* **OTLP Receiver**: Listening on port `4318` (`/v1/traces`).
* The script automatically configures `adb reverse tcp:4318 tcp:4318` for any connected physical phones or emulators.

### 2. View Traces

As messages are parsed or transactions inserted into SQLite, spans are automatically exported to Jaeger:

* Select `expense-tracker-mobile` from the **Service** dropdown.
* Click **Find Traces** to inspect detailed execution timing, flamegraphs, and span attributes.

---

## 📄 License

This project is licensed under the MIT License.
