import { NativeModules, Platform, PermissionsAndroid } from 'react-native';
import { Expense } from '../../types/expense';
import { AlertPreferences } from '../../core/settings/SettingsRepository';

export interface AlertEvaluationContext {
  monthlyTotal: number;
  monthlyBudget: number;
  preferences: AlertPreferences;
  isPossibleDuplicate?: boolean;
}

let alertQueue = Promise.resolve();

export function waitForAlertQueue(): Promise<void> {
  return alertQueue;
}

function dispatchNativeAlert(
  id: number,
  title: string,
  message: string,
  details?: string,
  alertType: string = 'general',
): void {
  alertQueue = alertQueue.then(async () => {
    try {
      if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
        const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
        const granted = (await PermissionsAndroid.check(permission)) ||
          ((await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED);
        if (!granted) return;
      }

      const { MessageModule } = NativeModules;
      if (typeof MessageModule?.showAlertNotification === 'function') {
        MessageModule.showAlertNotification({
          id,
          title,
          message,
          details,
          alertType,
        });
      } else if (typeof MessageModule?.showExpenseNotification === 'function') {
        MessageModule.showExpenseNotification(title, message);
      }
    } catch (e) {
      console.warn('Failed to dispatch alert notification:', e);
    }
  });
}

/**
 * Checks transaction conditions and dispatches smart alerts for budget caps, high-value spend,
 * low bank balance, and duplicate charges.
 */
export function evaluateTransactionAlerts(
  transaction: Expense,
  context: AlertEvaluationContext,
): void {
  const { preferences, monthlyTotal, monthlyBudget, isPossibleDuplicate } = context;

  // 1. Possible Duplicate Charge Alert
  if (preferences.duplicateAlertsEnabled && isPossibleDuplicate) {
    const title = '⚠️ Possible Duplicate Charge';
    const message = `₹${transaction.amount} at ${transaction.merchant}`;
    const details = `Identical charge detected within a short time window.\nTap to view and link as duplicate under the original message.`;
    dispatchNativeAlert(Date.now() % 2147483647, title, message, details, 'duplicate');
    return;
  }

  // 2. High-Value Transaction Alert
  if (
    preferences.highValueThreshold > 0 &&
    transaction.transactionType === 'debit' &&
    transaction.amount >= preferences.highValueThreshold
  ) {
    const title = '🚨 High-Value Debit Alert';
    const message = `↗ ₹${transaction.amount.toFixed(2)} at ${transaction.merchant}`;
    const details = `An unusually large transaction occurred on your account.\nAmount: ₹${transaction.amount}\nMerchant: ${transaction.merchant}\nCategory: ${transaction.category}`;
    dispatchNativeAlert(Date.now() % 2147483647, title, message, details, 'high_value');
  }

  // 3. Low Account Balance Alert
  if (
    preferences.lowBalanceThreshold > 0 &&
    transaction.availableBalance !== undefined &&
    transaction.availableBalance < preferences.lowBalanceThreshold
  ) {
    const title = '⚠️ Low Account Balance';
    const bankName = transaction.bank ? `${transaction.bank} ` : '';
    const message = `${bankName}Balance: ₹${transaction.availableBalance.toFixed(2)}`;
    const details = `Your available account balance is below ₹${preferences.lowBalanceThreshold}.\nCurrent Balance: ₹${transaction.availableBalance.toFixed(2)}`;
    dispatchNativeAlert(Date.now() % 2147483647, title, message, details, 'low_balance');
  }

  // 4. Budget Cap & Burn-Rate Alert
  if (preferences.budgetAlertsEnabled && monthlyBudget > 0 && transaction.transactionType === 'debit') {
    const ratio = monthlyTotal / monthlyBudget;
    const prevRatio = (monthlyTotal - transaction.amount) / monthlyBudget;

    if (ratio >= 1.0 && prevRatio < 1.0) {
      const title = '🚨 Monthly Budget Exceeded!';
      const message = `Spent ₹${monthlyTotal.toFixed(0)} of ₹${monthlyBudget.toFixed(0)} budget`;
      const details = `You have reached 100% of your allocated monthly spending cap.`;
      dispatchNativeAlert(9100, title, message, details, 'budget');
    } else if (ratio >= 0.9 && prevRatio < 0.9) {
      const title = '⚠️ 90% Budget Limit Warning';
      const remaining = Math.max(0, monthlyBudget - monthlyTotal);
      const message = `Only ₹${remaining.toFixed(0)} left in this month's budget`;
      const details = `You have utilized 90% of your monthly cap (₹${monthlyTotal.toFixed(0)} / ₹${monthlyBudget.toFixed(0)}).`;
      dispatchNativeAlert(9090, title, message, details, 'budget');
    } else if (ratio >= 0.8 && prevRatio < 0.8) {
      const title = '⚠️ 80% Budget Threshold Reached';
      const message = `Used 80% of ₹${monthlyBudget.toFixed(0)} monthly budget`;
      const details = `Current monthly spending is ₹${monthlyTotal.toFixed(0)}. Keep an eye on non-essential spending.`;
      dispatchNativeAlert(9080, title, message, details, 'budget');
    }
  }
}
