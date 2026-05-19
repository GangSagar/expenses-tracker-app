import { orchestrateTransaction } from '../services/transactionOrchestrator';
import { IncomingMessage } from '../services/messageService';

// Mock the two pipeline stages so the orchestrator test stays unit-level
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

const fakeParsed = {
  amount: 500,
  bank: 'HDFC',
  account: 'XX1234',
  rawMessage: fakeMessage.body,
  source: 'sms' as const,
};

const fakeProcessedExpense = {
  expense: { amount: 500, rawMessage: fakeMessage.body } as any,
  decision: 'auto_save' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('orchestrateTransaction', () => {
  it('returns a result containing processedExpense when pipeline succeeds', () => {
    processIncomingMessage.mockReturnValue(fakeParsed);
    processTransaction.mockReturnValue(fakeProcessedExpense);

    const result = orchestrateTransaction(fakeMessage);

    expect(processIncomingMessage).toHaveBeenCalledWith(fakeMessage);
    expect(processTransaction).toHaveBeenCalledWith(fakeParsed);
    expect(result).not.toBeNull();
    expect(result?.processedExpense).toBe(fakeProcessedExpense);
  });

  it('returns null when messageService drops the message (non-transactional or spam)', () => {
    processIncomingMessage.mockReturnValue(null);

    const result = orchestrateTransaction(fakeMessage);

    expect(result).toBeNull();
    expect(processTransaction).not.toHaveBeenCalled();
  });

  it('returns null when expenseService cannot process the parsed transaction', () => {
    processIncomingMessage.mockReturnValue(fakeParsed);
    processTransaction.mockReturnValue(null);

    const result = orchestrateTransaction(fakeMessage);

    expect(result).toBeNull();
  });
});
