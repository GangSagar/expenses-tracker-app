import { parseMessage } from '../core/parser/parseMessage';
import collectedSamples from './__fixtures__/collected-real-samples.json';

describe('Real Collected Phone Messages Test Suite', () => {
  test.each(collectedSamples)(
    'parses real message: "$message"',
    ({ message, expected }) => {
      const result = parseMessage(message, '', 'sms');
      if (expected.amount > 0) {
        expect(result.amount).toBe(expected.amount);
      }
      if (expected.transactionType) {
        expect(result.transactionType).toBe(expected.transactionType);
      }
      if (expected.bank) {
        expect(result.bank).toBe(expected.bank);
      }
      if (expected.account) {
        expect(result.account).toBe(expected.account);
      }
    }
  );
});
