# App startup and message listener flow

This is the first low-level flow slice: it starts at `App.tsx`, follows the
component tree to `useMessageListener()`, and expands the hook's message
handling branches. The diagrams describe the current implementation.

## 1. App startup and hook setup

```mermaid
flowchart TD
    Entry["React renders App()"] --> SafeArea["SafeAreaProvider"]
    SafeArea --> Status["Render StatusBar<br/>light-content, blue background"]
    Status --> Content["Render AppContent()"]
    Content --> Hook["Call useMessageListener()"]
    Hook --> ReturnTree["Return SecurityGate"]
    ReturnTree --> Children["SecurityGate children:<br/>AppNavigator + CategoryPopup"]

    Hook -. "after render commits" .-> Effect["useEffect setup"]
    Effect --> Mounted["Set isMounted = true"]
    Mounted --> Define["Define processMessage(message)"]
    Define --> FetchCall["Call fetchPending()"]
    FetchCall --> AwaitPending["Await MessageModule.getPendingMessages()"]
    FetchCall --> Register["Register onMessageReceived listener"]
    AwaitPending -. "in parallel with listener" .-> Register
```

`useMessageListener()` runs inside `AppContent`, before the returned JSX is wrapped by `SecurityGate`. The gate controls what its children display; it does not conditionally call this hook. The listener therefore starts independently of whether the security gate later shows its lock screen.

The effect has two store selectors in its dependency list: 
`addExpense` and `queuePendingExpense`. If either dependency changes, React runs the cleanup for the prior effect and then sets up the effect again.

## 2. Pending messages and live messages

Both sources are converted to `IncomingMessage` and sent through the same
`processMessage` function.

```mermaid
flowchart TD
    Setup["Effect setup"] --> PendingStart["Start fetchPending()"]
    Setup --> LiveReg["Register event: onMessageReceived"]
    LiveReg --> CleanupReady["Return effect cleanup"]
    CleanupReady --> Active["Wait for messages"]
    Active --> Cleanup["Unmount or effect dependencies change"]
    Cleanup --> MarkUnmounted["Set isMounted = false"]
    MarkUnmounted --> RemoveListener["Remove listener subscription"]

    subgraph Pending["Messages queued while app was closed"]
        PendingStart --> GetPending["Await MessageModule.getPendingMessages()"]
        GetPending --> MountedCheck{"isMounted?"}
        MountedCheck -- "No" --> IgnoreResult["Ignore result; stop this fetch"]
        MountedCheck -- "Yes" --> ParsePending["JSON.parse result as IncomingMessage[]"]
        ParsePending --> HasPending{"pending.length > 0?"}
        HasPending -- "No" --> NoQueued["Nothing to process"]
        HasPending -- "Yes" --> ForEach["Process each pending message"]
        ForEach --> Process["processMessage(message)"]
        GetPending -. "rejection, or JSON parsing throws" .-> Catch["Catch error"]
        ParsePending -. "throws" .-> Catch
        Catch --> StillMounted{"isMounted?"}
        StillMounted -- "Yes" --> LogFetchError["Log Failed to fetch pending messages"]
        StillMounted -- "No" --> IgnoreError["Do not log after unmount"]
    end

    subgraph Live["Message arrives while listener is active"]
        Active --> Event["Receive event payload:<br/>body, sender, source"]
        Event --> MapEvent["Build IncomingMessage<br/>from body, sender, source"]
        MapEvent --> LogLive["Log sender and source"]
        LogLive --> Process
    end
```

`fetchPending()` is called without awaiting it. Its native request pauses at `await`, allowing the live event listener to be registered while the pending request is still in progress. Pending messages are processed only if the effect is still mounted when that request resolves.

When the component unmounts or the effect is replaced, cleanup sets `isMounted = false` and removes the event subscription. It does not cancel an already-started native pending-message request; the mounted check prevents that request from processing results after cleanup.

## 3. `processMessage`: orchestrator and decision branches

```mermaid
flowchart TD
    Start["processMessage(message)"] --> Orchestrate["orchestrateTransaction(message)"]
    Orchestrate --> HasResult{"Did orchestrator return a result?"}
    HasResult -- "No (null)" --> DropLog["Log message dropped by orchestrator"]
    DropLog --> StopDrop["Stop processing this message"]
    HasResult -- "Yes" --> Extract["Read expense and decision"]
    Extract --> LogParsed["Log parsed message and decision"]
    LogParsed --> Merchant{"Merchant exists<br/>and is not Unknown?"}
    Merchant -- "Yes" --> KeepMerchant["displayMerchant = expense.merchant"]
    Merchant -- "No" --> UnknownMerchant["displayMerchant = Unknown"]
    KeepMerchant --> Decision{"Which decision?"}
    UnknownMerchant --> Decision

    Decision -- "auto_save" --> AutoNotify["Maybe notify:<br/>Transaction Auto-Saved"]
    AutoNotify --> Save["saveExpense(expense)"]
    Save --> HasId{"Returned id is not null?"}
    HasId -- "Yes" --> Store["addExpense({...expense, id})"]
    HasId -- "No" --> SaveFailed["Log not saved yet<br/>(duplicate or failed insert)"]
    Store --> Done["Finish this message"]
    SaveFailed --> Done

    Decision -- "show_popup" --> PopupNotify["Maybe notify:<br/>New Pending Transaction"]
    PopupNotify --> Queue["queuePendingExpense(expense)"]
    Queue --> Done

    Decision -- "discard" --> DiscardLog["Log low-confidence expense discarded"]
    DiscardLog --> Done
```

### Notification branch shared by `auto_save` and `show_popup`

Before either action, `notifyBackground(title, body)` checks
`AppState.currentState`:

```mermaid
flowchart LR
    Notify["notifyBackground(title, body)"] --> State{"AppState is background<br/>or inactive?"}
    State -- "Yes" --> Show["MessageModule.showExpenseNotification(title, body)"]
    State -- "No (for example, active)" --> Skip["Do not show a notification"]
```

The notification text includes the amount and `displayMerchant`. The `auto_save` title is **Transaction Auto-Saved**; the `show_popup` title is **New Pending Transaction** and asks the user to tap to approve.

## 4. What the decision labels mean

The hook receives these labels from `processTransaction()` via
`orchestrateTransaction()`:

| Decision       | Confidence rule                    | Hook action                                           |
| -------------- | ---------------------------------- | ----------------------------------------------------- |
| `discard`    | Below `0.5`                      | Log and stop; no notification, save, or pending queue |
| `show_popup` | At least `0.5` and below `0.8` | Maybe notify in background, then queue for approval   |
| `auto_save`  | At least `0.8`                   | Maybe notify in background, then call `saveExpense` |

An orchestrator result can also be `null`; in that case the hook logs that the message was dropped and does not run a decision branch. The orchestrator returns `null` when message processing rejects the input or transaction processing cannot produce an expense (including a missing amount).

For `auto_save`, `saveExpense()` can return `null` for a duplicate or failed insert. Only a non-null ID is added to the Zustand expense store by this hook. The failed-insert path may queue a database retry inside `saveExpense()`, but this hook logs the null result and does not add it to the store at that point.

## Source files

- [App.tsx](../App.tsx)
- [useMessageListener.ts](../src/hooks/useMessageListener.ts)
- [transactionOrchestrator.ts](../src/services/transactionOrchestrator.ts)
- [messageService.ts](../src/services/messageService.ts)
- [expenseService.ts](../src/services/expenseService.ts)
