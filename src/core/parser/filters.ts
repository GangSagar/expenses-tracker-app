import { defaultMessageFilter } from './filter';

/**
 * Validates whether an incoming sender ID qualifies as a transactional source.
 * Delegates directly to the canonical MessageFilter component.
 */
export function isTransactionalSender(sender: string): boolean {
  return defaultMessageFilter.isTransactionalSender(sender);
}

/**
 * Validates whether message content qualifies as an authentic financial transaction.
 * Delegates directly to the canonical MessageFilter component.
 */
export function isTransactionMessage(message: string): boolean {
  return defaultMessageFilter.filter(message).isTransaction;
}
