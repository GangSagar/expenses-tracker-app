import fs from 'fs';
import path from 'path';
import { parseMessage } from '../core/parser/parseMessage';

const fixturesPath = path.join(__dirname, '__fixtures__/collected-real-samples.json');
const hasFixtures = fs.existsSync(fixturesPath);
const collectedSamples: Array<{ message: string; expected: any }> = hasFixtures
  ? JSON.parse(fs.readFileSync(fixturesPath, 'utf8'))
  : [];

const describeSuite = hasFixtures && collectedSamples.length > 0 ? describe : describe.skip;

describeSuite('Real Collected Phone Messages Test Suite', () => {
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
