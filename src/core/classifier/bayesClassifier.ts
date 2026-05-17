/**
 * On-Device Bayesian SMS Spam & Transaction Classifier
 *
 * Implements a lightweight, high-performance token probability engine
 * to classify incoming SMS text as a genuine transactional alert or spam.
 * Leverages a sigmoid-scaled log-likelihood keyword weight vector.
 */

// Token weights representing transaction-indicative words (positive values)
// and promotional/marketing/spam-indicative words (negative values).
const TOKEN_WEIGHTS: Record<string, number> = {
  // Transaction Signals
  spent: 3.5,
  debited: 3.5,
  credited: 3.5,
  paid: 2.5,
  sent: 2.5,
  withdrawn: 3.0,
  received: 3.0,
  transfer: 2.0,
  transferred: 2.0,
  txn: 2.5,
  ref: 2.0,
  utr: 2.5,
  bal: 2.0,
  balance: 2.0,
  inr: 2.0,
  rs: 1.5,
  purchase: 2.0,
  charged: 1.5,
  deducted: 2.0,
  recharge: 0.5, // neutral-positive (can be bill transaction)

  // Spam, Promotional, & Plan Signals
  offer: -3.5,
  offers: -3.5,
  discount: -3.5,
  discounts: -3.5,
  flat: -2.0,
  win: -4.0,
  won: -4.0,
  prize: -4.0,
  lottery: -5.0,
  lotto: -5.0,
  loan: -3.5,
  loans: -3.5,
  apply: -2.0,
  applied: -2.0,
  bonus: -3.5,
  congrats: -4.0,
  congratulations: -4.0,
  free: -3.0,
  renew: -2.0,
  renewal: -2.0,
  voucher: -3.0,
  vouchers: -3.0,
  promo: -3.5,
  promocode: -3.5,
  gift: -2.5,
  cashback: -2.0,
  cashbacks: -2.0,
  click: -2.0,
  link: -2.5,
  spin: -3.0,
  interest: -1.5,
  'pre-approved': -3.5,
  preapproved: -3.5,
  instantly: -2.0,
  instant: -1.5,
  urgent: -1.5,
  hurry: -2.0,
  reward: -2.5,
  rewards: -2.5,
  points: -1.5,
  earn: -2.0,
  luck: -3.0,
  lucky: -3.0,
  creditcard: -1.5, // promo CC applications
};

/**
 * Tokenizes and normalizes an input string into a list of alphanumeric words.
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ') // Replace punctuation (except hyphens inside words) with spaces
    .split(/\s+/) // Split on any whitespace
    .filter(token => token.length > 1); // Keep tokens with at least 2 characters
}

/**
 * Classifies an SMS text using a sigmoid-scaled keyword likelihood model.
 *
 * @param body The raw SMS message body
 * @returns { isTransaction: boolean, confidence: number }
 */
export function classifySMS(body: string): { isTransaction: boolean; confidence: number } {
  const tokens = tokenize(body);
  if (tokens.length === 0) {
    return { isTransaction: false, confidence: 1.0 };
  }

  let totalScore = 0;
  let matchesCount = 0;

  // Evaluate the score of all matching tokens
  for (const token of tokens) {
    if (token in TOKEN_WEIGHTS) {
      totalScore += TOKEN_WEIGHTS[token];
      matchesCount++;
    }
  }

  // Base prior score: if there are no known tokens, default to a negative score (not transaction)
  if (matchesCount === 0) {
    return { isTransaction: false, confidence: 0.9 };
  }

  // Apply a Sigmoid function to map the score onto a [0, 1] probability range
  // P(X) = 1 / (1 + e^-score)
  const probability = 1 / (1 + Math.exp(-totalScore));

  const isTransaction = probability >= 0.5;
  const confidence = isTransaction ? probability : 1 - probability;

  return {
    isTransaction,
    confidence: Math.round(confidence * 100) / 100, // round to 2 decimal places
  };
}
