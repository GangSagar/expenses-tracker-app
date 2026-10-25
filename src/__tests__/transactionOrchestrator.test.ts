import { orchestrateTransaction } from '../services/transactionOrchestrator';
import { IncomingMessage } from '../services/messageService';

jest.mock('../services/messageService', () => ({
  processIncomingMessage: jest.fn(),
}));

jest.mock('../services/expenseService', () => ({
  processTransaction: jest.fn(),
}));

const { processIncomingMessage } = require('../services/messageService') as {
  processIncomingMessage: jest.Mock;
};
const { processTransaction } = require('../services/expenseService') as {
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
  decision: { kind: 'reject', reason: 'blocked_message' },
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

    expect(result.processedExpense.decision).toEqual({
      kind: 'reject',
      reason: 'blocked_message',
    });
  });
});
