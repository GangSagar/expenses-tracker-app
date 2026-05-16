export const CATEGORIES = [
  'Food & Dining',
  'Travel',
  'Shopping',
  'Groceries',
  'Bills & Recharge',
  'Entertainment',
  'Health',
  'Education',
  'Self-transfers',
  'Other',
] as const;

export const PAYMENT_MODES = [
  'upi',
  'cc',
  'wallet',
  'unknown',
] as const;

export const KNOWN_BANKS = [
  { name: 'HDFC', keywords: ['HDFC'] },
  { name: 'ICICI', keywords: ['ICICI'] },
  { name: 'SBI', keywords: ['SBI'] },
  { name: 'Axis', keywords: ['AXIS'] },
  { name: 'Kotak', keywords: ['KOTAK'] },
  { name: 'Bank of India', keywords: ['BOI', 'BANK OF INDIA'] },
  { name: 'Bank of Baroda', keywords: ['BOB', 'BANK OF BARODA'] },
  { name: 'PNB', keywords: ['PNB'] },
  { name: 'Punjab and Sind Bank', keywords: ['PSB', 'PUNJAB AND SIND', 'PUNJAB AND SIND BANK'] },
  { name: 'Yes Bank', keywords: ['YES'] },
  { name: 'IndusInd', keywords: ['INDUS'] },
  { name: 'Paytm Payments Bank', keywords: ['PAYTM'] },
] as const;
