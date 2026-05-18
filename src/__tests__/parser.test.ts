import { parseMessage } from '../core/parser/parseMessage';
import { isTransactionMessage } from '../core/parser/filters';
import samples from './__fixtures__/sms-samples.json';

describe('parseMessage', () => {
  const transactionalSamples = samples.filter(s => s.expected !== null);
  const nonTransactionalSamples = samples.filter(s => s.expected === null);

  test.each(transactionalSamples)(
    'parses: "$message"',
    ({ message, expected }) => {
      let mockSender = 'JD-HDFCBK';
      if (expected && expected.bank) {
        const bankName = expected.bank;
        if (bankName === 'ICICI') mockSender = 'AD-ICICIB';
        else if (bankName === 'SBI') mockSender = 'VK-SBIIND';
        else if (bankName === 'Axis') mockSender = 'AX-AXISBK';
        else if (bankName === 'Kotak') mockSender = 'KM-KOTAKB';
        else if (bankName === 'Bank of India') mockSender = 'JM-BOIIND';
        else if (bankName === 'Bank of Baroda') mockSender = 'JX-BOBSMS';
        else if (bankName === 'PNB') mockSender = 'VM-PNBSMS';
        else if (bankName === 'Punjab and Sind Bank') mockSender = 'VM-PSBANK';
        else if (bankName === 'Yes Bank') mockSender = 'AD-YESBNK';
        else if (bankName === 'IndusInd') mockSender = 'AD-INDUSI';
        else if (bankName === 'Paytm Payments Bank') mockSender = 'AD-PAYTM';
      }
      const result = parseMessage(message, mockSender, 'sms');
      expect(result.amount).toBe(expected!.amount);
      if (expected!.merchant) {
        expect(result.merchant?.toUpperCase()).toContain(
          expected!.merchant.toUpperCase(),
        );
      }
      expect(result.transactionType).toBe(expected!.transactionType);
      expect(result.paymentMode).toBe(expected!.paymentMode);
      if (expected!.account) {
        expect(result.account).toBe(expected!.account);
      } else {
        expect(result.account).toBeNull();
      }
      if (expected!.bank) {
        expect(result.bank).toBe(expected!.bank);
      }
      if (expected && 'availableBalance' in expected) {
        expect(result.availableBalance).toBe(expected.availableBalance);
      } else {
        expect(result.availableBalance).toBeUndefined();
      }
    },
  );

  test.each(nonTransactionalSamples)(
    'filters non-transactional: "$message"',
    ({ message }) => {
      expect(isTransactionMessage(message)).toBe(false);
    },
  );
});

describe('parseMessage - amount extraction', () => {
  it('handles comma-separated amounts', () => {
    const result = parseMessage('Rs.1,50,000 debited from your account', 'JD-HDFCBK', 'sms');
    expect(result.amount).toBe(150000);
  });

  it('handles decimal amounts', () => {
    const result = parseMessage('Rs.99.99 spent at STORE', 'JD-HDFCBK', 'sms');
    expect(result.amount).toBe(99.99);
  });

  it('handles INR prefix', () => {
    const result = parseMessage('INR 500 debited to MERCHANT', 'JD-HDFCBK', 'sms');
    expect(result.amount).toBe(500);
  });

  it('handles ₹ symbol', () => {
    const result = parseMessage('₹1200 paid to Uber', 'JD-HDFCBK', 'sms');
    expect(result.amount).toBe(1200);
  });
});

describe('parseMessage - transaction type detection', () => {
  it('detects debit', () => {
    const result = parseMessage('Rs.500 debited from your account', 'JD-HDFCBK', 'sms');
    expect(result.transactionType).toBe('debit');
  });

  it('detects credit', () => {
    const result = parseMessage('Rs.500 credited to your account', 'JD-HDFCBK', 'sms');
    expect(result.transactionType).toBe('credit');
  });

  it('detects refund as credit', () => {
    const result = parseMessage(
      'Refund of Rs.500 using UPI/123456789012/Oid123',
      'JD-HDFCBK',
      'sms'
    );
    expect(result.transactionType).toBe('credit');
  });
});

describe('parseMessage - merchant extraction with receiver/payee', () => {
  it('extracts merchant from Receiver: pattern', () => {
    const result = parseMessage(
      'Rs.500 debited from A/c XX1234. Receiver: John Doe on 17-05-26',
      'JM-BOIIND-S',
      'sms'
    );
    expect(result.merchant).toBe('John Doe');
  });

  it('extracts merchant from Payee: pattern', () => {
    const result = parseMessage(
      'Rs.500 debited from A/c XX1234. Payee: Jane Smith',
      'JM-BOIIND-S',
      'sms'
    );
    expect(result.merchant).toBe('Jane Smith');
  });
});

describe('System Test Suite for Sample Messages', () => {
  it('parses message 1 (PSB Credited with UPI block)', () => {
    const result = parseMessage(
      'A/c No **2540 Credited with Rs 50000--UPI/CR/534765332543/GANGA SAGAR/BARB/7930010000 (CLR BAL 100120CR)(13-12-2025 22:27:02)-Punjab&Sind Bank',
      'VM-PSBANK-S',
      'sms'
    );
    expect(result.amount).toBe(50000);
    expect(result.transactionType).toBe('credit');
    expect(result.account).toBe('2540');
    expect(result.merchant).toBe('GANGA SAGAR');
    expect(result.availableBalance).toBe(100120);
  });

  it('parses message 2 (PSB Credited with VPA fallback)', () => {
    const result = parseMessage(
      'PSB UPI - Your a/c no. XX2540 is credited for Rs. 1.00 on 17-May-26 from hrnharshit-1@okicici (UPI Ref no 613757557792)-Punjab&Sind Bank',
      'VM-PSBANK-S',
      'sms'
    );
    expect(result.amount).toBe(1);
    expect(result.transactionType).toBe('credit');
    expect(result.account).toBe('2540');
    expect(result.merchant).toBe('hrnharshit-1');
  });

  it('parses message 3 (PSB Debited to VPA)', () => {
    const result = parseMessage(
      'UPI-VPA harshithrn@ybl linked to Punjab and Sind Bank a/c no. XX2540 is debited Rs.1.00 and credited to 8957298560@ybl (Ref no 501099216248)-P&SB',
      'VM-PSBANK-S',
      'sms'
    );
    expect(result.amount).toBe(1);
    expect(result.transactionType).toBe('debit');
    expect(result.account).toBe('2540');
    expect(result.merchant).toBe('8957298560@ybl');
  });

  it('parses message 4 (BOB Credited)', () => {
    const result = parseMessage(
      'Dear BOB UPI User: Your account is credited with INR 1.00 on 2026-05-17 03:16:35 AM by UPI Ref No 380133147553; AvlBal: Rs1015.58 - BOB',
      'JX-BOBSMS-S',
      'sms'
    );
    expect(result.amount).toBe(1);
    expect(result.transactionType).toBe('credit');
    expect(result.availableBalance).toBe(1015.58);
  });

  it('parses message 5 (BOB Dr. to VPA with 3-digit masked account)', () => {
    const result = parseMessage(
      'Rs.1.00 Dr. from A/C XXXXXX9132 and Cr. to harshithrn@ybl. Ref:726412060639. AvlBal:Rs1015.58(2026:05:17 03:32:18). Not you? Call 18005700/5000-BOB',
      'JX-BOBSMS-S',
      'sms'
    );
    expect(result.amount).toBe(1);
    expect(result.transactionType).toBe('debit');
    expect(result.account).toBe('9132');
    expect(result.merchant).toBe('harshithrn@ybl');
    expect(result.availableBalance).toBe(1015.58);
  });

  it('parses message 6 (BOI Credited)', () => {
    const result = parseMessage(
      'BOI -  Rs.1.00 Credited to your Ac XX0604 on 17-05-26 by UPI ref No.613709668637.Avl Bal 1121.00',
      'JM-BOIIND-S',
      'sms'
    );
    expect(result.amount).toBe(1);
    expect(result.transactionType).toBe('credit');
    expect(result.account).toBe('0604');
    expect(result.availableBalance).toBe(1121);
  });

  it('parses message 7 (BOI Debited with custom merchant)', () => {
    const result = parseMessage(
      'Rs.120.00 debited A/cXX0604 and credited to TOBOX VENTURES PRIVATE LIMIT via UPI Ref No 606127862781 on 02Mar26. Call 18001031906, if not done by you. -BOI',
      'JM-BOIIND-S',
      'sms'
    );
    expect(result.amount).toBe(120);
    expect(result.transactionType).toBe('debit');
    expect(result.account).toBe('0604');
    expect(result.merchant).toBe('TOBOX VENTURES PRIVATE LIMIT');
  });

  it('parses message 8 (ICICI Card Spent on Merchant)', () => {
    const result = parseMessage(
      'INR 665.64 spent using ICICI Bank Card XX4000 on 16-May-26 on TECHMASH SOLUTI. Avl Limit: INR 8,667.02. If not you, call 1800 2662/SMS BLOCK 4000 to 9215676766.',
      'AD-ICICIB',
      'sms'
    );
    expect(result.amount).toBe(665.64);
    expect(result.transactionType).toBe('debit');
    expect(result.account).toBe('4000');
    expect(result.merchant).toBe('TECHMASH SOLUTI');
    expect(result.availableBalance).toBe(8667.02);
  });

  it('parses message 9/10 (ICICI 3-digit Account debited)', () => {
    const result = parseMessage(
      'ICICI Bank Acc XX575 debited Rs. 450.36 on 30-Apr-26 InfoBIL*INFT*0011.Avl Bal Rs. 2,667.87.To dispute call 18002662 or SMS BLOCK 575 to 9215676766',
      'AD-ICICIB',
      'sms'
    );
    expect(result.amount).toBe(450.36);
    expect(result.transactionType).toBe('debit');
    expect(result.account).toBe('575');
    expect(result.availableBalance).toBe(2667.87);
  });

  it('parses message 11 (ICICI 3-digit Account NEFT credited)', () => {
    const result = parseMessage(
      'ICICI Bank Account XX575 credited:Rs. 67,632.00 on 30-Mar-26. Info NEFT-HSBCN08932182457-HP PPS. Available Balance is Rs. 67,676.13.',
      'AD-ICICIB',
      'sms'
    );
    expect(result.amount).toBe(67632);
    expect(result.transactionType).toBe('credit');
    expect(result.account).toBe('575');
    expect(result.merchant).toBe('HP PPS');
    expect(result.availableBalance).toBe(67676.13);
  });

  it('parses message 12 (ICICI CC received payment)', () => {
    const result = parseMessage(
      'Dear Customer, Payment of INR 35,115.90 has been received on your ICICI Bank Credit Card Account 4xxx4000 on 30-MAR-26.Thank you.',
      'AD-ICICIB',
      'sms'
    );
    expect(result.amount).toBe(35115.90);
    expect(result.transactionType).toBe('credit');
    expect(result.account).toBe('4000');
  });

  it('parses message 13 (ICICI CC with ending in format)', () => {
    const result = parseMessage(
      'INR 1,200.00 spent using ICICI Bank Credit Card ending in 4000 on 17-May-26 at ZOMATO.',
      'AD-ICICIB',
      'sms'
    );
    expect(result.amount).toBe(1200);
    expect(result.transactionType).toBe('debit');
    expect(result.account).toBe('4000');
    expect(result.merchant).toBe('ZOMATO');
  });
});

import { normalizeUnicodeText } from '../utils/formatHelpers';
import { processIncomingMessage } from '../services/messageService';

describe('Unicode Alphanumeric Normalization', () => {
  it('correctly normalizes stylized mathematical sans-serif fonts to standard ASCII', () => {
    const stylized = '𝖣𝖾𝖺𝗋 𝖡𝖮𝖡 𝖴𝖯𝖨 𝖴𝗌𝖾𝗋: 𝖸𝗈𝗎𝗋 𝖺𝖼𝖼𝗈𝗎𝗇𝗍 𝗂𝗌 𝖼𝗋𝖾𝖽𝗂𝗍𝖾𝖽 𝗐𝗂𝗍𝗁 𝖨𝖭𝖱 589.00';
    const expected = 'Dear BOB UPI User: Your account is credited with INR 589.00';
    expect(normalizeUnicodeText(stylized)).toBe(expected);
  });

  it('successfully processes fully stylized Mathematical Sans-Serif bank alerts', () => {
    const rawAlert = '𝖣𝖾𝖺𝗋 𝖡𝖮𝖡 𝖴𝖯𝖨 𝖴𝗌𝖾𝗋: 𝖸𝗈𝗎𝗋 𝖺𝖼𝖼𝗈𝗎𝗇𝗍 𝗂𝗌 𝖼𝗋𝖾𝖽𝗂𝗍𝖾𝖽 𝗐𝗂𝗍𝗁 𝖨𝖭𝖱 589.00 𝗈𝗇 2026-05-18 12:40:35 PM by UPI Ref No 650422642065; AvlBal: Rs2248.58 - 𝖡𝖮𝖡';
    const parsed = processIncomingMessage({
      body: rawAlert,
      sender: 'JX-BOBSMS',
      source: 'sms',
    });

    expect(parsed).not.toBeNull();
    expect(parsed!.amount).toBe(589.00);
    expect(parsed!.transactionType).toBe('credit');
    expect(parsed!.bank).toBe('Bank of Baroda');
    expect(parsed!.paymentMode).toBe('upi');
    expect(parsed!.availableBalance).toBe(2248.58);
  });
});
