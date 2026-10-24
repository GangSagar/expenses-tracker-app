# Smart Expense Tracker (Personal Use) - Technical README

## Overview

This project is a personal Android-based smart expense tracker application.

The app automatically:

- Reads SMS and notifications
- Extracts transaction information
- Categorizes expenses
- Saves entries locally
- Shows floating popup when confidence is low

The project is intended ONLY for personal use and will not be published to Play Store.

---

# Core Features

## Phase 1 (MVP)

- Notification listener (Kotlin)
- SMS receiver (Kotlin)
- Native → RN bridge via TurboModules
- Message parser with regex rules for top 5 banks
- Sender filtering (ignore non-bank SMS)
- SQLite storage with react-native-quick-sqlite
- Expense history list screen
- Basic category assignment (rule-based)

## Phase 2

- Confidence scoring with threshold-based routing
- Floating overlay popup (SYSTEM_ALERT_WINDOW)
- User category correction → updates local merchant map
- Duplicate detection (SMS + notification dedup)
- Credit transaction tracking (separate from expenses)

## Phase 3

- AI-assisted categorization for unknown merchants
- WorkManager nightly cleanup (remove stale duplicates, compact DB)
- Analytics dashboard (monthly spend by category, trends)
- Subscription detection (recurring same-amount same-merchant)

---

# Tech Stack

| Layer            | Technology                           |
| ---------------- | ------------------------------------ |
| Mobile App       | React Native (0.76+, New Arch)       |
| Native Android   | Kotlin                               |
| Database         | SQLite via react-native-quick-sqlite |
| Background Jobs  | WorkManager                          |
| State Management | Zustand                              |
| Navigation       | React Navigation 7                   |
| SQLite Bridge    | react-native-quick-sqlite            |
| Native Bridge    | TurboModules (JSI)                   |

### Why These Choices

- **react-native-quick-sqlite** — synchronous JSI-based SQLite, no async bridge overhead
- **Zustand** — lightweight, no boilerplate, sufficient for local-only state
- **TurboModules** — direct JSI bridge avoids JSON serialization cost for high-frequency SMS events
- **New Architecture** — required for TurboModules/JSI, better performance on event-heavy workloads

---

# High Level Architecture

```plaintext
SMS / Notifications
        ↓
Android Native Listener Layer
        ↓
Bridge Layer (Kotlin → React Native)
        ↓
Processing Engine
    - Parser
    - Classifier
    - Confidence Scorer
        ↓
Decision Layer
    - Auto Save
    - Popup Request
        ↓
SQLite Database
        ↓
UI Dashboard
```

---

# Recommended Project Structure

```plaintext
src/
 ├── core/
 │    ├── parser/
 │    │     ├── parseMessage.ts
 │    │     ├── regexRules.ts
 │    │     ├── filters.ts          # ignore OTP, promo, balance SMS
 │    │
 │    ├── classifier/
 │    │     ├── classify.ts
 │    │     ├── rules.ts
 │    │     ├── merchantMap.ts      # merchant → category lookup
 │    │
 │    ├── confidence/
 │    │     ├── score.ts
 │    │
 │    ├── dedup/
 │    │     ├── duplicateCheck.ts
 │
 ├── services/
 │    ├── messageService.ts
 │    ├── expenseService.ts
 │    ├── notificationFilter.ts     # package whitelist logic
 │
 ├── database/
 │    ├── db.ts
 │    ├── expenseRepo.ts
 │    ├── migrations.ts             # schema versioning
 │
 ├── popup/
 │    ├── PopupManager.ts
 │
 ├── screens/
 │    ├── HomeScreen.tsx
 │    ├── HistoryScreen.tsx
 │    ├── SettingsScreen.tsx
 │
 ├── components/
 │
 ├── hooks/
 │    ├── useExpenses.ts
 │
 ├── navigation/
 │    ├── AppNavigator.tsx
 │
 ├── types/
 │    ├── expense.ts
 │
 ├── __tests__/
 │    ├── parser.test.ts
 │    ├── classifier.test.ts
 │    ├── confidence.test.ts
 │    ├── dedup.test.ts
```

---

# Android Native Structure

```plaintext
android/app/src/main/java/com/expenseapp/

 ├── sms/
 │    └── SmsReceiver.kt
 │
 ├── notification/
 │    └── NotificationListener.kt
 │
 ├── overlay/
 │    └── OverlayService.kt
 │
 ├── bridge/
 │    └── MessageModule.kt
```

---

# App Flow

## Real-time Flow

```plaintext
1. SMS/Notification arrives
2. Native listener captures content
3. Filter: Is it from a known bank/payment sender?
   NO  → Discard
   YES → Continue
4. Filter: Is it a transaction message (not OTP/promo/balance)?
   NO  → Discard
   YES → Continue
5. Message parser extracts details (amount, merchant, mode, account)
6. Is it a credit (refund/salary)?
   YES → Store as credit entry, no popup needed
   NO  → Continue as expense
7. Duplicate check against last 5 minutes
   DUPLICATE → Skip
8. Classifier predicts category
9. Confidence score generated

IF confidence >= 0.8
    → Save automatically

ELSE IF confidence >= 0.5
    → Show popup overlay
    → User selects category
    → Save entry

ELSE
    → Discard (not a valid transaction)
```

---

# Data Model

## Expense Object

```ts
export interface Expense {
  id?: number;
  amount: number;
  merchant: string;
  category: string;
  confidence: number;
  timestamp: number;
  source: "sms" | "notification";
  rawMessage: string;
  transactionType: "debit" | "credit";
  account?: string; // last 4 digits or UPI ID
  paymentMode?: "upi" | "card" | "neft" | "imps" | "wallet" | "unknown";
  isDuplicate?: boolean;
}
```

---

# SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount REAL NOT NULL,
  merchant TEXT,
  category TEXT,
  confidence REAL,
  timestamp INTEGER NOT NULL,
  source TEXT NOT NULL,
  raw_message TEXT NOT NULL,
  transaction_type TEXT NOT NULL DEFAULT 'debit',
  account TEXT,
  payment_mode TEXT DEFAULT 'unknown',
  is_duplicate INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_expenses_timestamp ON expenses(timestamp);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_merchant ON expenses(merchant);
```

---

# Core Modules

## 1. Message Parser

Responsibilities:

- Extract amount
- Extract merchant
- Detect transaction type (debit vs credit)
- Identify payment mode (UPI, card, NEFT, IMPS, wallet)
- Extract account info (last 4 digits)
- Normalize values
- Ignore non-transactional SMS (OTPs, promotions, balance checks)

### Indian Bank SMS Patterns

Most Indian bank SMS follow predictable patterns. The parser must handle:

```plaintext
# HDFC - Card
"Rs.450.00 spent on HDFC Bank Card xx1234 at AMAZON on 15-05-26"
→ amount: 450, merchant: AMAZON, account: xx1234, mode: card

# SBI - UPI
"Dear Customer, your A/c X1234 debited by Rs.200.00 on 15May26 transfer to SWIGGY Ref No 412345678"
→ amount: 200, merchant: SWIGGY, account: X1234, mode: upi

# ICICI - IMPS
"Acct XX123 debited with Rs 5000 on 15-May-26 IMPS to JOHN Ref 312345678"
→ amount: 5000, merchant: JOHN, account: XX123, mode: imps

# Paytm Wallet
"Paid Rs. 150 to Zomato from Paytm Wallet"
→ amount: 150, merchant: Zomato, mode: wallet

# Credit Received (should be marked as credit, not tracked as expense)
"Rs.25000.00 credited to your A/c XX1234"
→ transactionType: credit (skip or store separately)
```

### Key Regex Patterns

```plaintext
Amount:    /(?:Rs\.?|INR|₹)\s*(\d+(?:[,\.]\d+)*)/i
Debit:     /(?:debited|spent|paid|withdrawn|purchase)/i
Credit:    /(?:credited|received|refund|reversed)/i
Account:   /(?:A\/c|Acct?|Card|account)\s*[Xx*]*(\d{4})/i
UPI:       /(?:UPI|upi|VPA)/i
IMPS:      /IMPS/i
NEFT:      /NEFT/i
Merchant:  /(?:at|to|towards|for)\s+([A-Za-z0-9\s]+?)(?:\s+on|\s+Ref|$)/i
```

### Messages to Ignore

```plaintext
- OTP messages: /OTP|otp|one.time.password/i
- Promotional: /offer|cashback|reward|congratulations/i
- Balance inquiry: /available.*balance|bal.*is/i
- Login alerts: /logged.in|login/i
```

---

## 2. Classifier

Responsibilities:

- Categorize merchants using rule-based keyword mapping
- Support user corrections that update local rules
- Optional AI fallback later

### Category List

```plaintext
Food & Dining   → Swiggy, Zomato, restaurant names, cafe, dhaba
Travel          → Uber, Ola, Rapido, IRCTC, MakeMyTrip, petrol pumps
Shopping        → Amazon, Flipkart, Myntra, Ajio, mall stores
Groceries       → BigBasket, Blinkit, Zepto, DMart, local stores
Bills & Recharge→ Jio, Airtel, Vi, electricity, gas, broadband
Entertainment   → Netflix, Hotstar, Spotify, PVR, BookMyShow
Health          → Apollo, Pharmeasy, 1mg, hospital, clinic
Finance         → EMI, loan, insurance, mutual fund, SIP
Education       → Udemy, Coursera, books, tuition
Transfers       → Person-to-person UPI transfers
Other           → Anything unmatched
```

### Matching Strategy

```plaintext
1. Exact match on merchant name (from user corrections DB)
2. Keyword/substring match against category rules
3. Sender ID match (e.g., VM-SWIGGY → Food)
4. Default to "Other" with low confidence
```

---

## 3. Confidence Scorer

Responsibilities:

- Determine confidence of extracted data
- Trigger popup only when uncertain

### Scoring Logic

```plaintext
Base score: 0.0

Amount detected clearly        → +0.35
Merchant name extracted        → +0.25
Known merchant in rules DB     → +0.20
Payment mode identified        → +0.10
Account number found           → +0.10

Penalties:
Multiple amounts in message    → -0.20
Ambiguous merchant (short/generic) → -0.15
Message too short (<20 chars)  → -0.10
```

### Thresholds

```plaintext
confidence >= 0.8  → Auto-save silently
confidence 0.5–0.8 → Show popup for confirmation
confidence < 0.5   → Discard (likely not a transaction)
```

---

## 4. Overlay Popup

Responsibilities:

- Show floating confirmation popup
- Allow quick category selection
- Avoid interrupting user too much

Suggested UI:

```plaintext
Spent ₹450 at XYZ

Select Category:
[Food] [Travel] [Shopping]
```

---

## 5. Duplicate Detection

The same transaction often arrives via both SMS and notification. Prevent double-counting.

### Strategy

```plaintext
A message is a duplicate if ALL of the following match within a 5-minute window:
  - Same amount
  - Same merchant (normalized)
  - Same transaction type

Implementation:
  1. Before saving, query last 5 minutes of expenses
  2. Compare amount + merchant + type
  3. If match found → mark is_duplicate = true, skip saving
```

### Edge Cases

- Same merchant, different amounts within 5 min → NOT duplicate (multiple purchases)
- Same amount to same merchant but 30 min apart → NOT duplicate

---

## 6. Notification Filtering

Not all notifications are relevant. Filter aggressively.

### Whitelist Approach (Recommended)

Only process notifications from known banking/payment app packages:

```plaintext
com.google.android.apps.nbu.paisa  → Google Pay
net.one97.paytm                     → Paytm
com.phonepe.app                     → PhonePe
in.amazon.mShop.android.shopping    → Amazon Pay
com.whatsapp                        → WhatsApp Pay (optional)
```

### SMS Sender ID Filtering

Only process SMS from transactional sender IDs:

```plaintext
Pattern: /^[A-Z]{2}-[A-Z]+$/  (e.g., VM-HDFCBK, AD-SBIINB, JD-ICICIB)

Ignore:
- 10-digit numbers (personal SMS)
- Short codes with promotional prefixes (TD-, TA-)
```

---

# Battery Optimization Strategy

## Important Rules

### DO

- Use event-driven listeners
- Process only on incoming message
- Keep parsing lightweight
- Use WorkManager for cleanup tasks

### DO NOT

- Use infinite loops
- Poll messages continuously
- Keep foreground service alive unnecessarily

Expected battery usage:

- Approximately 1–3% per day

---

# Suggested Development Order

## Step 1

Set up React Native project

## Step 2

Implement Notification Listener

## Step 3

Bridge native events to React Native

## Step 4

Implement parser

## Step 5

Store expenses in SQLite

## Step 6

Create transaction history UI

## Step 7

Implement floating popup

## Step 8

Improve classification logic

## Step 9

Add optional AI fallback

---

# Android Permissions

Add to AndroidManifest.xml

```xml
<uses-permission android:name="android.permission.READ_SMS"/>
<uses-permission android:name="android.permission.RECEIVE_SMS"/>
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
```

Notification Listener Service:

```xml
<service
    android:name=".notification.NotificationListener"
    android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">

    <intent-filter>
        <action android:name="android.service.notification.NotificationListenerService"/>
    </intent-filter>
</service>
```

---

# Future Improvements

- Monthly analytics
- Budget tracking
- Subscription detection
- Expense prediction
- Offline AI classification
- Cloud backup
- Export to Excel/CSV

---

# Development Environment

Development is supported on **Windows**, **Linux** (including Mint/Ubuntu), and **macOS**.

| Tool             | Version        |
| ---------------- | -------------- |
| Node.js          | 20 LTS         |
| Package Manager  | yarn 1.x       |
| React Native CLI | latest         |
| Android Studio   | latest stable  |
| JDK              | 17 (Temurin)   |
| Kotlin           | 1.9+           |
| Min Android SDK  | 26 (Android 8) |
| Target SDK       | 34             |

### Platform-Specific Setup

#### Linux (Mint / Ubuntu)

```bash
# Install Node.js via nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20

# Install JDK 17
sudo apt install openjdk-17-jdk

# Install Android Studio or just command-line tools
# Download from https://developer.android.com/studio
# Or CLI-only:
sudo apt install android-sdk

# Set environment variables (~/.bashrc or ~/.zshrc)
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools

# Install watchman (recommended for RN file watching)
sudo apt install watchman || brew install watchman
```

#### Windows

```powershell
# Install via scoop or chocolatey
scoop install nodejs-lts yarn android-studio

# Or use winget
winget install OpenJDK.17.Temurin

# Set environment variables
# ANDROID_HOME = %LOCALAPPDATA%\Android\Sdk
# Add to PATH: %ANDROID_HOME%\emulator, %ANDROID_HOME%\platform-tools

# WSL alternative: develop inside WSL2 (Ubuntu) and connect to
# Android device via adb over TCP or use Windows adb from WSL:
# export ADB_SERVER_SOCKET=tcp:host.docker.internal:5037
```

#### macOS

```bash
brew install node@20 yarn watchman
brew install --cask android-studio
brew install --cask temurin@17

# Set environment variables (~/.zshrc)
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### First-time Project Setup (All Platforms)

```bash
npx @react-native-community/cli init ExpenseTracker --pm yarn
cd ExpenseTracker
# Enable New Architecture in android/gradle.properties:
# newArchEnabled=true
```

### Cross-Platform Notes

- **Path separators** — Use `path.join()` or `path.resolve()` in any build scripts; never hardcode `\` or `/`
- **Line endings** — Add `.gitattributes` to enforce LF:
  ```
  * text=auto eol=lf
  ```
- **Case sensitivity** — Linux filesystems are case-sensitive; keep all filenames consistently lowercase or camelCase
- **ADB from WSL** — If developing on Windows via WSL, run `adb` on the Windows side and connect via `adb tcpip 5555` or use the Windows PATH from WSL
- **Android emulator** — Works natively on all three OSes; on Linux ensure KVM is enabled (`sudo apt install qemu-kvm`)
- **Physical device** — On Linux, add udev rules for USB debugging:
  ```bash
  sudo apt install android-tools-adb
  echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="YOUR_VENDOR_ID", MODE="0666"' | sudo tee /etc/udev/rules.d/51-android.rules
  ```

---

# Testing Strategy

Focus testing on the core logic modules (parser, classifier, confidence) since they have no UI dependencies and are the most likely to break.

### Unit Tests (Jest)

```plaintext
Parser tests:
  - One test per bank SMS format (HDFC, SBI, ICICI, Axis, Kotak)
  - UPI, card, NEFT, IMPS message variants
  - Credit vs debit detection
  - Edge cases: multiple amounts, missing merchant, malformed messages

Classifier tests:
  - Known merchants map correctly
  - Unknown merchants return "Other"
  - User correction overrides default rule

Confidence tests:
  - Full extraction → score >= 0.8
  - Missing merchant → score between 0.5–0.8
  - Ambiguous message → score < 0.5

Dedup tests:
  - Same SMS + notification → flagged as duplicate
  - Different amounts → not duplicate
  - Same amount, >5 min apart → not duplicate
```

### Test Data

Keep a `__fixtures__/sms-samples.json` with 50+ real SMS examples across banks for regression testing.

---

# Error Handling

```plaintext
Parser failure     → Log raw message, skip silently (don't crash)
DB write failure   → Retry once, then queue for next attempt
Bridge failure     → Native side buffers messages, retries on RN ready
Overlay denied     → Fall back to in-app notification on next open
```

---

# Notes

This application is intended strictly for personal use.

Development environment: Windows, Linux (Mint/Ubuntu), or macOS — keep all tooling and scripts OS-agnostic.

Focus on:

- Simplicity
- Reliability
- Battery efficiency
- Fast parsing
- Minimal user interruption
- Cross-platform dev compatibility (no OS-specific scripts)

Avoid overengineering early.

Build the MVP first.
