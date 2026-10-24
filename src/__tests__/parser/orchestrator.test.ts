import { defaultParserOrchestrator } from '../../core/parser/orchestrator';
import { configManager } from '../../core/parser/config';

describe('ParserOrchestrator End-to-End Tests', () => {
  describe('Major Indian Banks Support', () => {
    it('parses SBI message', () => {
      const msg = 'Dear SBI User, your A/c ending with 4567 debited by Rs.2,499.00 on 10-May-26 transfer to AMAZON Ref 123456';
      const parsed = defaultParserOrchestrator.parse(msg, 'VK-SBIIND');

      expect(parsed?.amount).toBe(2499);
      expect(parsed?.bank).toBe('SBI');
      expect(parsed?.account).toBe('4567');
      expect(parsed?.normalizedMerchant).toBe('Amazon');
      expect(parsed?.category).toBe('Shopping');
      expect(parsed?.transactionType).toBe('debit');
    });

    it('parses HDFC message', () => {
      const msg = 'Rs.450.00 spent on HDFC Bank Card xx1234 at SWIGGY on 15-05-26';
      const parsed = defaultParserOrchestrator.parse(msg, 'JD-HDFCBK');

      expect(parsed?.amount).toBe(450);
      expect(parsed?.bank).toBe('HDFC');
      expect(parsed?.account).toBe('1234');
      expect(parsed?.normalizedMerchant).toBe('Swiggy');
      expect(parsed?.category).toBe('Food & Dining');
      expect(parsed?.transactionType).toBe('debit');
    });

    it('parses ICICI message', () => {
      const msg = 'INR 665.64 spent using ICICI Bank Card XX4000 on 16-May-26 on TECHMASH SOLUTI. Avl Limit: INR 8,667.02';
      const parsed = defaultParserOrchestrator.parse(msg, 'AD-ICICIB');

      expect(parsed?.amount).toBe(665.64);
      expect(parsed?.bank).toBe('ICICI');
      expect(parsed?.account).toBe('4000');
      expect(parsed?.paymentMode).toBe('cc');
      expect(parsed?.availableBalance).toBe(8667.02);
    });

    it('parses Axis message', () => {
      const msg = 'INR 1,200.00 spent on your Axis Bank Card no. XX8899 at UBER on 12-Jun-26. Avl Bal: INR 15,000';
      const parsed = defaultParserOrchestrator.parse(msg, 'AX-AXISBK');

      expect(parsed?.amount).toBe(1200);
      expect(parsed?.bank).toBe('Axis');
      expect(parsed?.account).toBe('8899');
      expect(parsed?.normalizedMerchant).toBe('Uber');
      expect(parsed?.category).toBe('Travel');
    });

    it('parses Kotak message', () => {
      const msg = 'Sent Rs. 350.00 from Kotak Bank A/c **4321 to ZOMATO on 05-Jul-26 via UPI';
      const parsed = defaultParserOrchestrator.parse(msg, 'KM-KOTAKB');

      expect(parsed?.amount).toBe(350);
      expect(parsed?.bank).toBe('Kotak');
      expect(parsed?.account).toBe('4321');
      expect(parsed?.normalizedMerchant).toBe('Zomato');
      expect(parsed?.paymentMode).toBe('upi');
    });

    it('parses Yes Bank message', () => {
      const msg = 'Yes Bank A/c *7788 debited with INR 500.00 on 10-Aug-26 towards Blinkit via UPI';
      const parsed = defaultParserOrchestrator.parse(msg, 'AD-YESBNK');

      expect(parsed?.amount).toBe(500);
      expect(parsed?.bank).toBe('Yes Bank');
      expect(parsed?.account).toBe('7788');
      expect(parsed?.normalizedMerchant).toBe('Blinkit');
      expect(parsed?.category).toBe('Groceries');
    });

    it('parses IndusInd message', () => {
      const msg = 'Your IndusInd Bank A/c XX3344 has been debited by Rs.899.00 on 11-Aug-26 transfer to Netflix';
      const parsed = defaultParserOrchestrator.parse(msg, 'AD-INDUSI');

      expect(parsed?.amount).toBe(899);
      expect(parsed?.bank).toBe('IndusInd');
      expect(parsed?.account).toBe('3344');
      expect(parsed?.normalizedMerchant).toBe('Netflix');
      expect(parsed?.category).toBe('Entertainment');
    });

    it('parses IDFC First message', () => {
      const msg = 'Rs. 250.00 debited from IDFC First Bank A/c XX5566 on 14-Aug-26 towards Apollo Pharmacy';
      const parsed = defaultParserOrchestrator.parse(msg, 'IDFC-FIRST');

      expect(parsed?.amount).toBe(250);
      expect(parsed?.bank).toBe('IDFC');
      expect(parsed?.account).toBe('5566');
      expect(parsed?.normalizedMerchant).toBe('Apollo Pharmacy');
      expect(parsed?.category).toBe('Health');
    });

    it('parses AU Bank message', () => {
      const msg = 'AU Small Finance Bank: Rs. 150.00 spent on A/c XX9911 at McDonald\'s on 15-Aug-26';
      const parsed = defaultParserOrchestrator.parse(msg, 'AU-AUBANK');

      expect(parsed?.amount).toBe(150);
      expect(parsed?.bank).toBe('AU Bank');
      expect(parsed?.account).toBe('9911');
      expect(parsed?.normalizedMerchant).toBe("McDonald's");
      expect(parsed?.category).toBe('Food & Dining');
    });

    it('parses Canara Bank message', () => {
      const msg = 'Canara Bank: Your A/c XX6677 is debited for Rs.1,000.00 on 16-Aug-26 transfer to IRCTC';
      const parsed = defaultParserOrchestrator.parse(msg, 'CN-CANARA');

      expect(parsed?.amount).toBe(1000);
      expect(parsed?.bank).toBe('Canara');
      expect(parsed?.account).toBe('6677');
      expect(parsed?.normalizedMerchant).toBe('IRCTC');
      expect(parsed?.category).toBe('Travel');
    });

    it('parses Bank of Baroda message', () => {
      const msg = 'Rs.70.00 Dr. from A/C XXXXXX9132 and Cr. to q682976455@ybl. Ref:628597769620. AvlBal:Rs4039.12(2026:10:12 08:08:42). Not you? Call 18005700/5000-BOB';
      const parsed = defaultParserOrchestrator.parse(msg, 'JX-BOBSMS');

      expect(parsed?.amount).toBe(70);
      expect(parsed?.bank).toBe('Bank of Baroda');
      expect(parsed?.account).toBe('9132');
      expect(parsed?.availableBalance).toBe(4039.12);
      expect(parsed?.referenceNumber).toBe('628597769620');
    });

    it('parses PNB message', () => {
      const msg = 'Punjab National Bank: A/c XX1122 debited with Rs. 750.00 on 18-Aug-26 via UPI Ref 9911223344';
      const parsed = defaultParserOrchestrator.parse(msg, 'VM-PNBSMS');

      expect(parsed?.amount).toBe(750);
      expect(parsed?.bank).toBe('PNB');
      expect(parsed?.account).toBe('1122');
      expect(parsed?.paymentMode).toBe('upi');
    });

    it('parses Union Bank message', () => {
      const msg = 'Union Bank of India: Rs. 300.00 debited from A/c XX4455 on 19-Aug-26 transfer to Dominos Pizza';
      const parsed = defaultParserOrchestrator.parse(msg, 'UB-UNIONB');

      expect(parsed?.amount).toBe(300);
      expect(parsed?.bank).toBe('Union Bank');
      expect(parsed?.account).toBe('4455');
      expect(parsed?.normalizedMerchant).toBe("Domino's");
      expect(parsed?.category).toBe('Food & Dining');
    });
  });

  describe('Wallets, UPI, and Cards', () => {
    it('parses wallet transactions', () => {
      const msg = 'Paid Rs. 150 to Zomato from Paytm Wallet';
      const parsed = defaultParserOrchestrator.parse(msg);

      expect(parsed?.amount).toBe(150);
      expect(parsed?.paymentMode).toBe('wallet');
      expect(parsed?.normalizedMerchant).toBe('Zomato');
      expect(parsed?.category).toBe('Food & Dining');
    });

    it('parses Credit Card received payment (Bill payment)', () => {
      const msg = 'Dear Customer, Payment of INR 35,115.90 has been received on your ICICI Bank Credit Card Account 4xxx4000 on 30-MAR-26.Thank you.';
      const parsed = defaultParserOrchestrator.parse(msg, 'AD-ICICIB');

      expect(parsed?.amount).toBe(35115.90);
      expect(parsed?.bank).toBe('ICICI');
      expect(parsed?.account).toBe('4000');
      expect(parsed?.transactionType).toBe('credit');
    });
  });

  describe('Future Providers Extensibility Without Code Changes', () => {
    it('supports dynamically registering a new digital bank / fintech provider via config', () => {
      // Add custom NeoBank / Provider dynamically without modifying any code
      configManager.addBankRule({
        id: 'jupiter',
        name: 'Jupiter Money',
        senderKeywords: ['JUPITR', 'JUPTR'],
        bodyKeywords: ['JUPITER MONEY', 'JUPITER ACCOUNT'],
        accountPrefixes: ['A/C'],
        balanceKeywords: ['AVL BAL'],
      });

      const msg = 'Jupiter Money: Rs. 1,250.00 debited from A/c XX8989 towards Zepto via UPI Ref 887766';
      const parsed = defaultParserOrchestrator.parse(msg, 'VM-JUPITR');

      expect(parsed?.amount).toBe(1250);
      expect(parsed?.bank).toBe('Jupiter Money');
      expect(parsed?.account).toBe('8989');
      expect(parsed?.normalizedMerchant).toBe('Zepto');
      expect(parsed?.category).toBe('Groceries');
    });
  });
});
