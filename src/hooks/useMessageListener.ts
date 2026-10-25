import { useEffect, useRef } from 'react';
import { NativeEventEmitter, NativeModules, AppState } from 'react-native';
import { IncomingMessage } from '../services/messaging/messageService';
import { ingestLiveMessage } from '../services/transactions/transactionApplication';
import { useExpenseStore } from './useExpenses';

const { MessageModule } = NativeModules;
const messageEmitter = new NativeEventEmitter(MessageModule);

export function useMessageListener() {
  const addExpense = useExpenseStore(state => state.addExpense);
  const queuePendingExpense = useExpenseStore(
    state => state.queuePendingExpense,
  );
  const listenerRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;

    const processMessage = async (message: IncomingMessage) => {
      if (!isMounted) return;
      try {
        const orchestrated = await ingestLiveMessage(message);
        if (!isMounted) return;
        const { candidate, decision } = orchestrated;
        console.log(`Message from ${message.sender} decision: ${decision.kind} (${decision.reason})`);

        const displayMerchant = candidate?.merchant && candidate.merchant !== 'Unknown'
          ? candidate.merchant
          : 'Unknown';
        const notifyBackground = (title: string, body: string) => {
          if (AppState.currentState === 'background' || AppState.currentState === 'inactive') {
            MessageModule.showExpenseNotification(title, body);
          }
        };

        switch (decision.kind) {
          case 'auto_save': {
            if (!candidate) return;
            const saved = orchestrated.persistence;
            if (!saved) return;
            if (saved.status === 'saved') {
              notifyBackground('Transaction Auto-Saved', `₹${candidate.amount} at ${displayMerchant} recorded.`);
              console.log(`Auto-saved expense to DB with ID: ${saved.transaction.id}`);
              addExpense(saved.transaction, saved.repaymentUpdates);
            } else if (saved.status === 'duplicate') {
              console.log('Expense was not saved because it matched an existing transaction.');
            } else {
              console.error('Transaction decision was auto-save, but persistence failed:', saved.message);
            }
            break;
          }
          case 'review': {
            if (!candidate) return;
            notifyBackground('New Pending Transaction', `₹${candidate.amount} at ${displayMerchant}. Tap to approve.`);
            queuePendingExpense(candidate);
            break;
          }
          case 'reject':
            console.log(`Rejected transaction: ${decision.reason}`);
            break;
        }
      } catch (error) {
        console.error(`Failed to process message from ${message.sender}:`, error);
      }
    };

    // Async parser enrichment must not reorder incoming repayment credits.
    let processingQueue = Promise.resolve();
    const enqueueMessage = (message: IncomingMessage) => {
      processingQueue = processingQueue.then(() => processMessage(message));
    };
    let releasePendingQueue: () => void = () => {};
    const pendingQueueReady = new Promise<void>(resolve => {
      releasePendingQueue = resolve;
    });

    // 1. Fetch any pending messages queued while the app was closed
    const fetchPending = async () => {
      try {
        const pendingStr = await MessageModule.getPendingMessages();
        if (!isMounted) return;
        const pending = JSON.parse(pendingStr) as IncomingMessage[];
        if (pending.length > 0) {
          console.log(
            `Processing ${pending.length} pending offline messages...`,
          );
          pending
            .sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0))
            .forEach(enqueueMessage);
        }
      } catch (e) {
        if (isMounted) {
          console.error('Failed to fetch pending messages:', e);
        }
      } finally {
        releasePendingQueue();
      }
    };
    fetchPending();

    // 2. Listen for live messages
    listenerRef.current = messageEmitter.addListener(
      'onMessageReceived',
      (event: {
        body: string;
        sender: string;
        source: 'sms' | 'notification';
      }) => {
        const message: IncomingMessage = {
          body: event.body,
          sender: event.sender,
          source: event.source,
        };
        console.log(
          `Live message received from ${message.sender} via ${message.source}`,
        );
        pendingQueueReady.then(() => enqueueMessage(message)).catch(error => {
          console.error('Failed to enqueue live message:', error);
        });
      },
    );

    return () => {
      isMounted = false;
      listenerRef.current?.remove();
    };
  }, [addExpense, queuePendingExpense]);
}
