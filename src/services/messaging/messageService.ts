import { TransactionSource } from '../../types/expense';
import { StructuredExpense } from '../../core/parser/models';
import {
  isTransactionalSender,
  isTransactionMessage,
} from '../../core/parser';
import { normalizeUnicodeText } from '../../utils/formatHelpers';
import { TransactionRejectionReason } from '../../core/transactions/contracts';
import { parserOrchestrator, spamClassifier, telemetry } from '../../app/composition';
import { ParseExecutionContext } from '../../core/parser/ai/AIExtractionProposal';

export interface IncomingMessage {
  body: string;
  sender: string;
  source: TransactionSource;
  packageName?: string;
  timestamp?: number;
}

/** Facts collected at the input boundary; this module does not choose an outcome. */
export interface IncomingTransactionAnalysis {
  message: IncomingMessage;
  normalizedBody: string;
  normalizedSender: string;
  parsed: StructuredExpense | null;
  rejectionSignals: TransactionRejectionReason[];
}

export async function processIncomingMessage(
  message: IncomingMessage,
  context: ParseExecutionContext = 'live_background',
): Promise<IncomingTransactionAnalysis> {
  const span = telemetry.startSpan('sms.process_pipeline', {
    source: message.source,
    sender: message.sender,
  });
  const normalizedSender = normalizeUnicodeText(message.sender || '');
  const normalizedBody = normalizeUnicodeText(message.body || '');
  const rejectionSignals: TransactionRejectionReason[] = [];
  let parsed: StructuredExpense | null = null;

  if (message.source === 'sms' && !isTransactionalSender(normalizedSender)) {
    rejectionSignals.push('non_transactional_sender');
  } else if (!isTransactionMessage(normalizedBody)) {
    rejectionSignals.push('blocked_message');
  } else if (spamClassifier.isSpam(normalizedBody)) {
    rejectionSignals.push('spam');
  } else {
    parsed = await parserOrchestrator.parseAsync(normalizedBody, normalizedSender, message.source, context);
    if (!parsed || !Number.isFinite(parsed.amount) || parsed.amount <= 0) {
      rejectionSignals.push('missing_amount');
      parsed = null;
    }
  }

  span.setAttribute('dropped', rejectionSignals.length > 0);
  if (rejectionSignals.length > 0) {
    span.setAttribute('drop_reason', rejectionSignals[0]);
  }
  if (parsed) {
    span.setAttribute('amount', parsed.amount);
    span.setAttribute('bank', parsed.bank || 'unknown');
    span.setAttribute('type', parsed.transactionType);
    span.setAttribute('payment_mode', parsed.paymentMode);
  }
  span.end();

  return {
    message,
    normalizedBody,
    normalizedSender,
    parsed,
    rejectionSignals,
  };
}
