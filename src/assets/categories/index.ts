import { ImageSourcePropType } from 'react-native';

export type CategoryPartition = 'expense' | 'income';

export interface CategoryTheme {
  primary: string;
  secondary: string;
  cardBg: string;
}

export const CATEGORY_ICONS = {
  expense: {
    'Food & Dining': require('./icons/expense/food_dining.png'),
    Travel: require('./icons/expense/travel.png'),
    Shopping: require('./icons/expense/shopping.png'),
    Groceries: require('./icons/expense/groceries.png'),
    'Bills & Recharge': require('./icons/expense/bills_recharge.png'),
    Entertainment: require('./icons/expense/entertainment.png'),
    Health: require('./icons/expense/health.png'),
    Finance: require('./icons/expense/finance.png'),
    Education: require('./icons/expense/education.png'),
    'Self-transfers': require('./icons/expense/self_transfers.png'),
    Transfers: require('./icons/expense/transfers.png'),
    Games: require('./icons/expense/games.png'),
    Other: require('./icons/expense/other.png'),
  } as Record<string, ImageSourcePropType>,
  income: {
    'Bank Deposit': require('./icons/income/bank_deposit.png'),
    Business: require('./icons/income/business.png'),
    Interest: require('./icons/income/interest.png'),
    'A/C Transfer': require('./icons/income/ac_transfer.png'),
    'Bill Payment': require('./icons/income/bill_payment.png'),
    Credit: require('./icons/income/credit.png'),
    Investment: require('./icons/income/investment.png'),
    Loan: require('./icons/income/loan.png'),
    Recharge: require('./icons/income/recharge.png'),
    Refund: require('./icons/income/refund.png'),
    Reimbursement: require('./icons/income/reimbursement.png'),
    Rewards: require('./icons/income/rewards.png'),
    Salary: require('./icons/income/salary.png'),
    Other: require('./icons/income/other.png'),
  } as Record<string, ImageSourcePropType>,
};

export const CATEGORY_BACKGROUNDS = {
  expense: {
    'Food & Dining': require('./bg/expense/food_dining.png'),
    Travel: require('./bg/expense/travel.png'),
    Shopping: require('./bg/expense/shopping.png'),
    Groceries: require('./bg/expense/groceries.png'),
    'Bills & Recharge': require('./bg/expense/bills_recharge.png'),
    Entertainment: require('./bg/expense/entertainment.png'),
    Health: require('./bg/expense/health.png'),
    Finance: require('./bg/expense/finance.png'),
    Education: require('./bg/expense/education.png'),
    'Self-transfers': require('./bg/expense/self_transfers.png'),
    Transfers: require('./bg/expense/transfers.png'),
    Games: require('./bg/expense/games.png'),
    Other: require('./bg/expense/other.png'),
  } as Record<string, ImageSourcePropType>,
  income: {
    'Bank Deposit': require('./bg/income/bank_deposit.png'),
    Business: require('./bg/income/business.png'),
    Interest: require('./bg/income/interest.png'),
    'A/C Transfer': require('./bg/income/ac_transfer.png'),
    'Bill Payment': require('./bg/income/bill_payment.png'),
    Credit: require('./bg/income/credit.png'),
    Investment: require('./bg/income/investment.png'),
    Loan: require('./bg/income/loan.png'),
    Recharge: require('./bg/income/recharge.png'),
    Refund: require('./bg/income/refund.png'),
    Reimbursement: require('./bg/income/reimbursement.png'),
    Rewards: require('./bg/income/rewards.png'),
    Salary: require('./bg/income/salary.png'),
    Other: require('./bg/income/other.png'),
  } as Record<string, ImageSourcePropType>,
};

export const CATEGORY_THEMES = {
  expense: {
    'Food & Dining': { primary: '#E64A19', secondary: '#FFA000', cardBg: '#E64A19' },
    Travel: { primary: '#0288D1', secondary: '#00E5FF', cardBg: '#0288D1' },
    Shopping: { primary: '#7B1FA2', secondary: '#FF4081', cardBg: '#7B1FA2' },
    Groceries: { primary: '#2E7D32', secondary: '#81C784', cardBg: '#2E7D32' },
    'Bills & Recharge': { primary: '#E65100', secondary: '#FFD54F', cardBg: '#E65100' },
    Entertainment: { primary: '#C2185B', secondary: '#FF80AB', cardBg: '#C2185B' },
    Health: { primary: '#C62828', secondary: '#FF8A80', cardBg: '#C62828' },
    Finance: { primary: '#283593', secondary: '#5C6BC0', cardBg: '#283593' },
    Education: { primary: '#1565C0', secondary: '#64B5F6', cardBg: '#1565C0' },
    'Self-transfers': { primary: '#37474F', secondary: '#90A4AE', cardBg: '#37474F' },
    Transfers: { primary: '#D84315', secondary: '#FF8A65', cardBg: '#D84315' },
    Games: { primary: '#4A148C', secondary: '#BA68C8', cardBg: '#4A148C' },
    Other: { primary: '#424242', secondary: '#9E9E9E', cardBg: '#424242' },
  } as Record<string, CategoryTheme>,
  income: {
    'Bank Deposit': { primary: '#004D40', secondary: '#26A69A', cardBg: '#004D40' },
    Business: { primary: '#1B5E20', secondary: '#66BB6A', cardBg: '#1B5E20' },
    Interest: { primary: '#E65100', secondary: '#FFD700', cardBg: '#E65100' },
    'A/C Transfer': { primary: '#006064', secondary: '#4DD0E1', cardBg: '#006064' },
    'Bill Payment': { primary: '#00838F', secondary: '#80DEEA', cardBg: '#00838F' },
    Credit: { primary: '#00796B', secondary: '#00E676', cardBg: '#00796B' },
    Investment: { primary: '#1A237E', secondary: '#7986CB', cardBg: '#1A237E' },
    Loan: { primary: '#3E2723', secondary: '#A1887F', cardBg: '#3E2723' },
    Recharge: { primary: '#00838F', secondary: '#00E5FF', cardBg: '#00838F' },
    Refund: { primary: '#00695C', secondary: '#4DB6AC', cardBg: '#00695C' },
    Reimbursement: { primary: '#33691E', secondary: '#AED581', cardBg: '#33691E' },
    Rewards: { primary: '#FF6F00', secondary: '#FFE082', cardBg: '#FF6F00' },
    Salary: { primary: '#053B18', secondary: '#00C853', cardBg: '#053B18' },
    Other: { primary: '#263238', secondary: '#78909C', cardBg: '#263238' },
  } as Record<string, CategoryTheme>,
};

function normalizePartition(type?: string): CategoryPartition {
  if (type === 'credit' || type === 'income') {
    return 'income';
  }
  return 'expense';
}

/**
 * Returns the dedicated category icon image asset based on category name and transaction direction.
 */
export function getCategoryIcon(
  category: string,
  type: 'debit' | 'credit' | 'expense' | 'income' = 'debit',
): ImageSourcePropType {
  const partition = normalizePartition(type);
  const partitionIcons = CATEGORY_ICONS[partition];
  return partitionIcons[category] || partitionIcons.Other;
}

/**
 * Returns the dedicated 350x500 category background card image asset based on category name and transaction direction.
 */
export function getCategoryBg(
  category: string,
  type: 'debit' | 'credit' | 'expense' | 'income' = 'debit',
): ImageSourcePropType {
  const partition = normalizePartition(type);
  const partitionBgs = CATEGORY_BACKGROUNDS[partition];
  return partitionBgs[category] || partitionBgs.Other;
}

/**
 * Returns the color palette theme associated with a category and transaction direction.
 */
export function getCategoryTheme(
  category: string,
  type: 'debit' | 'credit' | 'expense' | 'income' = 'debit',
): CategoryTheme {
  const partition = normalizePartition(type);
  const partitionThemes = CATEGORY_THEMES[partition];
  return partitionThemes[category] || partitionThemes.Other;
}

/**
 * Returns the primary theme color for a category and transaction direction.
 */
export function getCategoryColor(
  category: string,
  type: 'debit' | 'credit' | 'expense' | 'income' = 'debit',
): string {
  return getCategoryTheme(category, type).primary;
}
