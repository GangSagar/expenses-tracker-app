import { processIncomingMessage } from '../services/messaging/messageService';
import { processTransaction } from '../services/transactions/expenseService';
import { parseMessage } from '../core/parser/parseMessage';
import SANITIZED_SCENARIOS from './__fixtures__/sanitized-scenarios.json';

export interface SanitizedScenario {
  id: string;
  category: 'normal' | 'missing_fields' | 'misleading_amounts' | 'refunds' | 'ambiguous';
  description: string;
  sender: string;
  message: string;
  expectedParser: {
    amount: number | null;
    transactionType: 'debit' | 'credit' | null;
    merchant: string | null;
    category: string | null;
    account: string | null;
    bank: string | null;
    availableBalance: number | null;
    requiresConfirmation: boolean | null;
  } | null;
  expectedExtendedTransactionType?: string;
  expectedDecision: {
    kind: 'auto_save' | 'review' | 'reject';
    reason: string;
  };
  expectedCandidateCategory?: string;
}

const SCENARIOS: SanitizedScenario[] = SANITIZED_SCENARIOS as SanitizedScenario[];

describe('Sanitized Transaction Corpus Suite', () => {
  test('keeps a transfer debit when the message also says the payee was credited', () => {
    const parsed = parseMessage(
      'Bank account XX1234 debited for INR 60.00; SAMPLE MERCHANT credited. UPI reference 123456789012.',
      'BANK',
      'sms',
    );
    expect(parsed.transactionType).toBe('debit');
  });

  test.each(SCENARIOS)(
    '$id [$category]: $description',
    async (scenario) => {
      const analysis = await processIncomingMessage({
        body: scenario.message,
        sender: scenario.sender,
        source: 'sms',
      });
      const processed = processTransaction(analysis);

      // Verify Decision Policy Outcome
      expect(processed.decision.kind).toBe(scenario.expectedDecision.kind);
      expect(processed.decision.reason).toBe(scenario.expectedDecision.reason);

      // Verify Parser Extraction
      if (scenario.expectedParser === null) {
        expect(analysis.parsed).toBeNull();
        expect(processed.candidate).toBeNull();
      } else {
        expect(analysis.parsed).not.toBeNull();
        expect(processed.candidate).not.toBeNull();
        expect(analysis.parsed?.amount).toBe(scenario.expectedParser.amount);
        expect(analysis.parsed?.category).toBe(scenario.expectedParser.category);
        if (scenario.expectedExtendedTransactionType) {
          expect(analysis.parsed?.transactionType).toBe(scenario.expectedExtendedTransactionType);
        }
        expect(analysis.parsed?.bank ?? null).toBe(scenario.expectedParser.bank);
        expect(analysis.parsed?.account ?? null).toBe(scenario.expectedParser.account);
        expect(analysis.parsed?.availableBalance ?? null).toBe(scenario.expectedParser.availableBalance);
        expect(analysis.parsed?.requiresConfirmation).toBe(scenario.expectedParser.requiresConfirmation);
        expect(processed.candidate!.amount).toBe(scenario.expectedParser.amount);
        expect(processed.candidate!.transactionType).toBe(scenario.expectedParser.transactionType);
        expect(processed.candidate!.category).toBe(
          scenario.expectedCandidateCategory || scenario.expectedParser.category,
        );

        if (scenario.expectedParser.merchant !== null) {
          expect(analysis.parsed?.normalizedMerchant?.toLowerCase()).toBe(
            scenario.expectedParser.merchant.toLowerCase(),
          );
          expect(processed.candidate!.merchant?.toLowerCase()).toBe(
            scenario.expectedParser.merchant.toLowerCase()
          );
        }

        if (scenario.expectedParser.account !== null) {
          expect(processed.candidate!.account).toBe(scenario.expectedParser.account);
        }

      }
    }
  );
});
