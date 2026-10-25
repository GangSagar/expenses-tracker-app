# App startup and message listener flow

This document follows app startup through live ingestion, review, and historical import. The existing UI/store remain temporary adapters to shared Phase 3 application operations.

## 1. App startup and listener setup

`AppContent` calls `useMessageListener()` before returning the security-gated navigation tree. The hook starts fetching native pending messages and registers the live message listener in the same effect. The security gate controls displayed children; it does not disable message ingestion.

The effect cleanup marks the listener unmounted and removes the native event subscription. An in-progress async parse checks the mounted flag before making UI/store changes.

## 2. Pending and live message ordering

Live messages wait for the pending-message request to resolve. Pending messages with timestamps are ordered oldest-first and enqueued first; live messages arriving during startup are buffered behind them. Both sources then use the same sequential promise queue. This prevents asynchronous parser enrichment from letting a later repayment credit run ahead of an earlier one.

```mermaid
flowchart TD
    Setup["Effect setup"] --> Fetch["Fetch native pending messages"]
    Setup --> Listen["Register live event listener"]
    Fetch --> Sort["Sort pending by timestamp"]
    Sort --> Queue["Sequential message queue"]
    Listen --> Map["Map event to IncomingMessage"]
    Map --> Queue
    Queue --> Analyze["ingestLiveMessage use case"]
    Analyze --> Mounted{"Still mounted?"}
    Mounted -- No --> Stop["Stop before side effects"]
    Mounted -- Yes --> Execute["Render typed outcome"]
```

## 3. Analysis and the single decision policy

`ingestLiveMessage()` calls `orchestrateTransaction()`, which awaits `processIncomingMessage()`. The latter normalizes text, collects sender/body/spam rejection signals, and invokes `parseStructuredAsync()`. It returns an analysis object even when input is rejected or parsing fails, so those cases can receive typed reasons instead of disappearing as `null`.

`processTransaction()` in `transactionDecisionService.ts` maps the full `StructuredExpense`, classifier category evidence, and the established compatibility confidence score into `TransactionDecisionInput`. It invokes `decideTransaction()` exactly once. The policy returns `reject`, `review`, or `auto_save` with stable reason codes and an evidence summary. It does not persist or update Zustand.

```mermaid
flowchart TD
    Input["IncomingMessage"] --> Normalize["Normalize body and sender"]
    Normalize --> Gates["Collect sender, body, spam signals"]
    Gates --> Parse["parseStructuredAsync"]
    Parse --> Analysis["IncomingTransactionAnalysis"]
    Analysis --> Map["Map candidate + parser/classifier evidence"]
    Map --> Policy["decideTransaction"]
    Policy --> Result{"Decision"}
    Result -->|reject + reason| Reject["Return typed rejection"]
    Result -->|review + reason| Review["Queue candidate"]
    Result -->|auto_save + reason| Save["Persist candidate"]
```

The compatibility thresholds are retained: legacy confidence below `0.5` rejects; `0.5` to below `0.8` reviews; `0.8` and above can auto-save. Parser confidence below `0.5` rejects, and `requiresConfirmation` forces review. Parser confidence, its component breakdown, classifier evidence, parser version, and policy version reach the decision result.

## 4. Applying decisions and persistence outcomes

| Policy decision | Listener action | Persistence behavior |
|---|---|---|
| `reject` | Log the stable reason and stop. | No write. |
| `review` | Queue the candidate and optionally notify in background. | No write before user confirmation. |
| `auto_save` | The live-ingestion application operation checks the shared dedup policy and persists. | Definite duplicate, possible duplicate for review, saved, and failed are distinct outcomes. The store updates only after a successful save. |

For accepted credits, the shared application persistence operation reads all split-bearing ledger rows through `TransactionRepository`, creates the oldest-first partial allocation plan, and commits the repayment credit and all affected split updates in one SQLite transaction via `SQLiteTransactionRepository`. The credit stores exact destination expense/split IDs and allocated amounts so later edits, invalidation, restoration, or deletion can reverse the same allocations atomically. Manual settlement is tracked separately and is not erased by repayment reversal. A transaction failure rolls back the credit and split changes; the listener logs the persistence failure separately from the prior auto-save decision. Manual and review-confirmed credits use the same operation. Hooks and screens dispatch split commands through the transaction application facade; Zustand no longer calculates settlement changes.

Older repayment credits have only contact/amount summaries and cannot be safely reversed. Their edit, invalidation, and deletion is blocked with a reconciliation message. Backup restore preserves allocation metadata and remaps transaction IDs without running repayment planning again.

## 5. Import preview

Settings historical import uses the same parser, transaction decision policy, and dedup policy during preview, through `previewHistoricalMessage()`. The screen owns message scanning, preview selection, and progress display. Definite duplicates are skipped; possible matches appear unchecked for review. `importHistoricalTransactions()` rechecks selected candidates against persisted rows and earlier successful imports, sorts by source timestamp (stable on ties), and imports each through the shared persistence operation. Repayment planning is refreshed per row, so earlier imported credits affect later ones. Each row commits independently; failed rows remain available for retry.

After a successful live, manual, confirmed, imported, or edited transaction write, the application service requests one local notification with the transaction type, amount, and merchant/description. Duplicate, pending, or failed outcomes do not produce a saved notice. Notification failures do not alter persistence results.

## 6. Correction learning and AI fallback status

When a user explicitly changes a transaction's merchant or category, the application operation calls `LearningEngine.learn()` only after persistence succeeds. The learning repository persists to the merchant-category table that parser resolvers consult.

`parseAsync()` is active in live ingestion and import preview, but its extraction stages still execute synchronously. `AIResolver` has no configured inference handler and AI is disabled by default. Local offline AI fallback remains incomplete; the interface/cache alone are not an active model.

## Source files

- [App.tsx](../App.tsx)
- [useMessageListener.ts](../src/hooks/useMessageListener.ts)
- [messageService.ts](../src/services/messaging/messageService.ts)
- [transactionOrchestrator.ts](../src/services/transactions/transactionOrchestrator.ts)
- [expenseService.ts](../src/services/transactions/expenseService.ts)
- [decisionPolicy.ts](../src/core/transactions/decisionPolicy.ts)
- [expenseRepo.ts](../src/database/expenseRepo.ts)
- [applicationUseCases.ts](../src/core/transactions/applicationUseCases.ts)
- [transactionApplication.ts](../src/services/transactions/transactionApplication.ts)
