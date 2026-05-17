/**
 * Formats a raw number into a clean, localized Indian Rupee currency representation.
 */
export function formatAmount(amount: number): string {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const formatted = absAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${isNegative ? '-' : ''}₹${formatted}`;
}

/**
 * Returns premium thematic colors for standard transaction categories.
 */
export function getCategoryColor(category: string, index: number): string {
  const colors = ['#34a853', '#fbbc05', '#ea4335', '#9c27b0', '#00bcd4'];
  if (category === 'Food & Dining') return '#34a853';
  if (category === 'Shopping') return '#9c27b0';
  if (category === 'Travel') return '#fbbc05';
  if (category === 'Games') return '#e91e63';
  return colors[index % colors.length];
}

/**
 * Returns stunning dual-gradient bank card background colors.
 */
export function getBankColor(bankName: string): string[] {
  const upper = (bankName || '').toUpperCase();
  if (upper.includes('HDFC')) return ['#1a73e8', '#0d47a1'];
  if (upper.includes('BARODA') || upper.includes('BOB')) return ['#ff9900', '#e65100'];
  if (upper.includes('INDIA') || upper.includes('BOI')) return ['#008080', '#004d40'];
  if (upper.includes('ICICI')) return ['#ff6600', '#bf360c'];
  if (upper.includes('SIND') || upper.includes('PSB')) return ['#2e7d32', '#1b5e20'];
  return ['#3c4043', '#202124'];
}
