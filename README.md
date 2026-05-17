# 📱 Smart Expense Tracker (v1.3.1)

> Last updated: 2026-05-18

[![React Native](https://img.shields.io/badge/React_Native-0.85.3-blue.svg?logo=react&logoColor=white)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![SQLite](https://img.shields.io/badge/SQLite-Quick--SQLite-green.svg?logo=sqlite&logoColor=white)](https://github.com/margelo/react-native-quick-sqlite)
[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen.svg)]()
[![Tests](https://img.shields.io/badge/Tests-100%25_Passing-brightgreen.svg)]()

An automated, privacy-first personal Android expense tracker that seamlessly parses incoming bank SMS alerts and payment notifications, extracts transactional meta-data, categorizes your expenses locally, and manages your actual cash-flow.

---

## ✨ Premium Upgrades in v1.0.5

### 🌈 Dynamic Card Hashing & Card Carousel Reset

- **Hash-Based Card Coloring**: All Debit cards now render in unique, gorgeous colors from a curated palette of 16 premium dual-tone gradients. The color is selected using a deterministic hash of the card's `bankName` and `accountNumber`, giving every card a distinct visual style while preserving specific color branding for top tier banks (ICICI, HDFC, SBI, BOB, BOI).
- **Scroll Offset Auto-Snapping**: Dynamic tab switching on the Accounts carousel now instantly snaps the scroll viewport back to index `0`. This fixes layout cut-offs when switching from multiple debit cards to a single credit card.

### 🤝 Smart Ledger Auto-Repayment & Settlement Flexibility

- **Automated Credit Repayment Matching**: Incoming credit transactions (payments received from friends via SMS, UPI, or manual logs) are scanned against active splits. If a match is found using case-insensitive word-boundary regex (`\b${contactName}\b`), the app:
  1. Marks outstanding splits owed by that contact as paid/settled (`isPaid = true`) chronologically (oldest first) up to the received amount.
  2. Appends a settled split entry to the incoming credit transaction itself, registering the payment inside the split ledger history for flawless bookkeeping.
- **Accidental Click Protection**: Native `Alert` confirmation dialogs protect all split adjustments.
- **Individual Split Toggling**: Tapping any split item inside the ledger lets you settle a single active split or unsettle a single settled split back to active instantly.
- **Mistake Recovery Button**: Added an **"Unsettle All Balances"** button. If you bulk-settle a contact by mistake, a single tap fully restores all their splits to active/unpaid!

### 📊 Personal Finance Dashboard & Live Reconciliation (v1.0.4)

- **Rebuilt Dashboard UI**: Slides miniature cards detailing real-time balances, progress bars showing your top 3 spending categories, and interactive quick action chips for manual cash and pre-built split bills.
- **Strict Anti-Spam Message Filtration**: General cellular operator spams, advertisements, OTPs, and network notifications are filtered out before parsing.
- **Live Bank Reconciliation**: Automatically flags discrepancies between expected and actual chronological balances, offering anomalies cards to let users pre-fill and log missing transactions.

---

## 📝 Changelog

### v1.3.1 — 2026-05-18

- Fix: Improved SMS backfill reliability using timestamp-based paging to avoid truncated bridge responses when importing historical SMS.
- Fix: Accept short numeric transactional senders (3–6 digits) so shortcode-based bank messages are included in backfills; 10-digit personal numbers remain excluded.
- Chore: Applied ESLint autofixes and removed unused variables to reduce warnings and improve code quality.

## 🛠️ Tech Stack

| Layer             | Technology                  | Key Advantage                                 |
| :---------------- | :-------------------------- | :-------------------------------------------- |
| **Mobile App**    | React Native 0.85           | New Architecture & High-performance rendering |
| **Native Bridge** | Kotlin                      | Event-driven Broadcast Receivers & Services   |
| **Database**      | `react-native-quick-sqlite` | High-speed C++ direct SQLite binding          |
| **State**         | Zustand                     | Light-weight, high-frequency reactive state   |
| **Navigation**    | React Navigation 7          | Tab-based premium navigation system           |

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
├── hooks/               # Unified Zustand store (auto-repayments, active splits, etc.)
├── screens/             # HomeScreen, HistoryScreen, SplitsScreen (ledger), AccountsScreen
├── components/          # Transaction editing modals & dialogs
├── constants/           # appOptions.ts (Global unified lists)
└── types/               # TypeScript type definitions
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `22.11.0+`
- **Android Studio**: Android SDK 26+
- **JDK**: Version `17`
- A physical Android device or emulator with Google Play Services.

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

_All parser rules, classifier strategies, duplicate calculations, and layout render checks are configured inside [jest.setup.js](file:///home/harshit/Desktop/Projects/ExpenseTracker/jest.setup.js) for instantaneous Node-based execution._

---

## 🔒 Privacy & Performance Focus

- **Zero External Calls**: All transactional SMS messages are parsed and categorized locally. Your financial data never leaves your device.
- **Ultra-Low Battery Footprint**: The application wakes up momentarily in response to native platform broadcast events (`SmsReceiver` and `NotificationListenerService`) and sleeps immediately, consuming `~1%` battery daily.
