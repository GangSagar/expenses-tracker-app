import { defaultNormalizer } from '../../core/parser/normalizer';
import {
  amountExtractor,
  accountExtractor,
  vpaExtractor,
  referenceExtractor,
  balanceExtractor,
  bankExtractor,
  paymentModeExtractor,
  rawMerchantExtractor,
  defaultEntityExtractor,
} from '../../core/parser/extractor';

describe('Entity Extractor Modules', () => {
  describe('AmountExtractor', () => {
    it('extracts comma formatted Indian currency amounts', () => {
      const msg = defaultNormalizer.normalize('Rs. 1,50,000.75 debited from account');
      const amount = amountExtractor.extract(msg);
      expect(amount?.value).toBe(150000.75);
      expect(amount?.currency).toBe('₹');
      expect(amount?.confidence).toBeGreaterThanOrEqual(0.95);
    });

    it('does not confuse balance for transaction amount', () => {
      const msg = defaultNormalizer.normalize('Rs. 50 spent. Avl Bal Rs. 10,000');
      const amount = amountExtractor.extract(msg);
      expect(amount?.value).toBe(50);
    });
  });

  describe('AccountExtractor', () => {
    it('extracts XX masked accounts', () => {
      const msg = defaultNormalizer.normalize('debited from A/c XX1234');
      const acct = accountExtractor.extract(msg);
      expect(acct?.accountNumber).toBe('1234');
      expect(acct?.accountType).toBe('account');
    });

    it('extracts card numbers ending in 4 digits', () => {
      const msg = defaultNormalizer.normalize('using ICICI Card ending 4321');
      const acct = accountExtractor.extract(msg);
      expect(acct?.accountNumber).toBe('4321');
      expect(acct?.accountType).toBe('card');
    });
  });

  describe('VpaExtractor', () => {
    it('extracts standard UPI handles and flags phone numbers', () => {
      const phoneMsg = defaultNormalizer.normalize('Cr. to 8543851508@ybl');
      const phoneVpa = vpaExtractor.extract(phoneMsg);
      expect(phoneVpa?.vpa).toBe('8543851508@ybl');
      expect(phoneVpa?.isPhoneNumber).toBe(true);

      const namedMsg = defaultNormalizer.normalize('paid to swiggy@icici');
      const namedVpa = vpaExtractor.extract(namedMsg);
      expect(namedVpa?.username).toBe('swiggy');
      expect(namedVpa?.isPhoneNumber).toBe(false);
    });
  });

  describe('ReferenceExtractor', () => {
    it('extracts UTR, RRN, and Txn references', () => {
      const msg = defaultNormalizer.normalize('Ref:619719384932 AvlBal:Rs100');
      expect(referenceExtractor.extract(msg)).toBe('619719384932');

      const upiMsg = defaultNormalizer.normalize('UPI Ref no 650422642065');
      expect(referenceExtractor.extract(upiMsg)).toBe('650422642065');
    });
  });

  describe('BalanceExtractor', () => {
    it('extracts AvlBal, Clr Bal, and Available Limit', () => {
      const bobMsg = defaultNormalizer.normalize('AvlBal: Rs1015.58 - BOB');
      expect(balanceExtractor.extract(bobMsg)).toBe(1015.58);

      const psbMsg = defaultNormalizer.normalize('CLR BAL 100120CR');
      expect(balanceExtractor.extract(psbMsg)).toBe(100120);

      const limitMsg = defaultNormalizer.normalize('Avl Limit: INR 20,990.88');
      expect(balanceExtractor.extract(limitMsg)).toBe(20990.88);
    });
  });

  describe('BankExtractor', () => {
    it('identifies bank from sender header with top priority', () => {
      const msg = defaultNormalizer.normalize('Rs. 500 debited from A/C XX1234');
      expect(bankExtractor.extract('JD-HDFCBK', msg)).toBe('HDFC');
      expect(bankExtractor.extract('VK-SBIIND', msg)).toBe('SBI');
      expect(bankExtractor.extract('AD-ICICIB', msg)).toBe('ICICI');
    });

    it('identifies bank from body signature without being fooled by recipient VPA', () => {
      const bobMsg = defaultNormalizer.normalize(
        'Rs.149.00 Dr. from A/C XXXXXX9132 and Cr. to playstore@axisbank. Ref:841377052636. Call 18005700/5000-BOB'
      );
      // Sender is empty, recipient has @axisbank, but user account bank is BOB!
      expect(bankExtractor.extract('', bobMsg)).toBe('Bank of Baroda');
    });

    it('identifies registered banks from sender header or body', () => {
      const hsbcMsg = defaultNormalizer.normalize(
        'HSBC: Rs 25.0 spent on your HSBC Credit Card ending 7285 at INSTANT RETAIL INDIA LIMITED on 29 Sep 2026 through UPI: 663842600301.'
      );
      expect(bankExtractor.extract('D-HSBCIN-S', hsbcMsg)).toBe('HSBC');
      // Even without sender header
      expect(bankExtractor.extract('', hsbcMsg)).toBe('HSBC');

      const kblMsg = defaultNormalizer.normalize('Rs 500 debited from A/C 1234');
      expect(bankExtractor.extract('AX-KBLBNK-S', kblMsg)).toBe('Karnataka Bank');
    });

    it('extracts banks dynamically from universal linguistic grammar patterns', () => {
      const chaseMsg = defaultNormalizer.normalize('USD 45.00 spent on Chase Bank debit card ending 1234 at WALMART');
      expect(bankExtractor.extract('', chaseMsg)).toBe('Chase Bank');

      const mercuryMsg = defaultNormalizer.normalize('USD 250 paid using Mercury Card ending 9876');
      expect(bankExtractor.extract('', mercuryMsg)).toBe('Mercury');

      const irelandMsg = defaultNormalizer.normalize('EUR 10.00 debited from Bank of Ireland account');
      expect(bankExtractor.extract('', irelandMsg)).toBe('Bank of Ireland');
    });
  });

  describe('PaymentModeExtractor', () => {
    it('identifies UPI, Credit Card, and Wallets correctly', () => {
      expect(paymentModeExtractor.extract(defaultNormalizer.normalize('via UPI ref 123'))).toBe('upi');
      expect(paymentModeExtractor.extract(defaultNormalizer.normalize('paid from Paytm Wallet'))).toBe('wallet');
      expect(paymentModeExtractor.extract(defaultNormalizer.normalize('spent on Credit Card XX4000'))).toBe('cc');
      expect(paymentModeExtractor.extract(defaultNormalizer.normalize('using ICICI Bank Card Avl Limit: INR 5000'))).toBe('cc');
    });
  });

  describe('RawMerchantExtractor', () => {
    it('extracts merchants from spent at, paid to, and directional targets', () => {
      const msg1 = defaultNormalizer.normalize('Rs. 500 spent at STARBUCKS INDIA on 15-May');
      expect(rawMerchantExtractor.extract(msg1)).toBe('STARBUCKS INDIA');

      const msg2 = defaultNormalizer.normalize('paid to Uber via UPI');
      expect(rawMerchantExtractor.extract(msg2)).toBe('Uber');

      const msg3 = defaultNormalizer.normalize('UPI/CR/534765332543/GANGA SAGAR/BARB/7930010000');
      expect(rawMerchantExtractor.extract(msg3)).toBe('GANGA SAGAR');
    });

    it('stops merchant candidate extraction before through, thru, or thro payment prepositions', () => {
      const msg = defaultNormalizer.normalize(
        'HSBC: Rs 25.0 spent on your HSBC Credit Card ending 7285 at INSTANT RETAIL INDIA LIMITED on 29 Sep 2026 through UPI: 663842600301. Trxn. not done by you? Call 18002673456.'
      );
      expect(rawMerchantExtractor.extract(msg)).toBe('INSTANT RETAIL INDIA LIMITED');

      const msgThru = defaultNormalizer.normalize(
        'Rs 100 spent at BLUE TOKAI COFFEE thru UPI ref 12345'
      );
      expect(rawMerchantExtractor.extract(msgThru)).toBe('BLUE TOKAI COFFEE');
    });
  });

  describe('Composite EntityExtractor', () => {
    it('extracts all entities in a single structured pass', () => {
      const msg = defaultNormalizer.normalize(
        'Rs.450.00 spent on HDFC Bank Card xx1234 at AMAZON on 15-05-26 Ref 998877'
      );
      const entities = defaultEntityExtractor.extract(msg, 'JD-HDFCBK');

      expect(entities.amount?.value).toBe(450);
      expect(entities.bank).toBe('HDFC');
      expect(entities.account?.accountNumber).toBe('1234');
      expect(entities.rawMerchant).toBe('AMAZON');
      expect(entities.paymentMode).toBe('unknown');
      expect(entities.referenceNumber).toBe('998877');
    });
  });
});
