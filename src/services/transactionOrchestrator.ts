import { processIncomingMessage, IncomingMessage } from './messageService';
import { processTransaction, ProcessedExpense } from './expenseService';

export interface OrchestratorResult {
  processedExpense: ProcessedExpense;
}

/**
 * TransactionOrchestrator — single entry point for the full processing pipeline.
 *
 * Sequences:  messageService.processIncomingMessage()
 *          →  expenseService.processTransaction()
 *
 * Replaces the ad-hoc dual-call pattern that previously lived in useMessageListener.
 */
export function orchestrateTransaction(
  message: IncomingMessage,
): OrchestratorResult | null {
  // Step 1: Filter, spam-check, parse → ParsedTransaction
  const parsed = processIncomingMessage(message);
  if (!parsed) return null;

  // Step 2: Classify, score confidence, decide route
  const result = processTransaction(parsed);
  if (!result) return null;

  return { processedExpense: result };
}
