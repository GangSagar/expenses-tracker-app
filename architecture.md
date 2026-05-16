# Expense Tracker Architecture

When starting a new conversation, you can provide the following architecture overview to give me context about the project's structure and data flow.

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
        Filter["Filter\n(Banks / Transactional)"]
        Parser["Message Parser\n(Amount, Merchant, Type)"]
        Dedup["Duplicate Detection\n(5-min window)"]
        Classifier["Classifier\n(Rules & Merchant Map)"]
        ConfidenceScorer["Confidence Scorer"]
    end

    subgraph Storage["Storage & UI"]
        DB[(SQLite DB\nreact-native-quick-sqlite)]
        Popup["Floating Overlay Popup\n(For Confirmation)"]
        UI["React Native App UI\n(Zustand + React Navigation)"]
    end

    SMS --> SmsReceiver
    Notif --> NotifListener
    SmsReceiver --> Bridge
    NotifListener --> Bridge

    Bridge --> Filter
    Filter -- "Valid Transaction" --> Parser
    Filter -- "Ignore (OTP, Promo)" --> Discard(["Discard"])
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

## Tech Stack
* **Mobile App:** React Native (New Architecture)
* **Native Android:** Kotlin
* **Database:** SQLite via `react-native-quick-sqlite`
* **State Management:** Zustand
* **Navigation:** React Navigation 7 (Bottom Tabs)

## Key Project Directories

* `src/core/parser/`: SMS/notification message parsing and filtering rules.
* `src/core/classifier/`: Category assignment based on rules and merchant mappings.
* `src/core/confidence/`: Confidence scoring logic to route transactions.
* `src/core/dedup/`: Duplicate transaction detection to prevent double-counting.
* `src/database/`: SQLite database setup and repository pattern for expense tracking.
* `android/app/src/main/java/com/expensetracker/`: Native Android Kotlin code (receivers, listeners, bridges).
