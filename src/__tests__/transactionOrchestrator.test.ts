import { orchestrateTransaction } from '../services/transactions/transactionOrchestrator';
import { IncomingMessage } from '../services/messaging/messageService';

jest.mock('../services/messaging/messageService', () => ({
  processIncomingMessage: jest.fn(),
}));

jest.mock('../services/transactions/transactionDecisionService', () => ({
  processTransaction: jest.fn(),
}));

const { processIncomingMessage } = require('../services/messaging/messageService') as {
  processIncomingMessage: jest.Mock;
};
const { processTransaction } = require('../services/transactions/transactionDecisionService') as {
  processTransaction: jest.Mock;
};

const fakeMessage: IncomingMessage = {
  sender: 'HDFCBK',
  body: 'Rs.500 debited from A/c XX1234. Available balance: Rs.10000.',
  source: 'sms',
};

const fakeAnalysis = { parsed: null, rejectionSignals: ['blocked_message'] };
const fakeProcessedExpense = {
  candidate: null,
  decision: {
    kind: 'reject', reason: 'blocked_message',
    evidence: { policyVersion: '1.0.0' },
  },
  repaymentUpdates: [],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('orchestrateTransaction', () => {
  it('collects input evidence then invokes the decision service once', async () => {
    processIncomingMessage.mockResolvedValue(fakeAnalysis);
    processTransaction.mockReturnValue(fakeProcessedExpense);

    const result = await orchestrateTransaction(fakeMessage);

    expect(processIncomingMessage).toHaveBeenCalledWith(fakeMessage);
    expect(processTransaction).toHaveBeenCalledWith(fakeAnalysis);
    expect(processTransaction).toHaveBeenCalledTimes(1);
    expect(result.processedExpense).toBe(fakeProcessedExpense);
  });

  it('returns a typed policy rejection rather than dropping rejected input', async () => {
    processIncomingMessage.mockResolvedValue(fakeAnalysis);
    processTransaction.mockReturnValue(fakeProcessedExpense);

    const result = await orchestrateTransaction(fakeMessage);

    expect(result.processedExpense.decision).toMatchObject({
      kind: 'reject',
      reason: 'blocked_message',
    });
    expect(result.processedExpense.decision.evidence.policyVersion).toBeTruthy();
  });
});
