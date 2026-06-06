import { isSpam, trainSpam, resetSpamClassifier } from '../core/classifier/spamClassifier';
import { processIncomingMessage } from '../services/messageService';

// Mock getSetting and setSetting from expenseRepo
let mockSettingsStore: Record<string, string> = {};

jest.mock('../database/expenseRepo', () => {
  return {
    getSetting: jest.fn((key: string, defaultValue: string = '') => {
      return mockSettingsStore[key] || defaultValue;
    }),
    setSetting: jest.fn((key: string, value: string) => {
      mockSettingsStore[key] = value;
    }),
    insertExpense: jest.fn(),
  };
});

describe('Dynamic Bayesian Spam Classifier', () => {
  beforeEach(() => {
    mockSettingsStore = {};
    resetSpamClassifier();
    jest.clearAllMocks();
  });

  it('should return false if the classifier has not been trained (spamCount is 0)', () => {
    const text = 'Earn Rs 50000 cash daily, click link now!';
    expect(isSpam(text)).toBe(false);
  });

  it('should return false for unrelated messages with zero matching tokens even when trained', () => {
    // Train with spam
    trainSpam('Earn lottery prize money click link free', true);
    
    // Test a completely unrelated transaction message with zero vocabulary overlap
    const txnText = 'INR 500.00 spent on Card XX1234 at AMZN';
    expect(isSpam(txnText)).toBe(false);
  });

  it('should classify spam messages correctly when trained', () => {
    // Train with a couple of spam messages
    trainSpam('win free lottery cash voucher reward', true);
    trainSpam('apply personal loan discount cashback now', true);
    
    // Train with one ham/legitimate transaction indicator
    trainSpam('debited spent paid', false);

    // This should match spam tokens like "free", "lottery", "cash"
    const spamText = 'Get free cash lottery prize now';
    expect(isSpam(spamText)).toBe(true);

    // This should match ham/legit tokens like "spent", "paid"
    const legitText = 'Amount of Rs.100 spent';
    expect(isSpam(legitText)).toBe(false);
  });

  describe('processIncomingMessage Integration & Bypass', () => {
    it('should bypass the spam check for genuine bank alerts (containing both bank and account)', () => {
      // Train with spam
      trainSpam('Zomato spent cash discount lottery link', true);

      // Create a message that matches spam tokens but has a bank and account
      // Note: "Zomato spent" matches spam tokens in our training set, but it has a bank (ICICI) and account (XX4000)
      const genuineBankMessage = {
        body: 'INR 665.64 spent using ICICI Bank Card XX4000 on ZOMATO. Avl Limit: INR 8,667.02.',
        sender: 'AD-ICICIB',
        source: 'sms' as const,
      };

      const result = processIncomingMessage(genuineBankMessage);
      
      expect(result).not.toBeNull();
      expect(result?.amount).toBe(665.64);
      expect(result?.bank).toBe('ICICI');
      expect(result?.account).toBe('4000');
    });

    it('should NOT bypass the spam check if it is not a genuine bank alert', () => {
      // Train with spam
      trainSpam('free discount coupon link lottery spin offer', true);

      const spamMessage = {
        body: 'Get free discount coupon worth Rs. 500. Spin now!',
        sender: 'AD-SPAM',
        source: 'sms' as const,
      };

      const result = processIncomingMessage(spamMessage);
      expect(result).toBeNull(); // Dropped because it is spam and not a bank alert
    });
  });
});
