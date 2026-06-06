# Product Requirements Document (PRD)
## Smart Expense Tracker (v1.3.1)

---

### 1. Document Control & Metadata
* **Status**: Approved / Production Reference
* **Version**: 1.3.1
* **Author**: Product Engineering Lead
* **Date**: 2026-05-30
* **Target OS Platform**: Android 8.0+ (API 26+)
* **Technology Architecture**: React Native (New Architecture Enabled) + Kotlin Native Service Layer + SQLite Local Database

---

### 2. Product Vision & Value Proposition

#### The Problem
Modern expense tracking applications suffer from two major problems:
1. **Privacy Intrusion**: They require connecting bank accounts to third-party cloud aggregators via open banking APIs, or they transmit raw SMS and financial notifications to remote servers.
2. **High Friction**: Manual logging apps require users to input every transaction, leading to tracker fatigue and incomplete records.

#### The Solution
The **Smart Expense Tracker** is a personal, automated, privacy-first financial organizer. It intercepts SMS and app notifications from financial institutions natively, extracts transactional details, automatically categorizes the transactions, and updates a local ledger. 

#### Core Value Propositions
* **Privacy First (Zero Remote Calls)**: All transaction extraction, message parsing, database storage, and state management are executed 100% locally on the device. No data is transmitted to any external server.
* **Frictionless Automation**: The app listens to system events in the background to log expenses automatically, only interrupting the user when verification confidence is low.
* **Integrated Debt Split Bookkeeping**: Auto-detects repayments from friends via incoming credit notifications and links them to outstanding splits chronologically.

---

### 3. User Personas & Scenarios

#### Persona A: "The Privacy-Conscious Saver"
* *Needs*: Wants to track their monthly expenditures and savings across multiple accounts without linking bank accounts to an online service.
* *Scenario*: Receives a debit alert from HDFC Bank. The app logs it silently in the background. The user opens the app to see their reconciled balance and spending graphs without worrying about data leaks.

#### Persona B: "The High-Frequency Digital Transactor"
* *Needs*: Uses UPI, cards, and wallets for everything. Needs automated logging because manual logging is too tedious.
* *Scenario*: Buys coffee via UPI and a metro ride via card. Within seconds of the transactions, the system catches the push notifications, parses the amounts and merchants, and groups them under the correct card/bank visual accounts.

#### Persona C: "The Social Splitter & Ledger Keeper"
* *Needs*: Frequently splits restaurant or utility bills with flatmates. Wants to track outstanding splits and have incoming payment alerts resolve debts automatically.
* *Scenario*: Splits a ₹1200 dining bill with "Alex". Alex pays back their ₹600 via Google Pay. The app detects a credit notification containing the keyword "Alex", matches it chronologically to the oldest unsettled split with Alex, marks it as settled, and appends a repayment reference to the ledger.

---

### 4. System Flow & Architecture

The application is structured into three distinct layers:

```
[System Alerts / SMS / Push Notifications]
                   │
                   ▼  (Native Android OS Event Broadcaster)
┌────────────────────────────────────────────────────────┐
│ Native Android Layer (Kotlin)                          │
│  - SmsReceiver (BroadcastReceiver)                     │
│  - NotificationListener (NotificationListenerService)  │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ▼  (TurboModules JSI Native Bridge)
┌────────────────────────────────────────────────────────┐
│ Processing Engine (React Native / JS)                  │
│  - Target Filters (Filter out ads, OTPs, personal SMS)│
│  - Regex Parser (Extract amount, bank, merchant, etc.) │
│  - Dedup Engine (5-minute rolling window checks)       │
│  - Classifier (Rule-based & Merchant Category maps)    │
│  - Confidence Scorer (Routes: Auto-save vs UI Popups)  │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ▼  (Zustand State Store)
┌────────────────────────────────────────────────────────┐
│ Storage & UI Presentation                              │
│  - SQLite Local DB (react-native-quick-sqlite)         │
│  - Dashboard UI Screens (React Navigation 7 Stack)     │
└────────────────────────────────────────────────────────┘
```

---

### 5. Detailed Functional Requirements

#### 5.1. Native Event Capture & Filtering
* **SMS Receiver**: Intercepts incoming SMS broadcasts. Validates that the sender matches bank-like alphanumeric ID patterns (e.g., `XX-HDFCBK`) or short codes (3–6 digits), discarding standard 10-digit personal mobile numbers.
* **Notification Listener**: Listens to active system push notification banners. Whitelists only verified payment and banking packages:
  * Google Pay (`com.google.android.apps.nbu.paisa`)
  * Paytm (`net.one97.paytm`)
  * PhonePe (`com.phonepe.app`)
  * Amazon Pay (`in.amazon.mShop.android.shopping`)
* **Spam Filtration**: Discards messages containing security OTPs, promotional coupons, login notifications, and cellular carrier usage metrics before they hit the parser pipeline.

#### 5.2. Parsing & Confidence Routing Pipeline
* **Regex Extraction Engine**: Parsers convert raw string contents into structured metadata:
  * **Amount**: Searches for currency indicators (`Rs.`, `INR`, `₹`, `Rs`) followed by values.
  * **Transaction Type**: Detects debit indicators (`debited`, `spent`, `paid`, `withdrawn`) and credit indicators (`credited`, `received`, `refund`, `reversed`).
  * **Account**: Extracts suffixes representing cards/accounts (`A/c`, `Card`, `XX1234`).
  * **Bank**: Determines the originating banking institution from sender IDs or body matches.
  * **Merchant / Counterparty**: Extracts names following prepositional cues (`spent at`, `paid to`, `transfer to`).
  * **Available Balance**: Extracts banking balance checkpoints included in bank alerts.
* **Confidence Scorer**: Calculates a confidence score based on field presence and complexity constraints:
  * Baseline value: `0.0`
  * Complete amount extraction: `+0.35`
  * Merchant name extracted: `+0.25`
  * Merchant recognized in category mapping: `+0.20`
  * Payment mode identified: `+0.10`
  * Account number identified: `+0.10`
  * *Penalties*: Multiple amounts in message (`-0.20`), ambiguous merchant name (`-0.15`), and extremely short strings (`-0.10`).
* **Routing Logic**:
  * **Confidence >= 0.8**: Save automatically to the database.
  * **Confidence 0.5 to 0.79**: Display a floating overlay popup (System Alert Window) prompting the user to manually verify, correct, or categorize the expense.
  * **Confidence < 0.5**: Discard the message as spam.
* **Duplicate Detection**: Within a rolling 5-minute window, prevents double-counting if a transaction triggers both an SMS and a push notification. Matching amounts, merchants, and transaction types are marked `is_duplicate = 1` and bypassed during normal history renders.

#### 5.3. Personal Finance Dashboard (Home Screen)
* **Real-time Balance Dashboard**: Renders aggregate balance widgets and spending totals.
* **Category Progress**: Dynamically ranks top 3 spending categories with corresponding progress meters.
* **Quick Logs**: Allows manual transaction creation for cash spending or offline transactions.
* **Quick Splits**: Allows drafting split bills from the home dashboard directly.

#### 5.4. Accounts & Statement Reconciliation
* **Account Grouping**: Groups transactions dynamically using a unified delimiter (`bankName::accountNumber`).
* **Balance Adjustments**: Automatically calculates real-time account balances:
  $$\text{Real-time Balance} = \text{Checkpoint Balance} + \sum \text{Credits} - \sum \text{Debits}$$
  *Checkpoint Balance is retrieved from the latest parsed bank notification.*
* **Anomaly Detection**: Compares chronological expected balance deltas against actual reported balances. Flags deviations, suggesting recovery logs to the user to fill manual cash gaps.
* **Premium Branded Carousel**: Renders account card visualization using deterministic character hashing for debit card colors, and branded theme mapping for top-tier Indian banks (HDFC, ICICI, SBI, BOB, BOI). Autoclasses snap horizontal scroll viewports when transitioning tabs.

#### 5.5. Smart Split Repayment Engine (Ledger)
* **Auto-Repayment Matcher**: Listens for incoming credit transactions (`transactionType === 'credit'`). Runs regex searches utilizing word boundaries (`\b${contactName}\b`) to match the sender against active contact splits.
* **Outstanding Debt Settlement**: Automatically settles outstanding debts chronologically (oldest first). Appends a counterpart split reference to the credit transaction itself.
* **Individual Bill status controls**: Supports toggling single bills as settled/active, and provides an "Unsettle All Balances" trigger to reverse accidental settlements. Wrap all destructive operations in native alert notifications.

---

### 6. Database Schema & Data Models

#### 6.1. Expenses Table (`expenses`)
Stores all transactional data captured by native services or logged manually.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique record ID |
| `amount` | REAL | NOT NULL | Transaction value |
| `merchant` | TEXT | | Raw merchant name parsed |
| `alias` | TEXT | | Custom user-defined name for merchant |
| `category` | TEXT | | Category (e.g., Food, Travel, Groceries) |
| `confidence` | REAL | | Score assigned during parsing |
| `timestamp` | INTEGER | NOT NULL | Transaction time (Unix epoch milliseconds) |
| `source` | TEXT | NOT NULL | Source: `sms` \| `notification` \| `manual` |
| `raw_message` | TEXT | NOT NULL | Raw message string |
| `transaction_type`| TEXT | DEFAULT 'debit' | Type: `debit` \| `credit` |
| `account` | TEXT | | Suffix representing account/card (e.g., `1234`) |
| `bank` | TEXT | | Bank code (e.g., `HDFC`, `SBI`) |
| `payment_mode` | TEXT | DEFAULT 'unknown' | Mode: `upi` \| `card` \| `wallet` \| `unknown` |
| `is_duplicate` | INTEGER | DEFAULT 0 | Flag indicating duplicate records |
| `available_balance`| REAL | | Balance parsed from bank SMS |
| `splits` | TEXT | | JSON string representing debt-split structures |
| `reference_id` | TEXT | | Bank transaction reference number |
| `is_invalid` | INTEGER | DEFAULT 0 | Flag for trashed / hidden items |
| `trash_reason` | TEXT | | Reason for invalidation (e.g., `spam`) |
| `created_at` | INTEGER | DEFAULT (strftime('%s', 'now'))| Record creation time |

*Indices for high performance search queries:*
* `idx_expenses_timestamp` ON `expenses(timestamp)`
* `idx_expenses_category` ON `expenses(category)`
* `idx_expenses_merchant` ON `expenses(merchant)`
* `idx_expenses_reference_id` ON `expenses(reference_id)`

#### 6.2. Merchant Categories Table (`merchant_categories`)
Caches user corrections mapping merchant strings to categories.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `merchant` | TEXT | PRIMARY KEY | Normalized merchant string |
| `category` | TEXT | NOT NULL | User-assigned category override |
| `display_name` | TEXT | | Clean display label |

---

### 7. Non-Functional Requirements

#### 7.1. Performance & Latency
* **Database Access**: Direct, synchronous SQLite writes using `react-native-quick-sqlite` to eliminate JSON serialization latency across the JS bridge.
* **Page Rendering**: Paginate history logs on-demand (chunking loaded queries by 30-day windows) to maintain 60 FPS scrolling performance.

#### 7.2. Battery Footprint
* **Event-Driven Lifecycle**: Background services must only execute upon receiving Broadcast system intents. Services must terminate execution immediately after writing to SQLite. No continuous running processes or wake locks allowed. Estimated battery drain must remain `< 1.5%` per 24 hours.

#### 7.3. Privacy and Local Security
* **Zero Network Traffic**: The application manifest should block arbitrary internet access permissions. Under no circumstances should incoming financial SMS or transactional logs be dispatched to remote tracking servers.
* **On-Device Data Portability**: Provide manual JSON export and import capabilities to let users relocate tracking states across physical devices without cloud dependency.
