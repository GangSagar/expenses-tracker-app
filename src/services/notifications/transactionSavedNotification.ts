import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { Expense } from '../../types/expense';

export type SavedTransactionSummary = Partial<Expense> &
  Pick<Expense, 'amount' | 'merchant' | 'transactionType'>;

let notificationQueue = Promise.resolve();

function slugifyCategory(category?: string): string {
  if (!category) return 'other';
  return category
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'other';
}

/** Best-effort user feedback after a successful transaction write. */
export function notifyTransactionSaved(transaction: SavedTransactionSummary): void {
  const isCredit = transaction.transactionType === 'credit';
  const arrow = isCredit ? '↙' : '↗';
  const amount = `₹${Number(transaction.amount).toFixed(2)}`;
  const title = `${arrow} ${amount}`;

  const merchant = transaction.merchant?.trim() || 'Transaction';
  const category = transaction.category?.trim() || 'Other';
  const message = `${merchant} • ${category}`;

  // Subtext is only shown when notification is expanded
  const detailsParts: string[] = [];
  if (transaction.bank) {
    const acc = transaction.account ? ` XX${transaction.account.replace(/[^0-9]/g, '').slice(-4)}` : '';
    detailsParts.push(`${transaction.bank}${acc}`);
  }
  if (transaction.paymentMode && transaction.paymentMode !== 'unknown') {
    detailsParts.push(`Via ${transaction.paymentMode.toUpperCase()}`);
  }
  if (transaction.referenceId) {
    detailsParts.push(`Ref: ${transaction.referenceId}`);
  }
  const subtext = detailsParts.length > 0 ? detailsParts.join(' • ') : 'Transaction saved to history';

  notificationQueue = notificationQueue.then(async () => {
    try {
      if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
        const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
        const granted = (await PermissionsAndroid.check(permission)) ||
          ((await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED);
        if (!granted) {
          console.info('Transaction saved; notification permission was not granted.');
          return;
        }
      }

      const nativeModule = Platform.OS === 'ios'
        ? NativeModules.TransactionNotificationModule
        : NativeModules.MessageModule;

      if (typeof nativeModule?.showSavedNotification === 'function') {
        nativeModule.showSavedNotification({
          id: transaction.id || Date.now(),
          title,
          message,
          subtext,
          categorySlug: slugifyCategory(category),
          transactionType: transaction.transactionType,
        });
      } else if (typeof nativeModule?.showExpenseNotification === 'function') {
        nativeModule.showExpenseNotification(title, message);
      } else {
        console.warn('Transaction saved, but native notification support is unavailable.');
      }
    } catch (error) {
      console.warn('Transaction saved, but its notification could not be shown:', error);
    }
  });
}
