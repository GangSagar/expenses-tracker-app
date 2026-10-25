import { SQLiteTransactionRepository } from '../../database/SQLiteTransactionRepository';
import { TransactionStorage } from '../../core/transactions/contracts';

/** Composition point: application services receive ports, not SQLite modules. */
export const transactionStorage: TransactionStorage = new SQLiteTransactionRepository();
