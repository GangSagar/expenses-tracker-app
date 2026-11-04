import { NativeModules, Platform } from 'react-native';
import {
  evaluateTransactionAlerts,
  waitForAlertQueue,
} from '../services/notifications/alertNotificationService';
import { Expense } from '../types/expense';
import { AlertPreferences } from '../core/settings/SettingsRepository';

describe('Alert Notification Service', () => {
  const defaultPrefs: AlertPreferences = {
    budgetAlertsEnabled: true,
    highValueThreshold: 10000,
    lowBalanceThreshold: 2000,
    duplicateAlertsEnabled: true,
    billRemindersEnabled: true,
  };

  const sampleExpense: Expense = {
    id: 1,
    amount: 12000,
    merchant: 'Apple Store',
    category: 'Shopping',
    confidence: 1.0,
    source: 'sms',
    rawMessage: 'Paid at Apple Store',
    timestamp: Date.now(),
    transactionType: 'debit',
    bank: 'HDFC',
    account: '1234',
    availableBalance: 15000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'android';
    NativeModules.MessageModule = {
      showAlertNotification: jest.fn(),
      showExpenseNotification: jest.fn(),
    };
  });

  it('dispatches a duplicate alert when a duplicate is flagged and enabled', async () => {
    evaluateTransactionAlerts(sampleExpense, {
      monthlyTotal: 12000,
      monthlyBudget: 50000,
      preferences: defaultPrefs,
      isPossibleDuplicate: true,
    });

    await waitForAlertQueue();

    expect(NativeModules.MessageModule.showAlertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '⚠️ Possible Duplicate Charge',
        alertType: 'duplicate',
      }),
    );
  });

  it('dispatches a high-value debit alert when amount meets or exceeds threshold', async () => {
    evaluateTransactionAlerts(sampleExpense, {
      monthlyTotal: 12000,
      monthlyBudget: 50000,
      preferences: defaultPrefs,
    });

    await waitForAlertQueue();

    expect(NativeModules.MessageModule.showAlertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '🚨 High-Value Debit Alert',
        alertType: 'high_value',
      }),
    );
  });

  it('dispatches a low account balance alert when availableBalance is below threshold', async () => {
    const lowBalanceExpense: Expense = {
      id: 2,
      amount: 500,
      merchant: 'Swiggy',
      category: 'Food & Dining',
      confidence: 1.0,
      source: 'sms',
      rawMessage: 'Paid at Swiggy',
      timestamp: Date.now(),
      transactionType: 'debit',
      bank: 'HDFC',
      availableBalance: 850,
    };

    evaluateTransactionAlerts(lowBalanceExpense, {
      monthlyTotal: 500,
      monthlyBudget: 50000,
      preferences: defaultPrefs,
    });

    await waitForAlertQueue();

    expect(NativeModules.MessageModule.showAlertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '⚠️ Low Account Balance',
        alertType: 'low_balance',
      }),
    );
  });

  it('dispatches budget threshold alerts at 80%, 90%, and 100%', async () => {
    const budgetExpense: Expense = {
      id: 3,
      amount: 1000,
      merchant: 'Grocery Store',
      category: 'Groceries',
      confidence: 1.0,
      source: 'sms',
      rawMessage: 'Paid at Grocery Store',
      timestamp: Date.now(),
      transactionType: 'debit',
      bank: 'HDFC',
      availableBalance: 25000,
    };

    // 80% boundary crossing
    evaluateTransactionAlerts(budgetExpense, {
      monthlyTotal: 40500, // crossed 40000 (80% of 50000)
      monthlyBudget: 50000,
      preferences: defaultPrefs,
    });

    await waitForAlertQueue();

    expect(NativeModules.MessageModule.showAlertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 9080,
        title: '⚠️ 80% Budget Threshold Reached',
        alertType: 'budget',
      }),
    );

    NativeModules.MessageModule.showAlertNotification.mockClear();

    // 90% boundary crossing
    evaluateTransactionAlerts(budgetExpense, {
      monthlyTotal: 45500, // crossed 45000 (90% of 50000), previous was 44500
      monthlyBudget: 50000,
      preferences: defaultPrefs,
    });

    await waitForAlertQueue();

    expect(NativeModules.MessageModule.showAlertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 9090,
        title: '⚠️ 90% Budget Limit Warning',
        alertType: 'budget',
      }),
    );

    NativeModules.MessageModule.showAlertNotification.mockClear();

    // 100% boundary crossing
    evaluateTransactionAlerts(budgetExpense, {
      monthlyTotal: 50500, // crossed 50000 (100% of 50000), previous was 49500
      monthlyBudget: 50000,
      preferences: defaultPrefs,
    });

    await waitForAlertQueue();

    expect(NativeModules.MessageModule.showAlertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 9100,
        title: '🚨 Monthly Budget Exceeded!',
        alertType: 'budget',
      }),
    );
  });

  it('suppresses alerts when disabled in preferences', async () => {
    const disabledPrefs: AlertPreferences = {
      budgetAlertsEnabled: false,
      highValueThreshold: 0,
      lowBalanceThreshold: 0,
      duplicateAlertsEnabled: false,
      billRemindersEnabled: false,
    };

    evaluateTransactionAlerts(sampleExpense, {
      monthlyTotal: 60000,
      monthlyBudget: 50000,
      preferences: disabledPrefs,
      isPossibleDuplicate: true,
    });

    await waitForAlertQueue();

    expect(NativeModules.MessageModule.showAlertNotification).not.toHaveBeenCalled();
  });
});
