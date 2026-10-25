/**
 * Normalizes different currency notations into a single canonical symbol.
 * Example: "Rs. 500", "INR 500", "inr500", "Rs500" -> "₹ 500"
 */
export function normalizeCurrency(text: string): string {
  if (!text) return '';

  let result = text;

  // Replace Indian Rupee variants: Rs., Rs, INR, inr with ₹
  // Handle cases like "Rs.500" -> "₹ 500", "INR 1,200" -> "₹ 1,200"
  result = result.replace(/\b(?:rs\.?|inr)\s*(?=\d)/gi, '₹ ');
  // Handle cases where currency precedes digits without space: e.g. "Rs500"
  result = result.replace(/\b(?:rs\.?|inr)(?=\d)/gi, '₹ ');
  // Ensure space after ₹ before digits if not present
  result = result.replace(/₹(?=\d)/g, '₹ ');

  return result;
}
