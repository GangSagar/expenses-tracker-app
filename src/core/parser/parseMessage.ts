import { TransactionSource, ParsedTransaction } from '../../types/expense';
import { defaultParserOrchestrator, ParserOrchestrator } from './orchestrator';
import { toParsedTransaction, StructuredExpense } from './models';

/**
 * Main entry point for parsing transactional messages.
 * Uses the extensible, modular ParserOrchestrator under the hood while
 * preserving complete backwards compatibility with existing app interfaces.
 *
 * @param message Raw SMS or notification text
 * @param sender Sender address or package name (e.g. JD-HDFCBK)
 * @param source Message source ('sms' | 'notification' | 'manual')
 * @returns ParsedTransaction compatible with database and application state
 */
export function parseMessage(
  message: string,
  sender: string = '',
  source: TransactionSource = 'sms',
): ParsedTransaction {
  const structured = defaultParserOrchestrator.parse(message, sender, source);
  if (!structured) {
    return {
      amount: null,
      merchant: null,
      alias: null,
      transactionType: 'debit',
      paymentMode: 'unknown',
      account: null,
      rawMessage: message,
      source,
      timestamp: Date.now(),
    };
  }

  return toParsedTransaction(structured);
}

/**
 * Returns the full StructuredExpense object containing confidence breakdowns,
 * confirmation flags, and normalized entities.
 */
export function parseStructured(
  message: string,
  sender: string = '',
  source: TransactionSource = 'sms',
): StructuredExpense | null {
  return defaultParserOrchestrator.parse(message, sender, source);
}

export { ParserOrchestrator };
