# Expense Tracker Architecture

This document provides a comprehensive overview of the application's structure, native and JS layer boundaries, filtering engine, storage layers, and visual dashboards.

## High-Level Data Flow

```mermaid
flowchart TD
    subgraph Device["Android Device"]
        SMS["SMS Message"]
        Notif["App Notification"]
    end

    subgraph Native["Native Layer (Kotlin)"]
        SmsReceiver["SmsReceiver\n(BroadcastReceiver)"]
        NotifListener["NotificationListener\n(NotificationListenerService)"]
        Bridge["TurboModules Bridge"]
    end

    subgraph RNCore["Processing Engine (React Native / JS)"]
        Filter["Filter\n(Requires Debit/Credit Signals)"]
        Parser["Message Parser\n(Amount, Merchant, Type, Balance)"]
        Dedup["Duplicate Detection\n(5-min window)"]
        Classifier["Classifier\n(Rules & Merchant Map)"]
        ConfidenceScorer["Confidence Scorer"]
    end

    subgraph Storage["Storage & UI"]
        DB[(SQLite DB\nreact-native-quick-sqlite)]
        Popup["Floating Overlay Popup\n(For Confirmation)"]
        UI["React Native App UI\n(Zustand + Navigation)"]
    end

    SMS --> SmsReceiver
    Notif --> NotifListener
    SmsReceiver --> Bridge
    NotifListener --> Bridge

    Bridge --> Filter
    Filter -- "Valid Transaction" --> Parser
    Filter -- "Ignore (OTP, Promo, Data Spams)" --> Discard(["Discard"])
    Parser --> Dedup
    Dedup -- "Unique" --> Classifier
    Dedup -- "Duplicate" --> Discard
    Classifier --> ConfidenceScorer

    ConfidenceScorer -- "Confidence >= 0.8" --> DB
    ConfidenceScorer -- "Confidence 0.5 - 0.8" --> Popup
    ConfidenceScorer -- "Confidence < 0.5" --> Discard
    
    Popup -- "User Confirms" --> DB
    DB <--> UI
```

---

## Core System Subsystems

### 1. Advanced Message Filtration
To prevent spam, messages must pass a strict two-stage filter:
* **Source Validation:** Verify the sender ID matches bank formatting rules or contains known keywords.
* **Signal Validation:** The message must explicitly match a debit keyword (`DEBIT_REGEX`) or a credit keyword (`CREDIT_REGEX`). General carrier reports, promotional items, OTPs, and cellular data usage alerts are discarded.

### 2. Live Accounts & Reconciliation Engine
The Accounts module (`AccountsScreen.tsx`) dynamically reconciles financial statements:
* **Account Grouping:** Groups expenses using a safe unique delimiter (`::`), preventing partition errors.
* **Real-time Balance Adjustment:** Calculates true current balances in real-time by taking the latest parsed balance checkpoint and applying transaction deltas posted after it:
  $$\text{Real-time Balance} = \text{Checkpoint Balance} + \sum \text{Credits} - \sum \text{Debits}$$
* **Anomaly Detection:** Flags reconciliation gaps where actual balances deviate from expected chronological sums, letting users manually record recovery transactions.

### 3. Premium Bank Cards UI Engine
The bank cards display uses a high-performance visual carousel layout:
* **Dynamic Card Styling**: Instantly renders custom debit cards using a deterministic color index generated via a string character hash of the `${bankName}::${accountNumber}` fields. Every debit card gets a distinct premium solid color.
* **Branded Theme Mappings**: Traditional top-tier banks (ICICI, HDFC, SBI, BOB, BOI) utilize specific preset branding color combinations.
* **Scroll Offset Alignment**: Tabbing switches register direct ref-driven viewport resets, executing `scrollToOffset({ offset: 0, animated: false })` on the underlying `FlatList` to prevent horizontal offset clipping.

### 4. Smart Split Repayment Engine
The store hooks into all manual and parsed transaction insertions to automatically balance contacts' debts:
* **Repayment Detection**: Intercepts credit transactions (`transactionType === 'credit'`).
* **Word-Boundary Match**: Matches the sender with outstanding split contacts using regex word boundaries `\b${contactName}\b` to prevent false positive substring matches.
* **Outstanding Settlement**: Auto-deducts and marks corresponding pending splits as paid/settled (`isPaid = true`) in the database chronologically (oldest first).
* **Ledger Tracing**: Adds a matching settled split to the credit transaction itself, allowing correct tracking of incoming repayment histories.

### 5. Double-Direction Settle & Unsettle Controls
The Split Ledger offers granular controls with native `Alert` confirmation safety wraps:
* **Individual Bill Toggles**: Enables `<TouchableOpacity>` wrapper bindings. Users can toggle single active items to paid, or settled history items back to unpaid.
* **Bulk Undo**: Renders an "Unsettle All Balances" trigger when a contact has settled history items, fully reverting bulk settlements and resetting outstanding totals in one tap.

---

## Tech Stack
* **Mobile App:** React Native (New Architecture)
* **Native Android:** Kotlin
* **Database:** SQLite via `react-native-quick-sqlite`
* **State Management:** Zustand
* **Navigation:** React Navigation 7 (Bottom Tabs + Material Top Tabs)

## Key Project Directories
* `src/core/parser/`: SMS/notification message parsing and filtering rules.
* `src/core/classifier/`: Category assignment based on rules and merchant mappings.
* `src/core/confidence/`: Confidence scoring logic to route transactions.
* `src/core/dedup/`: Duplicate transaction detection to prevent double-counting.
* `src/database/`: SQLite database setup and repository pattern for expense tracking.
* `src/hooks/`: Zustand store hooks (`useExpenses.ts`), including the auto-repayment matching and single split toggling logic.
* `android/app/src/main/java/com/expensetracker/`: Native Android Kotlin code (receivers, listeners, bridges).
