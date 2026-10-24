import { NormalizedMessage } from '../normalizer';

export class BalanceExtractor {
  public extract(message: NormalizedMessage): number | null {
    const text = message.clean;
    if (!text) return null;

    const currencyPrefix = '(?:Rs\\.?|INR|₹)?\\s*';
    const numPattern = '([0-9][0-9,]*(?:\\.[0-9]+)?)';

    // 1. CLR BAL pattern (Punjab & Sind Bank): "CLR BAL 100120CR"
    const clrBalMatch = text.match(
      new RegExp(`\\bCLR\\s*BAL\\s*${currencyPrefix}${numPattern}(?:\\s*CR|\\s*DR)?`, 'i')
    );
    if (clrBalMatch) {
      const raw = clrBalMatch[1].replace(/,/g, '');
      const bal = parseFloat(raw);
      if (!isNaN(bal)) return bal;
    }

    // 2. AvlBal: Rs<amount> (Bank of Baroda): "AvlBal: Rs1015.58" or "AvlBal:Rs1015.58"
    const avlBalColonMatch = text.match(
      new RegExp(`\\bAvl\\s*Bal\\s*:\\s*${currencyPrefix}${numPattern}`, 'i')
    );
    if (avlBalColonMatch) {
      const raw = avlBalColonMatch[1].replace(/,/g, '');
      const bal = parseFloat(raw);
      if (!isNaN(bal)) return bal;
    }

    // 3. Avl Bal <amount> (Bank of India, ICICI): "Avl Bal 1121.00" or "Avl Bal Rs. 2,667.87"
    const avlBalMatch = text.match(
      new RegExp(`\\bAvl\\s*Bal\\s+${currencyPrefix}${numPattern}`, 'i')
    );
    if (avlBalMatch) {
      const raw = avlBalMatch[1].replace(/,/g, '');
      const bal = parseFloat(raw);
      if (!isNaN(bal)) return bal;
    }

    // 4. Avl Limit: INR <amount> (Credit Card limit): "Avl Limit: INR 8,667.02"
    const avlLimitMatch = text.match(
      new RegExp(`\\bAvl\\s*Limit\\s*:\\s*${currencyPrefix}${numPattern}`, 'i')
    );
    if (avlLimitMatch) {
      const raw = avlLimitMatch[1].replace(/,/g, '');
      const bal = parseFloat(raw);
      if (!isNaN(bal)) return bal;
    }

    // 5. Available Balance is Rs. <amount> (ICICI savings): "Available Balance is Rs. 67,676.13"
    const availBalIsMatch = text.match(
      new RegExp(`\\bAvailable\\s+Balance\\s+is\\s+${currencyPrefix}${numPattern}`, 'i')
    );
    if (availBalIsMatch) {
      const raw = availBalIsMatch[1].replace(/,/g, '');
      const bal = parseFloat(raw);
      if (!isNaN(bal)) return bal;
    }

    // 6. General fallback: avail[able] bal[ance] or bal[ance] is
    const generalMatch = text.match(
      /\b(?:available\s+(?:bal(?:ance)?|limit)|bal(?:ance)?\s+is)\s*:?\s*(?:Rs\.?|INR|₹)?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i
    );
    if (generalMatch) {
      const raw = generalMatch[1].replace(/,/g, '');
      const bal = parseFloat(raw);
      if (!isNaN(bal)) return bal;
    }

    return null;
  }
}

export const balanceExtractor = new BalanceExtractor();
