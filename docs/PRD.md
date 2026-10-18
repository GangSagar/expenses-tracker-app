# 📄 Product Requirements Document (PRD)

# 📱 Smart Expense Tracker (SpendWise)

| Metadata | Details |
| :--- | :--- |
| **Product Name** | Smart Expense Tracker (SpendWise) |
| **Document Version** | 1.5.0 |
| **Status** | Approved / In Active Production |
| **Target Platform** | Android 8.0+ (API Level 26+) |
| **Document Owner** | Engineering & Product Architecture Team |
| **Last Updated** | October 2026 |

---

## 1. Executive Summary

**Smart Expense Tracker** is an automated, privacy-first personal finance application for Android. It eliminates the manual burden of recording daily expenses by automatically intercepting, parsing, and categorizing incoming transactional bank SMS alerts and financial push notifications in real time.

Unlike mainstream financial trackers that upload sensitive transactional messages and financial data to remote cloud servers, Smart Expense Tracker is **100% local-first and offline**. All regex matching, merchant classification, financial reconciliation, and database transactions occur entirely on the user's device using high-speed embedded SQLite (`react-native-quick-sqlite`), guaranteeing zero external data exposure.

---

## 2. Problem Statement & Market Opportunity

### 2.1 The Problem
1. **High Friction of Manual Tracking**: Users who manually record expenses abandon tracking apps within 7–14 days due to repetitive data entry fatigue.
2. **Cloud Privacy & Security Concerns**: Commercial expense trackers frequently harvest user SMS data, selling financial profiles to third-party credit/loan brokers or exposing sensitive banking messages to cloud data breaches.
3. **Complex Payment Ecosystem in India**: A single user frequently uses multiple bank accounts (SBI, HDFC, ICICI, etc.), debit cards, credit cards, UPI VPAs (GPay, PhonePe, Paytm), and cash. Reconciling these without automated cross-platform deduplication leads to double-counted or missing transactions.
4. **Owed Debts & Split Bill Headaches**: Roommates and friends frequently split bills, but tracking who owes what and manually updating ledgers when repayments arrive via UPI is error-prone and tedious.

### 2.2 The Solution
Smart Expense Tracker delivers:
- **Instant Zero-Click Logging**: Automated real-time ingestion from SMS and payment notifications.
- **Strict Privacy**: Zero tracking, zero telemetry to third parties, zero cloud storage.
- **Smart Debt Settlement**: Automatic detection of incoming repayments from friends with immediate split debt clearance.
- **Card & Bank Balance Synchronization**: Live discrepancy detection between logged expenses and reported bank account balances.

---

## 3. User Personas

### Persona A: "The Digital Nomad / Tech Professional" (Rohan, 28)
* **Behavior**: Transacts 10–20 times daily via UPI, credit cards, and food delivery apps. Holds accounts across 3 different banks.
* **Pain Points**: Forgets manual entries; deeply concerned about giving financial cloud apps broad access to read personal messages.
* **Goals**: Wants a reliable ledger that categorizes spending automatically without sending bank statements to external servers.

### Persona B: "The Shared Living Resident" (Ananya, 24)
* **Behavior**: Frequently pays group electricity bills, groceries, and dinners, splitting expenses with 3 flatmates.
* **Pain Points**: Flatmates pay her back small amounts over UPI throughout the month; loses track of who has cleared their dues.
* **Goals**: Wants incoming payments from flatmates to automatically settle outstanding group splits.

---

## 4. Product Principles & Non-Negotiables

1. **Local-First & Zero-Cloud**: No server infrastructure, no user authentication required, no telemetry sent to commercial backends.
2. **Deterministic & Explainable**: Parsing decisions are grounded in transparent, maintainable regex rules and local heuristics.
3. **Battery-Conservative**: Native listeners wake up only when a financial broadcast is received and shut down immediately (<1% daily battery impact).
4. **Data Portability**: Users can export full JSON backups or restore existing historical records with a single tap.

---

## 5. Functional Requirements (FR)

### FR-1: Native SMS & Notification Ingestion
* **FR-1.1**: The application shall register a background Android `BroadcastReceiver` (`SmsReceiver`) to intercept incoming transactional SMS broadcasts (`android.provider.Telephony.SMS_RECEIVED`).
* **FR-1.2**: The application shall register a native `NotificationListenerService` to intercept push notifications from approved payment packages (Google Pay, PhonePe, Paytm, BHIM, Cred, Amazon Pay).
* **FR-1.3**: The system shall apply an instant sender allowlist/blocklist filter to discard personal messages, spam, OTPs, balance inquiries, and cellular operator ads before heavy processing.

### FR-2: Entity Extraction & Message Parsing
* **FR-2.1**: The parser shall extract:
  * **Amount**: Handles currencies (`₹`, `Rs.`, `INR`), decimal precision, and comma separators.
  * **Transaction Type**: Categorizes as `debit` (spent, withdrawn, paid) or `credit` (received, refunded, deposited, cash income).
  * **Payment Mode**: Detects `upi`, `cc` (credit card), `dc` (debit card), `netbanking`, `atm`, or `cash`.
  * **Bank Identifier**: Recognizes major Indian banks (SBI, HDFC, ICICI, Axis, Bank of Baroda, PNB, Kotak, BOI, Punjab & Sind Bank, etc.).
  * **Masked Account Number**: Extracts 3 to 4 digit account or card identifiers (e.g. `XX1234`).
  * **Merchant / Payee Name**: Cleans and extracts display merchant or payee entity.
  * **Available Balance**: Extracts reported post-transaction account balance for live reconciliation.
  * **Reference ID / UTR**: Extracts bank transaction reference or UPI UTR number for deduplication.

### FR-3: Multi-Source Deduplication
* **FR-3.1**: When a transaction triggers both an app push notification and a bank SMS alert, the system shall match transactions within a 15-minute sliding window based on identical reference ID, amount, or account number.
* **FR-3.2**: Duplicate transactions shall be flagged with `is_duplicate = 1` and excluded from expense totals and visual charts.

### FR-4: Smart Ledger & Bill Splitting
* **FR-4.1**: Users can split any transaction among device contacts or custom names with custom share percentages or exact amounts.
* **FR-4.2**: The app shall maintain an active Split Ledger tracking total net balance owed to the user.
* **FR-4.3 (Smart Auto-Repayment)**: When an incoming credit SMS arrives containing a contact's name (e.g., *"credited Rs 500 by UPI from Rohan"*), the system shall automatically match the active split owed by that contact, mark it as settled chronologically (oldest first), and link the repayment to the credit transaction.
* **FR-4.4**: Users can toggle individual splits between settled and active or use an **"Unsettle All"** safeguard button to reverse accidental bulk settlements.

### FR-5: Accounts Carousel & Bank Balance Reconciliation
* **FR-5.1**: Displays an interactive card slider showing all detected bank accounts and credit cards.
* **FR-5.2**: Cards shall feature deterministic, dynamic visual styling based on a hash of the bank name and account number, preserving official brand tones for top banks.
* **FR-5.3**: Flags balance discrepancies when calculated ledger balances diverge from bank-reported available balances, providing an anomaly resolution dialog.

### FR-6: Historical SMS Backfill & Sync Engine
* **FR-6.1**: The app shall provide a date-driven backfill feature allowing users to import historical SMS messages starting from a chosen calendar date.
* **FR-6.2**: The backfill shall operate with timestamp-based paging to prevent bridge memory overflows when processing thousands of historical messages.
* **FR-6.3**: Users shall be presented with an interactive approval list to review and confirm imported transactions before committing them to SQLite.

### FR-7: Data Backup, Import & Reset
* **FR-7.1**: Users can export all stored transactions and categories into a formatted JSON backup file via the Android system Share sheet.
* **FR-7.2**: Users can restore data by pasting a previously exported backup JSON payload.
* **FR-7.3**: Includes a confirmed **"Danger Zone"** option to wipe transaction data while preserving merchant learning models.

---

## 6. Non-Functional Requirements (NFR)

| ID | Category | Requirement Description | Target Metric |
| :--- | :--- | :--- | :--- |
| **NFR-1** | **Privacy** | Zero outbound network calls containing financial data. Database stored encrypted in app internal storage. | 0 bytes leaked to internet |
| **NFR-2** | **Performance** | Time taken from SMS arrival to database storage. | < 150 ms |
| **NFR-3** | **Battery** | Daily battery consumption of native receivers and background listeners. | < 1.0% per 24 hours |
| **NFR-4** | **Reliability** | Parsing accuracy on standard Indian banking transactional templates. | > 98% precision |
| **NFR-5** | **Storage** | SQLite query execution times for aggregation and list paging (up to 50,000 transactions). | < 25 ms per query |
| **NFR-6** | **Compatibility** | Support for modern Android releases and CPU architectures. | Android 8.0 - 16 (`arm64-v8a`, `x86_64`) |

---

## 7. Out-of-Scope (Non-Goals)

1. **Cloud Sync / Multi-Device Sync**: No cloud accounts or synchronizing across multiple physical phones.
2. **Automated Bank Login / Net Banking Scraping**: The app will never ask for or store bank net banking passwords or OTPs.
3. **Automated Fund Transfers**: The app is strictly read-only and will never initiate UPI or banking payments.
4. **iOS Support**: iOS does not permit third-party applications to intercept incoming SMS or system notification broadcasts.

---

## 8. Success Metrics & Key Results (OKRs)

- **Parse Accuracy**: >= 98% of valid bank debit/credit alerts correctly parse amount, bank, and transaction type.
- **Zero Data Loss**: 100% of parsed transactions durably committed to SQLite with ACID compliance.
- **Low False Positive Rate**: < 0.1% of promotional SMS or OTPs mistakenly logged as financial transactions.
- **User Trust**: 100% transparency with zero network tracking permissions required in `AndroidManifest.xml` (other than localhost dev bridge).
