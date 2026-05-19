import { useEffect, useRef } from 'react';
import { NativeEventEmitter, NativeModules, AppState } from 'react-native';
import { IncomingMessage } from '../services/messageService';
import { saveExpense } from '../services/expenseService';
import { orchestrateTransaction } from '../services/transactionOrchestrator';
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

    const processMessage = (message: IncomingMessage) => {
      const orchestrated = orchestrateTransaction(message);
      if (!orchestrated) {
        console.log(`Message from ${message.sender} dropped by orchestrator`);
        return;
      }

      const { expense, decision } = orchestrated.processedExpense;
      console.log(
        `Message from ${message.sender} parsed! Decision: ${decision}`,
      );

      switch (decision) {
        case 'auto_save': {
          const displayMerchant =
            expense.merchant && expense.merchant !== 'Unknown'
              ? expense.merchant
              : 'Unknown';
          if (
            AppState.currentState === 'background' ||
            AppState.currentState === 'inactive'
          ) {
            MessageModule.showExpenseNotification(
              'Transaction Auto-Saved',
              `₹${expense.amount} at ${displayMerchant} recorded.`,
            );
          }
          const id = saveExpense(expense);
          if (id !== null) {
            console.log(`Auto-saved expense to DB with ID: ${id}`);
            addExpense({ ...expense, id } as any);
          } else {
            console.log(
              'Expense was not saved (possibly duplicate or failed insert).',
            );
          }
          break;
        }
        case 'show_popup': {
          const displayMerchant =
            expense.merchant && expense.merchant !== 'Unknown'
              ? expense.merchant
              : 'Unknown';
          if (
            AppState.currentState === 'background' ||
            AppState.currentState === 'inactive'
          ) {
            MessageModule.showExpenseNotification(
              'New Pending Transaction',
              `₹${expense.amount} at ${displayMerchant}. Tap to approve.`,
            );
          }
          queuePendingExpense(expense);
          break;
        }
        case 'discard':
          console.log('Discarding low confidence expense.');
          break;
      }
    };

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
          pending.forEach(msg => processMessage(msg));
        }
      } catch (e) {
        if (isMounted) {
          console.error('Failed to fetch pending messages:', e);
        }
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
        processMessage(message);
      },
    );

    return () => {
      isMounted = false;
      listenerRef.current?.remove();
    };
  }, [addExpense, queuePendingExpense]);
}
