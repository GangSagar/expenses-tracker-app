import { useEffect, useRef } from 'react';
import { NativeEventEmitter, NativeModules, AppState } from 'react-native';
import {
  processIncomingMessage,
  IncomingMessage,
} from '../services/messageService';
import { processTransaction, saveExpense } from '../services/expenseService';
import { useExpenseStore } from './useExpenses';
import { Expense } from '../types/expense';

const { MessageModule } = NativeModules;
const messageEmitter = new NativeEventEmitter(MessageModule);

export function useMessageListener() {
  const addExpense = useExpenseStore(state => state.addExpense);
  const queuePendingExpense = useExpenseStore(state => state.queuePendingExpense);
  const listenerRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;

    const processMessage = (message: IncomingMessage) => {
      const parsed = processIncomingMessage(message);
      if (!parsed) {
        console.log(`Message from ${message.sender} dropped (not a valid transaction)`);
        return;
      }

      const result = processTransaction(parsed);
      if (!result) {
        console.log(`Message from ${message.sender} dropped (could not extract amount)`);
        return;
      }

      const { expense, decision } = result;
      console.log(`Message from ${message.sender} parsed! Decision: ${decision}`);

      switch (decision) {
        case 'auto_save': {
          const id = saveExpense(expense);
          if (id !== null) {
            addExpense({ ...expense, id } as Expense);
          } else {
            console.log('Skipped duplicate expense.');
          }
          break;
        }
        case 'show_popup':
          if (
            AppState.currentState === 'background' ||
            AppState.currentState === 'inactive'
          ) {
            MessageModule.showExpenseNotification(
              'Uncategorized Expense',
              `₹${expense.amount} at ${expense.merchant !== 'Unknown' ? expense.merchant : 'Unknown'}. Tap to categorize.`,
            );
          }
          queuePendingExpense(expense);
          break;
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
          console.log(`Processing ${pending.length} pending offline messages...`);
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
        console.log(`Live message received from ${message.sender} via ${message.source}`);
        processMessage(message);
      },
    );

    return () => {
      isMounted = false;
      listenerRef.current?.remove();
    };
  }, [addExpense, queuePendingExpense]);
}
