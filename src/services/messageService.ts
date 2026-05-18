import { ParsedTransaction, TransactionSource } from '../types/expense';
import {
  parseMessage,
  isTransactionalSender,
  isTransactionMessage,
} from '../core/parser';
import { normalizeUnicodeText } from '../utils/formatHelpers';

export interface IncomingMessage {
  body: string;
  sender: string;
  source: TransactionSource;
  packageName?: string;
}

export function processIncomingMessage(
  message: IncomingMessage,
): ParsedTransaction | null {
  const cleanSender = normalizeUnicodeText(message.sender || '');
  const cleanBody = normalizeUnicodeText(message.body || '');

  console.log(`\n=== Processing Message from ${cleanSender} ===`);
  
  // Step 1: Filter by sender (for SMS)
  if (message.source === 'sms' && !isTransactionalSender(cleanSender)) {
    console.log(`❌ Dropped: Sender ${cleanSender} is not recognized as a transactional sender.`);
    return null;
  }

  // Step 2: Filter non-transaction messages
  if (!isTransactionMessage(cleanBody)) {
    console.log(`❌ Dropped: Message body matched a block filter (like OTP, Login, or pure Promo/Balance).`);
    console.log(`Raw Body: ${cleanBody}`);
    return null;
  }

  // Step 3: Parse the message
  const parsed = parseMessage(cleanBody, cleanSender, message.source);

  // Step 4: Must have an amount to be a valid transaction
  if (parsed.amount === null) {
    console.log(`❌ Dropped: Could not extract an AMOUNT from the message.`);
    return null;
  }

  console.log(`✅ Message passed filters and amount extracted successfully.`);
  return parsed;
}
