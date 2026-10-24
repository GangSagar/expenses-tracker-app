import { ParsedTransaction, TransactionSource } from '../types/expense';
import {
  parseMessage,
  isTransactionalSender,
  isTransactionMessage,
} from '../core/parser';
import { normalizeUnicodeText } from '../utils/formatHelpers';
import { isSpam } from '../core/classifier/spamClassifier';
import { telemetry } from './telemetryService';

export interface IncomingMessage {
  body: string;
  sender: string;
  source: TransactionSource;
  packageName?: string;
}

export function processIncomingMessage(
  message: IncomingMessage,
): ParsedTransaction | null {
  const span = telemetry.startSpan('sms.process_pipeline', {
    source: message.source,
    sender: message.sender,
  });

  const cleanSender = normalizeUnicodeText(message.sender || '');
  const cleanBody = normalizeUnicodeText(message.body || '');

  console.log(`\n=== Processing Message from ${cleanSender} ===`);

  // Step 1: Filter by sender (for SMS)
  if (message.source === 'sms' && !isTransactionalSender(cleanSender)) {
    console.log(
      `❌ Dropped: Sender ${cleanSender} is not recognized as a transactional sender.`,
    );
    span.setAttribute('dropped', true);
    span.setAttribute('drop_reason', 'non_transactional_sender');
    span.end();
    return null;
  }

  // Step 2: Filter non-transaction messages
  if (!isTransactionMessage(cleanBody)) {
    console.log(
      `❌ Dropped: Message body matched a block filter (like OTP, Login, or pure Promo/Balance).`,
    );
    console.log(`Raw Body: ${cleanBody}`);
    span.setAttribute('dropped', true);
    span.setAttribute('drop_reason', 'blocked_body_filter');
    span.end();
    return null;
  }

  // Step 3: Early spam check — cheaper than regex parsing; model is a no-op until trained
  if (isSpam(cleanBody)) {
    console.log(`❌ Dropped: Bayesian spam classifier rejected message early.`);
    span.setAttribute('dropped', true);
    span.setAttribute('drop_reason', 'spam_classifier');
    span.end();
    return null;
  }

  // Step 4: Parse the message
  const parsed = parseMessage(cleanBody, cleanSender, message.source);

  // Step 5: Must have an amount to be a valid transaction
  if (parsed.amount === null) {
    console.log(`❌ Dropped: Could not extract an AMOUNT from the message.`);
    span.setAttribute('dropped', true);
    span.setAttribute('drop_reason', 'missing_amount');
    span.end();
    return null;
  }

  console.log(`✅ Message passed filters and amount extracted successfully.`);
  span.setAttribute('dropped', false);
  span.setAttribute('amount', parsed.amount);
  span.setAttribute('bank', parsed.bank || 'unknown');
  span.setAttribute('type', parsed.transactionType);
  span.setAttribute('mode', parsed.paymentMode);
  span.end();
  return parsed;
}

