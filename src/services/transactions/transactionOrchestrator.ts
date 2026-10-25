import { processIncomingMessage, IncomingMessage } from '../messaging/messageService';
import { processTransaction, ProcessedExpense } from './transactionDecisionService';

export interface OrchestratorResult {
  processedExpense: ProcessedExpense;
}

/** Async entry point: collect input evidence, parse, then invoke the policy once. */
export async function orchestrateTransaction(
  message: IncomingMessage,
): Promise<OrchestratorResult> {
  const analysis = await processIncomingMessage(message);
  return { processedExpense: processTransaction(analysis) };
}
