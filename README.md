# 📱 Smart Expense Tracker (v1.0.4)

[![React Native](https://img.shields.io/badge/React_Native-0.85.3-blue.svg?logo=react&logoColor=white)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![SQLite](https://img.shields.io/badge/SQLite-Quick--SQLite-green.svg?logo=sqlite&logoColor=white)](https://github.com/margelo/react-native-quick-sqlite)
[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen.svg)]()
[![Tests](https://img.shields.io/badge/Tests-100%25_Passing-brightgreen.svg)]()

An automated, privacy-first personal Android expense tracker that seamlessly parses incoming bank SMS alerts and payment notifications, extracts transactional meta-data, categorizes your expenses locally, and manages your actual cash-flow.

---

## ✨ Premium Upgrades in v1.0.4

### 📊 Rebuilt Personal Finance Dashboard
* **Sleek Cards Carousel**: Scroll through styled, color-coded miniature credit/debit cards representing HDFC, SBI, BOI, ICICI, and other bank accounts with live, real-time balances directly on your Home Screen.
* **Quick Actions Row**: Touch-friendly shortcut chips to quickly add manual cash, initiate a pre-built split bill, or view account ledger reports.
* **Spending Analytics Insight**: Color-coded category progress bars highlighting your top 3 spending categories (e.g., Food & Dining, Shopping, Travel) with exact percentages.
* **Clean Ledger History list**: Displays only the 5 most recent activities on your dashboard, with an elegant "View Full Ledger History →" button to smoothly navigate to the full logs.

### 🤝 Unified Split Ledger Module
* **Single Direction Toggle**: Streamlined the split layout inside the transaction editor by replacing redundant per-person direction selectors with a single overall split direction toggle (*You owe them* or *They owe you*).
* **Database & Types Compatibility**: Toggling the single split setting automatically sets the direction for all participant items, maintaining 100% database normalization and backward-compatibility.

### 🛡️ Strict Anti-Spam Message Filtration
* **Signal Validation**: Standardizes message validation by requiring that an incoming notification must explicitly match either a debit (`DEBIT_REGEX`) or credit (`CREDIT_REGEX`) signal.
* **Zero Junk Processing**: General cellular operator notifications, service pack warnings, network promotions, and data usage statistics are blocked and dropped before parsing.

### 🧮 Live Bank Account Reconciliation
* **Delimiter Fix**: Uses a unique `::` delimiter to group bank accounts, preventing partition issues on bank names containing hyphens.
* **Dynamic Real-Time Balance Checkpoints**: Dynamically reconciles accounts by factoring subsequent manual transactions or SMS deltas into the latest balance checkpoint:
  $$\text{Real-time Balance} = \text{Checkpoint Balance} + \sum \text{Credits} - \sum \text{Debits}$$
* **Missing Transaction Anomaly Alerts**: Automatically flags differences between expected and actual chronological balances, generating card alerts to pre-fill and log missing transactions.

---

## 🛠️ Tech Stack

| Layer | Technology | Key Advantage |
| :--- | :--- | :--- |
| **Mobile App** | React Native 0.85 | New Architecture & High-performance rendering |
| **Native Bridge** | Kotlin | Event-driven Broadcast Receivers & Services |
| **Database** | `react-native-quick-sqlite` | High-speed C++ direct SQLite binding |
| **State** | Zustand | Light-weight, high-frequency reactive state |
| **Navigation** | React Navigation 7 | Tab-based premium navigation system |

---

## 📂 Project Structure

```
src/
├── core/
│   ├── parser/          # Regex rules, filters, and transaction extraction
│   ├── classifier/      # Custom rules + dynamic user merchant-to-category maps
│   ├── confidence/      # Intent & quality verification scoring
│   └── dedup/           # Multi-source duplicate transaction prevention
├── database/            # Migrations & expense repository layers
├── services/            # Background transaction processing pipeline
├── hooks/               # Unified Zustand store & native listener hooks
├── screens/             # HomeScreen, HistoryScreen, SplitsScreen, and SettingsScreen
├── components/          # Transaction editing modals & dialogs
├── constants/           # appOptions.ts (Global unified lists)
└── types/               # TypeScript type definitions
```

---

## 🚀 Getting Started

### Prerequisites
* **Node.js**: `22.11.0+`
* **Android Studio**: Android SDK 26+
* **JDK**: Version `17`
* A physical Android device or emulator with Google Play Services.

### Setup
```bash
npm install
```

### Development Run
```bash
# Terminal 1: Launch Metro bundler
npm start

# Terminal 2: Build & install onto connected device
npm run android
```

### Necessary Device Permissions
After loading the app on your Android device, manually grant the following permissions:
1. **SMS Permission**: `Settings → Apps → ExpenseTracker → Permissions → Allow SMS`
2. **Notification Listener Access**: `Settings → Apps → Special app access → Notification access → Enable ExpenseTracker`

---

## 🧪 Automated Testing Suite

We maintain a rigorous Jest test suite with 100% simulated mock coverage for SQLite databases, React Navigation stacks, and React Native native emitter bridges.

### Run All Test Suites
```bash
npm run test
```

### Target Parser Module Individually
```bash
npm test src/__tests__/parser.test.ts
```

*All parser rules, classifier strategies, duplicate calculations, and layout render checks are configured inside [jest.setup.js](file:///home/harshit/Desktop/Projects/ExpenseTracker/jest.setup.js) for instantaneous Node-based execution.*

---

## 🔒 Privacy & Performance Focus
* **Zero External Calls**: All transactional SMS messages are parsed and categorized locally. Your financial data never leaves your device.
* **Ultra-Low Battery Footprint**: The application wakes up momentarily in response to native platform broadcast events (`SmsReceiver` and `NotificationListenerService`) and sleeps immediately, consuming `~1%` battery daily.
