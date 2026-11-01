import { NativeModules, Platform } from 'react-native';
import { notifyTransactionSaved } from '../services/notifications/transactionSavedNotification';
import { notifyTransactionReview } from '../services/notifications/transactionReviewNotification';
import { TransactionCandidate } from '../core/transactions/contracts';

describe('Transaction Notification Services', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'android';
    NativeModules.MessageModule = {
      showSavedNotification: jest.fn(),
      showReviewNotification: jest.fn(),
      showExpenseNotification: jest.fn(),
    };
  });

  describe('notifyTransactionSaved', () => {
    it('dispatches rich saved notification for expense (debit) with top-right arrow and subtext', async () => {
      const expense = {
        amount: 450,
        merchant: 'Zomato',
        category: 'Food & Dining' as const,
        transactionType: 'debit' as const,
        bank: 'HDFC',
        account: '1234',
        paymentMode: 'upi' as const,
        referenceId: 'UPI-987654',
      };

      notifyTransactionSaved(expense);
      await Promise.resolve();

      expect(NativeModules.MessageModule.showSavedNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '↗ ₹450.00',
          message: 'Zomato • Food & Dining',
          subtext: 'HDFC XX1234 • Via UPI • Ref: UPI-987654',
          categorySlug: 'food_dining',
          transactionType: 'debit',
        }),
      );
    });

    it('dispatches rich saved notification for income (credit) with bottom-left arrow', async () => {
      const income = {
        amount: 50000,
        merchant: 'Acme Corp',
        category: 'Salary' as const,
        transactionType: 'credit' as const,
        bank: 'ICICI',
        account: '9988',
      };

      notifyTransactionSaved(income);
      await Promise.resolve();

      expect(NativeModules.MessageModule.showSavedNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '↙ ₹50000.00',
          message: 'Acme Corp • Salary',
          subtext: 'ICICI XX9988',
          categorySlug: 'salary',
          transactionType: 'credit',
        }),
      );
    });
  });

  describe('notifyTransactionReview', () => {
    it('dispatches actionable review notification with candidate payload and confirmation text', async () => {
      const candidate: TransactionCandidate = {
        amount: 850,
        merchant: 'Unknown POS',
        category: 'Shopping',
        transactionType: 'debit',
        bank: 'SBI',
        account: '5566',
        paymentMode: 'cc',
        confidence: 0.65,
        timestamp: 1730412000000,
        source: 'sms',
        rawMessage: 'Rs 850 spent at POS',
        isDuplicate: false,
        isInvalid: false,
      };

      notifyTransactionReview(candidate);
      await Promise.resolve();

      expect(NativeModules.MessageModule.showReviewNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Review Needed • ↗ ₹850.00',
          message: 'Unknown POS • Suggested: Shopping',
          details: expect.stringContaining('SpendWise requires your confirmation'),
          categorySlug: 'shopping',
          transactionType: 'debit',
          candidateJson: expect.stringContaining('"amount":850'),
        }),
      );
    });
  });
});

