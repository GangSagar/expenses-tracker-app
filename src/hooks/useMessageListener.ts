import { useEffect, useRef } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';
import { IncomingMessage } from '../services/messaging/messageService';
import { handleIncomingMessage } from '../services/messaging/incomingMessageHandler';
import { useExpenseStore } from './useExpenses';

const { MessageModule } = NativeModules;
const messageEmitter = new NativeEventEmitter(MessageModule);

const SMS_NOTIFICATION_PACKAGES = new Set([
  'com.google.android.apps.messaging',
  'com.samsung.android.messaging',
  'com.android.mms',
]);

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
        const result = await handleIncomingMessage(message);
        if (!isMounted) return;

        switch (result.kind) {
          case 'saved':
            addExpense(result.transaction, result.repaymentUpdates);
            break;
          case 'duplicate':
            addExpense(result.transaction, []);
            break;
          case 'review':
            queuePendingExpense(result.candidate);
            break;
          case 'reject':
            console.log(`Rejected transaction: ${result.reason}`);
            break;
        }
      } catch (error) {
        console.error(`Failed to process message from ${message.sender}:`, error);
      }
    };

    // Async parser enrichment must not reorder incoming repayment credits.
    let processingQueue = Promise.resolve();
    const recentSmsBodies = new Map<string, number>();
    const recentEventSignatures = new Map<string, number>();

    const enqueueMessage = (message: IncomingMessage) => {
      const bodyClean = message.body.trim();
      const now = Date.now();

      // Suppress duplicate OS echo from default SMS apps if the native SMS was already received
      if (
        message.source === 'notification' &&
        SMS_NOTIFICATION_PACKAGES.has(message.sender)
      ) {
        const lastSmsTime = recentSmsBodies.get(bodyClean);
        if (lastSmsTime && now - lastSmsTime < 5000) {
          console.log(`Suppressed SMS notification echo from ${message.sender}`);
          return;
        }
      }

      if (message.source === 'sms') {
        recentSmsBodies.set(bodyClean, now);
      }

      // Suppress exact duplicate broadcast pulses within 400ms (e.g. multi-receiver echoes)
      const eventSig = `${message.source}::${message.sender}::${bodyClean}`;
      const lastSeen = recentEventSignatures.get(eventSig);
      if (lastSeen && now - lastSeen < 400) {
        return;
      }
      recentEventSignatures.set(eventSig, now);

      // Clean old entries
      if (recentEventSignatures.size > 50) {
        for (const [k, v] of recentEventSignatures.entries()) {
          if (now - v > 10000) recentEventSignatures.delete(k);
        }
      }
      if (recentSmsBodies.size > 50) {
        for (const [k, v] of recentSmsBodies.entries()) {
          if (now - v > 10000) recentSmsBodies.delete(k);
        }
      }

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
        location?: IncomingMessage['location'];
      }) => {
        const message: IncomingMessage = {
          body: event.body,
          sender: event.sender,
          source: event.source,
          location: event.location,
        };
        console.log(
          `Live message received from ${message.sender} via ${message.source}`,
        );
        pendingQueueReady.then(() => enqueueMessage(message)).catch(error => {
          console.error('Failed to enqueue live message:', error);
        });
      },
    );

    // 3. Listen for transactions confirmed and saved directly from review notifications
    const notificationSaveListener = messageEmitter.addListener(
      'onTransactionSavedFromNotification',
      (event: { transactionJson: string }) => {
        try {
          const tx = JSON.parse(event.transactionJson);
          addExpense(tx);
        } catch (e) {
          console.error('Failed to parse saved transaction from notification:', e);
        }
      },
    );

    return () => {
      isMounted = false;
      listenerRef.current?.remove();
      notificationSaveListener.remove();
    };
  }, [addExpense, queuePendingExpense]);
}
