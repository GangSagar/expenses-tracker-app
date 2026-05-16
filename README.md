# 📱 Smart Expense Tracker (v1.0.3)

[![React Native](https://img.shields.io/badge/React_Native-0.85.3-blue.svg?logo=react&logoColor=white)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![SQLite](https://img.shields.io/badge/SQLite-Quick--SQLite-green.svg?logo=sqlite&logoColor=white)](https://github.com/margelo/react-native-quick-sqlite)
[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen.svg)]()
[![Tests](https://img.shields.io/badge/Tests-100%25_Passing-brightgreen.svg)]()

An automated, privacy-first personal Android expense tracker that seamlessly parses incoming bank SMS alerts and payment notifications, extracts transactional meta-data, categorizes your expenses locally, and manages your actual cash-flow.

---

## ✨ Premium Upgrades in v1.0.3

### 📊 Real-Time Financial Dashboard
* **Mathematically Precise Balance**: Computes actual `Current Balance = Income (Credits) - Expenses (Debits)` dynamically on the home screen rather than displaying absolute accumulated sums.
* **Dual-Metric Breakdown Card**: Displays separate, color-coded summaries for **Income** (`+₹X,XXX` in vibrant green) and **Expense** (`-₹X,XXX` in light red) within a beautiful modern glassmorphism header.
* **Intelligent Daily Net Change**: Grouped transaction cards in the history list calculate the exact net financial delta of each calendar day.
* **Accounting-Grade Currency Formatting**: Supports clean Indian formatting (`en-IN`) with correct negative signs prefixed to currency symbols (e.g., `-₹150.00` instead of `₹-150.00`).

### ⚙️ Centralized Configuration Architecture
* Managed entirely through [appOptions.ts](file:///home/harshit/Desktop/Projects/ExpenseTracker/src/constants/appOptions.ts).
* Unifies all system categories, payment mode classifications (`upi`, `cc`, `wallet`, `unknown`), and registered banking institutions into a single reusable, structured configuration array.

### 🔍 Advanced Regex Transaction Parser
* **Regional Routing Carrier Bypass**: Automatically inspects SMS payload contents to prevent drops caused by carrier prefixes (e.g. `AD-`, `JD-`, `VK-`).
* **High-Signal Extraction Engine**: Employs transactional action verbs (`debited`, `credited`, `spent`, `transferred to`) to prevent false-positives from contextual prepositions.
* **Flexible Bank Alert Mappings**: Provides robust parsing rules for Punjab & Sind Bank (PSB), Bank of Baroda (BOB), Bank of India (BOI), and ICICI Bank.
* **Account Mask Isolator**: Standardizes standalone account boundaries (`\bAc\b`) and keeps card masks separated from checking account digits.

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
├── screens/             # HomeScreen, HistoryScreen, and SettingsScreen
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
* **Zero External Calls**: All transactional SMS messages are parsed and categorized directly inside the client application. Your financial data is saved only inside the local SQLite database.
* **Ultra-Low Battery Footprint**: The application wakes up momentarily in response to native platform broadcast events (`SmsReceiver` and `NotificationListenerService`) and sleeps immediately, consuming `~1%` battery daily.
