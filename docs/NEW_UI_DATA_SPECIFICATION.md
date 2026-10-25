# SpendWise (Smart Expense Tracker) — Complete UI Data Specification & Demo Dataset

This document provides a comprehensive, production-grade specification of all **data models**, **API contracts**, **database queries**, **state stores**, and **realistic demo datasets** used across the entire SpendWise application.

It is designed as an all-in-one blueprint for **UI/UX designers**, **design system engineers**, and **frontend developers** building a brand-new interface for the application.

---

## 1. Architectural Overview & Data Flow

SpendWise is a **100% offline-first, private personal finance manager**. All data is stored locally on the user's device in an embedded SQLite database (`expense_tracker.db`). There are no external cloud servers, analytics, or third-party tracking APIs.

```
┌────────────────────────────────────────────────────────┐
│                   Native Android OS                    │
│  [SmsReceiver]          [NotificationListenerService]  │
└────────────┬───────────────────────────┬───────────────┘
             │ (Raw SMS)                 │ (Raw Push Notification)
             ▼                           ▼
┌────────────────────────────────────────────────────────┐
│         Modular 10-Stage Parsing Engine (Clean Arch)   │
│  • Message Filter        • Lexical Tokenizer           │
│  • Composable Normalizer • Targeted Extractors         │
│  • Declarative Bank Rules• On-Device Learning Map      │
└────────────────────────────┬───────────────────────────┘
                             ▼
┌────────────────────────────────────────────────────────┐
│             Local SQLite Database (Quick-SQLite)       │
│  • expenses               • merchant_categories        │
│  • settings (Key-Value)   • spans (OTLP Telemetry)     │
└────────────┬───────────────────────────┬───────────────┘
             │                           │
             ▼                           ▼
┌────────────────────────────────────────────────────────┐
│                   Zustand State Stores                 │
│  • useExpenseStore       • useSecurityStore            │
└────────────┬───────────────────────────┬───────────────┘
             │                           │
             ▼                           ▼
┌────────────────────────────────────────────────────────┐
│                     React Native UI                    │
│  [Dashboard] [History] [Accounts] [Splits] [Settings]  │
└────────────────────────────────────────────────────────┘
```

---

## 2. Global Enums, Types & Formatting Rules

### 2.1 Currency & Number Formatting
* **Currency Symbol**: `₹` (Indian Rupee, INR).
* **Number Format**: Indian numbering format (Lakhs and Crores): `₹1,50,000.00` or `₹4,039.12`.
* **Standard Helper**:
  ```ts
  formatAmount(amount: number): string // e.g. 450 -> "₹450.00"
  ```

### 2.2 Transaction Types
```ts
export type TransactionType = 'debit' | 'credit';
```
* `debit`: Money leaving the account (Outflow, Expenses). Represented visually with crimson/red colors (e.g. `#ef4444`).
* `credit`: Money entering the account (Inflow, Salary, Refunds, Friend repayment). Represented visually with emerald/green colors (e.g. `#10b981`).

### 2.3 Transaction Sources
```ts
export type TransactionSource = 'sms' | 'notification' | 'manual';
```
* `sms`: Automatically parsed from incoming bank transactional SMS.
* `notification`: Captured from UPI app push notifications (Google Pay, PhonePe, Paytm).
* `manual`: Manually entered by the user via the "Add Transaction" modal.

### 2.4 Payment Modes
```ts
export type PaymentMode = 'upi' | 'card' | 'netbanking' | 'atm' | 'cash' | 'cc' | 'other' | 'unknown';
```

### 2.5 Expense Categories & Color Palette
```ts
export type Category = 
  | 'Food & Dining'
  | 'Groceries'
  | 'Shopping'
  | 'Travel & Transport'
  | 'Bills & Utilities'
  | 'Entertainment'
  | 'Health & Medical'
  | 'Personal Care'
  | 'Education'
  | 'Investments'
  | 'Salary & Income'
  | 'Transfer'
  | 'Rent'
  | 'Other';
```

#### Category Design Tokens
| Category | Icon | Primary Color | Background Tint |
| :--- | :---: | :--- | :--- |
| **Food & Dining** | 🍔 | `#ff9f43` (Orange) | `rgba(255, 159, 67, 0.15)` |
| **Groceries** | 🛒 | `#10b981` (Emerald) | `rgba(16, 185, 129, 0.15)` |
| **Shopping** | 🛍️ | `#a855f7` (Purple) | `rgba(168, 85, 247, 0.15)` |
| **Travel & Transport** | 🚕 | `#06b6d4` (Cyan) | `rgba(6, 182, 212, 0.15)` |
| **Bills & Utilities** | ⚡ | `#f59e0b` (Amber) | `rgba(245, 158, 11, 0.15)` |
| **Entertainment** | 🎬 | `#ec4899` (Pink) | `rgba(236, 72, 153, 0.15)` |
| **Health & Medical** | 💊 | `#ef4444` (Red) | `rgba(239, 68, 68, 0.15)` |
| **Personal Care** | 💅 | `#d946ef` (Fuchsia) | `rgba(217, 70, 239, 0.15)` |
| **Education** | 📚 | `#3b82f6` (Blue) | `rgba(59, 130, 246, 0.15)` |
| **Investments** | 📈 | `#8b5cf6` (Indigo) | `rgba(139, 92, 246, 0.15)` |
| **Salary & Income** | 💰 | `#22c55e` (Green) | `rgba(34, 197, 94, 0.15)` |
| **Transfer** | 🔁 | `#64748b` (Slate) | `rgba(100, 116, 139, 0.15)` |
| **Rent** | 🏠 | `#0284c7` (Sky) | `rgba(2, 132, 199, 0.15)` |
| **Other** | 📦 | `#94a3b8` (Gray) | `rgba(148, 163, 184, 0.15)` |

---

## 3. Core Database Models & Interfaces

### 3.1 Primary `Expense` Model
```typescript
export interface ExpenseSplit {
  contactName: string;
  amount: number;
  isPaid?: boolean;
  owedByMe?: boolean;
}

export interface Expense {
  id?: number;
  amount: number;
  merchant: string;
  alias?: string;
  category: Category;
  confidence: number;            // 0.0 to 1.0 (parser confidence)
  timestamp: number;             // Unix timestamp in ms
  source: TransactionSource;     // 'sms' | 'notification' | 'manual'
  rawMessage: string;            // Original SMS/notification text
  transactionType: TransactionType; // 'debit' | 'credit'
  account?: string;              // Masked account number, e.g. "XX1234"
  bank?: string;                 // Bank name, e.g. "HDFC", "SBI", "ICICI"
  paymentMode?: PaymentMode;     // 'upi' | 'card' | 'netbanking' | 'cc' etc.
  isDuplicate?: boolean;         // Flagged if matched within dedup window
  availableBalance?: number;     // Reported bank balance after transaction
  splits?: ExpenseSplit[];       // Shared debt / bill split details
  referenceId?: string;          // Bank UTR or UPI transaction ref (e.g. "429182749102")
  isInvalid?: boolean;           // Marked as trashed/spam/deleted by user
  trashReason?: 'spam' | 'false' | 'duplicate' | 'other';
}
```

### 3.2 Bank Account Summary Model
```typescript
export interface AccountSummary {
  bank: string;                  // e.g. "HDFC"
  account: string;               // e.g. "XX1234"
  balance: number;               // Current calculated or reconciled balance
  latestBalance?: number;        // Most recent bank-reported available balance
  totalCredits: number;          // Total inflow to this account
  totalDebits: number;           // Total outflow from this account
  transactionCount: number;      // Total logged transactions
  cardType: 'debit' | 'cc';      // Debit Card or Credit Card
  cardColorGradient: string[];   // e.g. ["#004c8f", "#002d56"] for HDFC
}
```

### 3.3 AI Budget & Anomaly Insight Model
```typescript
export interface BudgetInsight {
  totalSpent: number;
  budgetLimit: number;
  percentageUsed: number;        // e.g. 74.2%
  daysRemainingInMonth: number;
  dailySafeSpend: number;        // Remaining budget / days remaining
  projectedMonthEndSpend: number;
  status: 'on_track' | 'warning' | 'exceeded';
  alerts: string[];              // Human-readable tips/warnings
}
```

---

## 4. Screen-by-Screen API & Data Mapping

---

### Screen 1: Dashboard / Home (`HomeScreen`)

#### User Experience & Purpose
The main control center. Shows current net worth/balance across all banks, an interactive carousel of bank cards, quick category breakdown, AI budget health bar, and the 5 most recent transactions.

#### Required Data Inputs
1. `currentBalance`: `totalCredits - totalDebits` across active expenses.
2. `totalCredits`: Total income/credits logged this month.
3. `totalDebits`: Total expenses/debits logged this month.
4. `accountsList`: Array of `AccountSummary` for the card carousel.
5. `budgetInsight`: Computed monthly spend vs `monthly_budget_limit` setting.
6. `topCategories`: Top 3-5 categories sorted by spend percentage.
7. `recentExpenses`: Most recent 5-10 transactions.

#### Demo JSON Payload for Dashboard
```json
{
  "summary": {
    "currentBalance": 45892.45,
    "totalIncomeMonth": 125000.00,
    "totalExpenseMonth": 79107.55,
    "monthlyBudgetLimit": 85000.00,
    "budgetUsedPercentage": 93.07,
    "daysRemainingInMonth": 7,
    "dailySafeSpend": 841.78,
    "budgetStatus": "warning"
  },
  "accounts": [
    {
      "bank": "HDFC",
      "account": "XX4892",
      "balance": 28450.50,
      "cardType": "debit",
      "cardHolder": "Harshit Sharma",
      "gradient": ["#004c8f", "#002d56"]
    },
    {
      "bank": "SBI",
      "account": "XX1044",
      "balance": 17441.95,
      "cardType": "debit",
      "cardHolder": "Harshit Sharma",
      "gradient": ["#1a73e8", "#0d47a1"]
    },
    {
      "bank": "ICICI",
      "account": "XX9012",
      "balance": 14250.00,
      "cardType": "cc",
      "cardHolder": "Harshit Sharma (Amazon Pay)",
      "gradient": ["#b71c1c", "#880e4f"]
    }
  ],
  "topCategories": [
    {
      "category": "Food & Dining",
      "icon": "🍔",
      "color": "#ff9f43",
      "amount": 24850.00,
      "percentage": 31.4
    },
    {
      "category": "Shopping",
      "icon": "🛍️",
      "color": "#a855f7",
      "amount": 18400.00,
      "percentage": 23.3
    },
    {
      "category": "Travel & Transport",
      "icon": "🚕",
      "color": "#06b6d4",
      "amount": 12300.00,
      "percentage": 15.5
    },
    {
      "category": "Bills & Utilities",
      "icon": "⚡",
      "color": "#f59e0b",
      "amount": 9500.00,
      "percentage": 12.0
    },
    {
      "category": "Groceries",
      "icon": "🛒",
      "color": "#10b981",
      "amount": 8150.00,
      "percentage": 10.3
    }
  ],
  "recentTransactions": [
    {
      "id": 101,
      "amount": 450.00,
      "merchant": "Swiggy",
      "category": "Food & Dining",
      "timestamp": 1729828200000,
      "transactionType": "debit",
      "paymentMode": "upi",
      "bank": "HDFC",
      "account": "XX4892",
      "referenceId": "UPI/4298104812"
    },
    {
      "id": 102,
      "amount": 125000.00,
      "merchant": "Infosys Ltd Salary",
      "category": "Salary & Income",
      "timestamp": 1729741800000,
      "transactionType": "credit",
      "paymentMode": "netbanking",
      "bank": "HDFC",
      "account": "XX4892",
      "referenceId": "CMS/SAL/OCT26"
    },
    {
      "id": 103,
      "amount": 2499.00,
      "merchant": "Amazon India",
      "category": "Shopping",
      "timestamp": 1729655400000,
      "transactionType": "debit",
      "paymentMode": "cc",
      "bank": "ICICI",
      "account": "XX9012",
      "referenceId": "TXN948120"
    },
    {
      "id": 104,
      "amount": 340.00,
      "merchant": "Uber India",
      "category": "Travel & Transport",
      "timestamp": 1729569000000,
      "transactionType": "debit",
      "paymentMode": "upi",
      "bank": "SBI",
      "account": "XX1044",
      "referenceId": "UPI/4289012381"
    }
  ]
}
```

---

### Screen 2: Transactions / History (`HistoryScreen`)

#### User Experience & Purpose
Comprehensive search and filtration screen. Allows searching transactions by merchant, reference ID, category, payment mode, bank account, and date intervals. Supports editing categories/amounts, trashing duplicates/spam, and bill splitting.

#### Query Capabilities
* **Full-text search**: Matches `merchant`, `rawMessage`, `referenceId`, `account`.
* **Filters**:
  * Type: `all` | `debit` | `credit`
  * Date presets: `all` | `today` | `7d` | `30d` | `90d` | `custom`
  * Category: Selected from list of 14 categories.
  * Bank Account: Filter by specific bank/account.
  * Payment Mode: Filter by `upi`, `card`, `cc`, `cash`.
* **Pagination**: `limit` (default 50) and `offset`.

#### Demo JSON Payload for History Screen
```json
[
  {
    "id": 101,
    "amount": 450.00,
    "merchant": "Swiggy",
    "alias": "Swiggy Online",
    "category": "Food & Dining",
    "confidence": 0.95,
    "timestamp": 1729828200000,
    "source": "sms",
    "transactionType": "debit",
    "bank": "HDFC",
    "account": "XX4892",
    "paymentMode": "upi",
    "availableBalance": 28450.50,
    "referenceId": "429810481291",
    "rawMessage": "Dear Customer, your A/c XX4892 is debited for Rs 450.00 on 25-Oct-26 at SWIGGY UPI:429810481291. Avl Bal: INR 28450.50 - HDFC Bank",
    "splits": []
  },
  {
    "id": 105,
    "amount": 1850.00,
    "merchant": "Smoke House Deli",
    "alias": "Smoke House",
    "category": "Food & Dining",
    "confidence": 0.92,
    "timestamp": 1729792200000,
    "source": "sms",
    "transactionType": "debit",
    "bank": "HDFC",
    "account": "XX4892",
    "paymentMode": "card",
    "availableBalance": 28900.50,
    "referenceId": "POS981241",
    "rawMessage": "Alert: Rs 1850.00 spent on HDFC Bank Card XX4892 at SMOKE HOUSE DELI on 24-Oct-26. Avl Bal: Rs 28900.50",
    "splits": [
      {
        "contactName": "Rahul Verma",
        "amount": 616.66,
        "isPaid": false
      },
      {
        "contactName": "Sneha Roy",
        "amount": 616.66,
        "isPaid": true
      }
    ]
  },
  {
    "id": 106,
    "amount": 1200.00,
    "merchant": "Airtel Broadband",
    "alias": "Airtel Fibernet",
    "category": "Bills & Utilities",
    "confidence": 0.98,
    "timestamp": 1729690000000,
    "source": "notification",
    "transactionType": "debit",
    "bank": "SBI",
    "account": "XX1044",
    "paymentMode": "upi",
    "availableBalance": 17441.95,
    "referenceId": "UPI/4289011928",
    "rawMessage": "Paid ₹1,200.00 to Airtel Broadband via Google Pay",
    "splits": []
  },
  {
    "id": 107,
    "amount": 600.00,
    "merchant": "Rahul Verma",
    "alias": "Rahul",
    "category": "Transfer",
    "confidence": 0.88,
    "timestamp": 1729603600000,
    "source": "sms",
    "transactionType": "credit",
    "bank": "HDFC",
    "account": "XX4892",
    "paymentMode": "upi",
    "availableBalance": 30750.50,
    "referenceId": "428710294101",
    "rawMessage": "A/c XX4892 credited by Rs 600.00 on 22-Oct-26 via UPI by Rahul Verma (Ref no 428710294101) - HDFC Bank",
    "splits": []
  }
]
```

---

### Screen 3: Accounts & Cards Management (`AccountsScreen`)

#### User Experience & Purpose
Lists all financial institutions and accounts auto-discovered from parsed messages. Allows:
1. Reconciling balance directly with the latest SMS available balance.
2. Toggling card type between **Debit Card** and **Credit Card** (which changes billing, card gradients, and carousel styling).
3. Hiding inactive or dormant bank accounts from total net worth.
4. Viewing total debits/credits per account.

#### Demo JSON Payload for Accounts Screen
```json
[
  {
    "bank": "HDFC Bank",
    "account": "XX4892",
    "accountType": "Savings Account",
    "cardType": "debit",
    "balance": 28450.50,
    "reportedAvailableBalance": 28450.50,
    "lastUpdated": 1729828200000,
    "isHidden": false,
    "totalCredits": 135600.00,
    "totalDebits": 48200.50,
    "transactionCount": 42,
    "theme": {
      "primaryColor": "#004c8f",
      "cardBackground": ["#004c8f", "#002d56"],
      "logo": "hdfc"
    }
  },
  {
    "bank": "State Bank of India",
    "account": "XX1044",
    "accountType": "Salary Account",
    "cardType": "debit",
    "balance": 17441.95,
    "reportedAvailableBalance": 17441.95,
    "lastUpdated": 1729690000000,
    "isHidden": false,
    "totalCredits": 42000.00,
    "totalDebits": 24558.05,
    "transactionCount": 19,
    "theme": {
      "primaryColor": "#1a73e8",
      "cardBackground": ["#1a73e8", "#0d47a1"],
      "logo": "sbi"
    }
  },
  {
    "bank": "ICICI Bank",
    "account": "XX9012",
    "accountType": "Amazon Pay ICICI Card",
    "cardType": "cc",
    "balance": 14250.00,
    "creditLimit": 200000.00,
    "availableCredit": 185750.00,
    "lastUpdated": 1729655400000,
    "isHidden": false,
    "totalCredits": 0.00,
    "totalDebits": 14250.00,
    "transactionCount": 8,
    "theme": {
      "primaryColor": "#b71c1c",
      "cardBackground": ["#b71c1c", "#880e4f"],
      "logo": "icici"
    }
  }
]
```

---

### Screen 4: Split Bills & Shared Ledger (`SplitsScreen`)

#### User Experience & Purpose
Keeps track of shared group dinners, grocery runs, trips, and rent.
* **Smart Auto-Repayment**: When a friend repays via UPI or bank transfer (e.g. *"credited by Rs 600 by Rahul Verma"*), SpendWise automatically detects their name from your contacts/splits, alerts you, and can mark the debt as settled with one tap!
* Shows total **"You are owed"** (friends owe you) vs **"You owe"** (you owe friends).

#### Demo JSON Payload for Splits Screen
```json
{
  "summary": {
    "totalYouAreOwed": 2416.66,
    "totalYouOwe": 450.00,
    "netBalance": 1966.66
  },
  "contacts": [
    {
      "contactName": "Rahul Verma",
      "phoneNumber": "+91 98765 43210",
      "avatarColor": "#3b82f6",
      "totalOwed": 616.66,
      "unsettledTransactionsCount": 1,
      "splits": [
        {
          "expenseId": 105,
          "merchant": "Smoke House Deli",
          "date": 1729792200000,
          "totalBill": 1850.00,
          "splitAmount": 616.66,
          "isPaid": false,
          "owedByMe": false
        }
      ]
    },
    {
      "contactName": "Sneha Roy",
      "phoneNumber": "+91 98111 22334",
      "avatarColor": "#ec4899",
      "totalOwed": 1800.00,
      "unsettledTransactionsCount": 2,
      "splits": [
        {
          "expenseId": 98,
          "merchant": "Blinkit Groceries",
          "date": 1729512000000,
          "totalBill": 2400.00,
          "splitAmount": 1200.00,
          "isPaid": false,
          "owedByMe": false
        },
        {
          "expenseId": 92,
          "merchant": "PVR Cinemas (IMAX)",
          "date": 1729425600000,
          "totalBill": 1800.00,
          "splitAmount": 600.00,
          "isPaid": false,
          "owedByMe": false
        }
      ]
    },
    {
      "contactName": "Ankit Gupta",
      "phoneNumber": "+91 99887 76655",
      "avatarColor": "#10b981",
      "totalOwed": -450.00,
      "unsettledTransactionsCount": 1,
      "splits": [
        {
          "expenseId": 89,
          "merchant": "Starbucks Coffee",
          "date": 1729339200000,
          "totalBill": 900.00,
          "splitAmount": 450.00,
          "isPaid": false,
          "owedByMe": true
        }
      ]
    }
  ],
  "recentSettlements": [
    {
      "contactName": "Rahul Verma",
      "amount": 600.00,
      "settledAt": 1729603600000,
      "autoMatchedTransactionId": 107,
      "merchant": "Smoke House Deli"
    }
  ]
}
```

---

### Screen 5: Security & App Lock (`LockScreen` & `PinSetupModal`)

#### User Experience & Purpose
Provides bank-grade privacy:
1. **Personal 4-Digit PIN**: Salted & hashed using SHA-256 (`$spendwise$<salt>$<pin>$`).
2. **Biometrics & Phone Screen Lock**: Invokes `androidx.biometric.BiometricPrompt` supporting Fingerprint, Face ID, or system Pattern/PIN.
3. **Recent Apps Privacy**: `FLAG_SECURE` prevents OS task-switcher screenshots.
4. **Auto-Lock Timeout**: Configure auto-lock timeout (`Immediate`, `30s`, `1m`, `5m`).

#### State Model (`useSecurityStore`)
```typescript
export interface SecurityState {
  isLocked: boolean;
  isAppLockEnabled: boolean;
  hasPinSet: boolean;
  isBiometricEnabled: boolean;
  lockTimeout: number; // In milliseconds: 0, 30000, 60000, 300000
  deviceAuthStatus: {
    isAvailable: boolean;
    hasBiometrics: boolean;
    isDeviceSecure: boolean;
  };
}
```

#### Demo JSON State for Security
```json
{
  "isLocked": true,
  "isAppLockEnabled": true,
  "hasPinSet": true,
  "isBiometricEnabled": true,
  "lockTimeout": 30000,
  "deviceAuthStatus": {
    "isAvailable": true,
    "hasBiometrics": true,
    "isDeviceSecure": true
  },
  "timeoutOptions": [
    { "label": "Immediately", "value": 0 },
    { "label": "30 Seconds", "value": 30000 },
    { "label": "1 Minute", "value": 60000 },
    { "label": "5 Minutes", "value": 300000 }
  ]
}
```

---

### Screen 6: Settings, AI Learning & Preferences (`SettingsScreen`)

#### User Experience & Purpose
Central hub for app configurations:
* **Monthly Budget Limit**: Set overall monthly spending target.
* **On-Device Merchant Learning Map**: Shows learned category mappings (e.g. *Swiggy -> Food & Dining*). Users can edit or delete learned overrides.
* **Background Listener Statuses**: Shows whether SMS Reader and Notification Listener permissions are granted.
* **Data Backup & Restore**: Full JSON export and import of all SQLite expenses and settings.

#### Demo JSON Payload for Settings Screen
```json
{
  "preferences": {
    "monthlyBudgetLimit": 85000,
    "currency": "INR",
    "theme": "dark",
    "notificationsEnabled": true
  },
  "permissions": {
    "smsListenerActive": true,
    "notificationListenerActive": true
  },
  "learnedMerchantCategories": [
    {
      "merchant": "SWIGGY",
      "displayName": "Swiggy Online",
      "category": "Food & Dining",
      "userOverridden": true
    },
    {
      "merchant": "ZEPTO",
      "displayName": "Zepto 10-Min Groceries",
      "category": "Groceries",
      "userOverridden": true
    },
    {
      "merchant": "BLINKIT",
      "displayName": "Blinkit",
      "category": "Groceries",
      "userOverridden": true
    },
    {
      "merchant": "UBER",
      "displayName": "Uber Rides",
      "category": "Travel & Transport",
      "userOverridden": false
    },
    {
      "merchant": "AMAZON",
      "displayName": "Amazon Shopping",
      "category": "Shopping",
      "userOverridden": false
    }
  ]
}
```

---

## 5. Master Monolithic JSON Fixture (Ready to Mock)

Use this complete dataset to instantly populate and test mock screens, Figma designs, or frontend prototypes:

```json
{
  "user": {
    "name": "Harshit Sharma",
    "currency": "INR",
    "currencySymbol": "₹"
  },
  "dashboard": {
    "totalBalance": 45892.45,
    "monthlyIncome": 125000.00,
    "monthlyExpense": 79107.55,
    "monthlyBudgetLimit": 85000.00,
    "budgetUsedPercentage": 93.07
  },
  "accounts": [
    {
      "id": "acc_1",
      "bank": "HDFC",
      "account": "XX4892",
      "cardType": "debit",
      "balance": 28450.50,
      "gradient": ["#004c8f", "#002d56"]
    },
    {
      "id": "acc_2",
      "bank": "SBI",
      "account": "XX1044",
      "cardType": "debit",
      "balance": 17441.95,
      "gradient": ["#1a73e8", "#0d47a1"]
    },
    {
      "id": "acc_3",
      "bank": "ICICI",
      "account": "XX9012",
      "cardType": "cc",
      "balance": 14250.00,
      "gradient": ["#b71c1c", "#880e4f"]
    }
  ],
  "expenses": [
    {
      "id": 1,
      "amount": 450.00,
      "merchant": "Swiggy",
      "category": "Food & Dining",
      "timestamp": 1729828200000,
      "transactionType": "debit",
      "paymentMode": "upi",
      "bank": "HDFC",
      "account": "XX4892",
      "referenceId": "UPI/4298104812"
    },
    {
      "id": 2,
      "amount": 1850.00,
      "merchant": "Smoke House Deli",
      "category": "Food & Dining",
      "timestamp": 1729792200000,
      "transactionType": "debit",
      "paymentMode": "card",
      "bank": "HDFC",
      "account": "XX4892",
      "referenceId": "POS981241",
      "splits": [
        { "contactName": "Rahul Verma", "amount": 616.66, "isPaid": false },
        { "contactName": "Sneha Roy", "amount": 616.66, "isPaid": true }
      ]
    },
    {
      "id": 3,
      "amount": 125000.00,
      "merchant": "Infosys Ltd Salary",
      "category": "Salary & Income",
      "timestamp": 1729741800000,
      "transactionType": "credit",
      "paymentMode": "netbanking",
      "bank": "HDFC",
      "account": "XX4892",
      "referenceId": "CMS/SAL/OCT26"
    },
    {
      "id": 4,
      "amount": 1200.00,
      "merchant": "Airtel Broadband",
      "category": "Bills & Utilities",
      "timestamp": 1729690000000,
      "transactionType": "debit",
      "paymentMode": "upi",
      "bank": "SBI",
      "account": "XX1044",
      "referenceId": "UPI/4289011928"
    },
    {
      "id": 5,
      "amount": 2499.00,
      "merchant": "Amazon India",
      "category": "Shopping",
      "timestamp": 1729655400000,
      "transactionType": "debit",
      "paymentMode": "cc",
      "bank": "ICICI",
      "account": "XX9012",
      "referenceId": "TXN948120"
    },
    {
      "id": 6,
      "amount": 340.00,
      "merchant": "Uber India",
      "category": "Travel & Transport",
      "timestamp": 1729569000000,
      "transactionType": "debit",
      "paymentMode": "upi",
      "bank": "SBI",
      "account": "XX1044",
      "referenceId": "UPI/4289012381"
    },
    {
      "id": 7,
      "amount": 1540.00,
      "merchant": "Zepto Groceries",
      "category": "Groceries",
      "timestamp": 1729482600000,
      "transactionType": "debit",
      "paymentMode": "upi",
      "bank": "HDFC",
      "account": "XX4892",
      "referenceId": "UPI/4288109923"
    },
    {
      "id": 8,
      "amount": 600.00,
      "merchant": "Rahul Verma",
      "category": "Transfer",
      "timestamp": 1729396200000,
      "transactionType": "credit",
      "paymentMode": "upi",
      "bank": "HDFC",
      "account": "XX4892",
      "referenceId": "UPI/4287102941"
    }
  ],
  "splitsSummary": {
    "youAreOwed": 2416.66,
    "youOwe": 450.00,
    "netBalance": 1966.66
  },
  "security": {
    "isAppLockEnabled": true,
    "hasPinSet": true,
    "isBiometricEnabled": true,
    "lockTimeout": 30000
  }
}
```

---

## 6. Native Bridge Modules Specification

The new UI can call or listen to the following native Android bridge methods:

### 6.1 `SecurityModule`
| Method | Arguments | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `isDeviceAuthAvailable()` | None | `Promise<{ isAvailable: boolean, hasBiometrics: boolean, isDeviceSecure: boolean }>` | Queries hardware biometric & system screen lock status. |
| `authenticate()` | `title: string, subtitle: string` | `Promise<boolean>` | Launches Android BiometricPrompt dialog. |
| `cancelAuthentication()` | None | `Promise<boolean>` | Cancels any in-flight BiometricPrompt cleanly. |
| `setSecureFlag()` | `enable: boolean` | `Promise<boolean>` | Enables or disables `FLAG_SECURE` on the host window. |

### 6.2 `MessageModule`
| Method | Arguments | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `requestSmsPermissions()` | None | `Promise<boolean>` | Prompts user for Android runtime `READ_SMS` and `RECEIVE_SMS` permissions. |
| `isNotificationListenerActive()` | None | `Promise<boolean>` | Checks if Android Notification Listener service is enabled in system settings. |
| `openNotificationListenerSettings()` | None | `Promise<void>` | Deep links the user directly into Android System Notification Access settings. |
| `fetchRecentMessages()` | `limit: number` | `Promise<RawMessage[]>` | Pulls historical SMS directly from device SMS inbox for initial onboarding. |

---

## 7. Recommended Design Guidelines for New UI

1. **Dark Mode First**: The application uses a rich, premium dark theme (`#0a101d` background, `#121a2c` card surfaces, `#1e293b` borders).
2. **Micro-Animations**:
   - Card carousel smooth scroll with spring dynamics.
   - Animated dot PIN keypad on the lock screen with haptic feedback.
   - Smooth slide-up bottom sheets for Transaction Details, Filters, and PIN setup.
3. **Typography**: Use high-readability sans-serif (e.g. Inter / Outfit / System Roboto) with distinct font weight hierarchy (`800` for balances, `600` for titles, `400` for timestamps).
4. **Data Density**: Balance rich information with clean whitespace. Use chips, status pills, and iconography for quick scannability.
