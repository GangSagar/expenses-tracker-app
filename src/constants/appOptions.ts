export const EXPENSE_CATEGORIES = [
  'Food & Dining',
  'Travel',
  'Shopping',
  'Groceries',
  'Bills & Recharge',
  'Entertainment',
  'Health',
  'Finance',
  'Education',
  'Self-transfers',
  'Transfers',
  'Games',
  'Other',
] as const;

export const INCOME_CATEGORIES = [
  'Bank Deposit',
  'Business',
  'Interest',
  'A/C Transfer',
  'Bill Payment',
  'Credit',
  'Investment',
  'Loan',
  'Recharge',
  'Refund',
  'Reimbursement',
  'Rewards',
  'Salary',
  'Other',
] as const;

export const CATEGORIES = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];
export type IncomeCategory = typeof INCOME_CATEGORIES[number];
export type Category = ExpenseCategory | IncomeCategory;

export const PAYMENT_MODES = [
  'upi',
  'cc',
  'wallet',
  'cash',
  'unknown',
] as const;
