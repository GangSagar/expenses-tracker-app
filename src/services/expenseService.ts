import { Expense, ParsedTransaction } from '../types/expense';
import { classify } from '../core/classifier';
import { calculateConfidence } from '../core/confidence';
import { isDuplicate } from '../core/dedup';
import { insertExpense, getRecentExpenses } from '../database/expenseRepo';

export type ExpenseDecision = 'auto_save' | 'show_popup' | 'discard';

export interface ProcessedExpense {
  expense: Omit<Expense, 'id'>;
  decision: ExpenseDecision;
}

export function processTransaction(
  parsed: ParsedTransaction,
): ProcessedExpense | null {
  if (parsed.amount === null) {
    return null;
  }

  // Classify
  const classification = classify(parsed.alias, parsed.rawMessage);

  // Calculate confidence
  const confidence = calculateConfidence(parsed, classification);

  // Determine decision
  let decision: ExpenseDecision;
  if (confidence < 0.5) {
    decision = 'discard';
  } else if (confidence >= 0.8) {
    decision = 'auto_save';
  } else {
    decision = 'show_popup';
  }

  const expense: Omit<Expense, 'id'> = {
    amount: parsed.amount,
    merchant: parsed.merchant || 'Unknown',
    alias: parsed.alias || undefined,
    category: classification.category,
    confidence,
    timestamp: parsed.timestamp,
    source: parsed.source,
    rawMessage: parsed.rawMessage,
    transactionType: parsed.transactionType,
    account: parsed.account || undefined,
    bank: parsed.bank,
    paymentMode: parsed.paymentMode,
    isDuplicate: false,
    availableBalance: parsed.availableBalance,
  };

  return { expense, decision };
}

export function saveExpense(expense: Omit<Expense, 'id'>): number | null {
  // Check for duplicates
  const recent = getRecentExpenses(5);
  if (isDuplicate(expense, recent)) {
    return null;
  }

  return insertExpense(expense);
}
