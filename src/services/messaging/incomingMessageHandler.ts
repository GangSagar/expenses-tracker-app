import { IncomingMessage } from './messageService';
import { ingestLiveMessage } from '../transactions/transactionApplication';
import { notifyTransactionReview } from '../notifications/transactionReviewNotification';
import { evaluateTransactionAlerts } from '../notifications/alertNotificationService';
import { settingsService, transactionStorage } from '../../app/composition';
import { Expense } from '../../types/expense';
import { TransactionCandidate } from '../../core/transactions/contracts';
import { SplitSettlementUpdate } from '../../core/transactions/repaymentPlanner';

export type IncomingMessageResult =
  | { kind: 'saved'; transaction: Expense; repaymentUpdates: SplitSettlementUpdate[] }
  | { kind: 'duplicate'; transaction: Expense }
  | { kind: 'review'; candidate: TransactionCandidate }
  | { kind: 'reject'; reason: string };

/**
 * Shared message ingestion coordinator. Handles live messages received either
 * in the active UI session or during Headless JS background execution.
 */
export async function handleIncomingMessage(
  message: IncomingMessage,
): Promise<IncomingMessageResult> {
  const orchestrated = await ingestLiveMessage(message);
  const { candidate, decision } = orchestrated;

  switch (decision.kind) {
    case 'auto_save': {
      if (!candidate) return { kind: 'reject', reason: 'empty_candidate' };
      const saved = orchestrated.persistence;
      if (!saved) return { kind: 'reject', reason: 'persistence_failed' };

      if (saved.status === 'saved') {
        try {
          const preferences = settingsService.getAlertPreferences();
          const monthlyBudget = Number(settingsService.getMonthlyBudgetLimit()) || 20000;
          const now = new Date();
          const monthlyTotal = transactionStorage.getMonthlyTotal(now.getFullYear(), now.getMonth() + 1);

          evaluateTransactionAlerts(saved.transaction, {
            preferences,
            monthlyTotal,
            monthlyBudget,
          });
        } catch (err) {
          console.warn('Failed to evaluate transaction alerts', err);
        }
        return {
          kind: 'saved',
          transaction: saved.transaction,
          repaymentUpdates: saved.repaymentUpdates || [],
        };
      }

      if (saved.status === 'duplicate') {
        if (saved.transaction) {
          try {
            const preferences = settingsService.getAlertPreferences();
            evaluateTransactionAlerts(saved.transaction, {
              preferences,
              monthlyTotal: 0,
              monthlyBudget: 0,
              isPossibleDuplicate: true,
            });
          } catch (err) {
            console.warn('Failed to dispatch duplicate alert', err);
          }
          return { kind: 'duplicate', transaction: saved.transaction };
        }
      }

      if (saved.status === 'possible_duplicate') {
        const preferences = settingsService.getAlertPreferences();
        evaluateTransactionAlerts(candidate as any, {
          preferences,
          monthlyTotal: 0,
          monthlyBudget: 0,
          isPossibleDuplicate: true,
        });
        notifyTransactionReview(candidate);
        return { kind: 'review', candidate };
      }

      return { kind: 'reject', reason: saved.message || 'save_error' };
    }

    case 'review': {
      if (!candidate) return { kind: 'reject', reason: 'empty_candidate' };
      notifyTransactionReview(candidate);
      return { kind: 'review', candidate };
    }

    case 'reject':
    default:
      return { kind: 'reject', reason: decision.reason };
  }
}

