import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { TransactionCandidate } from '../../core/transactions/contracts';

let reviewNotificationQueue = Promise.resolve();

function slugifyCategory(category?: string): string {
  if (!category) return 'other';
  return category
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'other';
}

/**
 * Dispatches an actionable review notification for a pending candidate transaction.
 * Contains "Save" (direct background commit to SQLite) and "Dismiss" buttons.
 */
export function notifyTransactionReview(candidate: TransactionCandidate): void {
  const isCredit = candidate.transactionType === 'credit';
  const arrow = isCredit ? '↙' : '↗';
  const amount = `₹${Number(candidate.amount).toFixed(2)}`;
  const title = `Review Needed • ${arrow} ${amount}`;

  const merchant = candidate.merchant?.trim() || 'Unknown';
  const category = candidate.category?.trim() || 'Other';
  const message = `${merchant} • Suggested: ${category}`;

  const detailLines = [
    `Amount: ${arrow} ${amount}`,
    `Merchant: ${merchant}`,
    `Suggested Category: ${category}`,
  ];
  if (candidate.bank) {
    const acc = candidate.account ? ` XX${candidate.account.replace(/[^0-9]/g, '').slice(-4)}` : '';
    detailLines.push(`• Account: ${candidate.bank}${acc}`);
  }
  if (candidate.paymentMode && candidate.paymentMode !== 'unknown') {
    detailLines.push(`• Payment Mode: ${candidate.paymentMode.toUpperCase()}`);
  }

  const details = detailLines.join('\n');
  const candidateJson = JSON.stringify(candidate);

  reviewNotificationQueue = reviewNotificationQueue.then(async () => {
    try {
      if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
        const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
        const granted = (await PermissionsAndroid.check(permission)) ||
          ((await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED);
        if (!granted) {
          console.info('Review notification skipped; permission not granted.');
          return;
        }
      }

      const nativeModule = Platform.OS === 'ios'
        ? NativeModules.TransactionNotificationModule
        : NativeModules.MessageModule;

      const notificationId = Date.now() % 2147483647;

      if (typeof nativeModule?.showReviewNotification === 'function') {
        nativeModule.showReviewNotification({
          id: notificationId,
          title,
          message,
          details,
          candidateJson,
          categorySlug: slugifyCategory(category),
          transactionType: candidate.transactionType,
        });
      } else if (typeof nativeModule?.showExpenseNotification === 'function') {
        nativeModule.showExpenseNotification(title, message);
      }
    } catch (error) {
      console.warn('Failed to dispatch review notification:', error);
    }
  });
}

