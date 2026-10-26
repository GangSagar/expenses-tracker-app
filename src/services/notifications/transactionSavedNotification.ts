import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { Expense } from '../../types/expense';

type SavedTransactionSummary = Pick<Expense, 'amount' | 'merchant' | 'transactionType'>;

let notificationQueue = Promise.resolve();

/** Best-effort user feedback after a successful transaction write. */
export function notifyTransactionSaved(transaction: SavedTransactionSummary): void {
  const amount = `₹${Number(transaction.amount).toFixed(2)}`;
  const kind = transaction.transactionType === 'credit' ? 'Credit' : 'Expense';
  const merchant = transaction.merchant?.trim() || 'Transaction';
  const title = 'Transaction saved';
  const body = `${kind}: ${amount} at ${merchant}`;

  notificationQueue = notificationQueue.then(async () => {
    try {
      if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
        const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
        const granted = await PermissionsAndroid.check(permission) ||
          await PermissionsAndroid.request(permission) === PermissionsAndroid.RESULTS.GRANTED;
        if (!granted) {
          console.info('Transaction saved; notification permission was not granted.');
          return;
        }
      }

      const nativeModule = Platform.OS === 'ios'
        ? NativeModules.TransactionNotificationModule
        : NativeModules.MessageModule;
      const showNotification = Platform.OS === 'ios'
        ? nativeModule?.showSavedNotification
        : nativeModule?.showExpenseNotification;

      if (typeof showNotification !== 'function') {
        console.warn('Transaction saved, but native notification support is unavailable.');
        return;
      }
      showNotification(title, body);
    } catch (error) {
      console.warn('Transaction saved, but its notification could not be shown:', error);
    }
  });
}
