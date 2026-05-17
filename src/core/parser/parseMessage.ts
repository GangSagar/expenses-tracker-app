import {
  ParsedTransaction,
  PaymentMode,
  TransactionSource,
  TransactionType,
} from '../../types/expense';
import {
  AMOUNT_REGEX,
  DEBIT_REGEX,
  CREDIT_REGEX,
  ACCOUNT_REGEX,
  UPI_REGEX,
  WALLET_REGEX,
  CC_REGEX,
  MERCHANT_REGEX,
  VPA_MERCHANT_REGEX,
} from './regexRules';

function extractAmount(message: string): number | null {
  const match = message.match(AMOUNT_REGEX);
  if (!match) {
    return null;
  }
  const raw = match[1].replace(/,/g, '');
  const amount = parseFloat(raw);
  return isNaN(amount) ? null : amount;
}

function detectTransactionType(message: string): TransactionType {
  if (DEBIT_REGEX.test(message)) {
    return 'debit';
  }
  if (CREDIT_REGEX.test(message)) {
    return 'credit';
  }
  return 'debit';
}

function detectPaymentMode(message: string): PaymentMode {
  if (WALLET_REGEX.test(message)) {
    return 'wallet';
  }
  if (UPI_REGEX.test(message)) {
    return 'upi';
  }
  if (CC_REGEX.test(message)) {
    return 'cc';
  }
  return 'unknown';
}

function extractAccount(message: string): string | null {
  const match = message.match(ACCOUNT_REGEX);
  return match ? match[1] : null;
}

function extractReferenceId(message: string): string | null {
  const REFERENCE_REGEX = /(?:ref\s*(?:no\.?|id)?|reference\s*(?:no\.?|id)?|txn\s*(?:id|no\.?)?|transaction\s*(?:id|no\.?)?)\s*[:.-]?\s*(?:no\.?)?\\s*(\w{6,20})/i;
  const match = message.match(REFERENCE_REGEX);
  return match ? match[1] : null;
}

function extractMerchant(message: string): string | null {
  // Clean up any dates preceded by "on" to prevent matching them as merchants
  let cleanMessage = message.replace(/\bon\s+\d{1,2}[-/.]\w+[-/.]\d{2,4}\b/gi, '');
  cleanMessage = cleanMessage.replace(/\bon\s+\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/gi, '');
  cleanMessage = cleanMessage.replace(/\bon\s+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{2,4}\b/gi, '');
  cleanMessage = cleanMessage.replace(/\bon\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s+\d{2,4}\b/gi, '');

  // 1. High-Signal Transaction Target patterns (credited/debited/spent/paid/transferred/transfer/trf/Cr./Dr. to/at/towards)
  const highSignalMatch = cleanMessage.match(
    /\b(?:credited|debited|spent|paid|transferred|transfer|trf|Cr\.?|Dr\.?)\s+(?:to|at|towards)\s+([A-Za-z0-9\s&'./\-@]+?)(?:\s+on\b|\s+[Rr]ef\b|\s+via\b|\s+UPI\b|\s+NEFT\b|\s+IMPS\b|\s+RTGS\b|\bAvl\s+Bal\b|\bAvailable\s+Bal\b|\bCredit\s+Limit\b|\bAvl\s+Limit\b|\.\s|\s*\(|[.\s]*$)/i
  );
  if (highSignalMatch) {
    const name = highSignalMatch[1].trim();
    const isAmount = /^(?:Rs\.?|INR|₹|inr)\b/i.test(name) || /^[0-9,.]+$/.test(name);
    if (name.length >= 3 && !/^\d+$/.test(name) && !isAmount) {
      return name;
    }
  }

  // 2. Primary: look for explicit "to/at/for <merchant>" phrasing
  const primaryMatch = cleanMessage.match(MERCHANT_REGEX);
  if (primaryMatch) {
    const name = primaryMatch[1].trim();
    const isAmount = /^(?:Rs\.?|INR|₹|inr)\b/i.test(name) || /^[0-9,.]+$/.test(name);
    if (name.length >= 3 && !/^\d+$/.test(name) && !isAmount) {
      return name;
    }
  }

  // 3. Check for explicit "Receiver/Payee/Reciever: <Name>" patterns
  const receiverMatch = cleanMessage.match(
    /\b(?:receiver|reciever|payee)\s*[:\-]?\s*([A-Za-z0-9\s&'./\-@]+?)(?:\s+on\b|\s+[Rr]ef\b|\s+via\b|\s+UPI\b|\s+NEFT\b|\s+IMPS\b|\s+RTGS\b|\bAvl\s+Bal\b|\bAvailable\s+Bal\b|\bCredit\s+Limit\b|\bAvl\s+Limit\b|\.\s|\s*\(|[.\s]*$)/i
  );
  if (receiverMatch) {
    const name = receiverMatch[1].trim();
    const isAmount = /^(?:Rs\.?|INR|₹|inr)\b/i.test(name) || /^[0-9,.]+$/.test(name);
    if (name.length >= 3 && !/^\d+$/.test(name) && !isAmount) {
      return name;
    }
  }

  // 4. Check for UPI reference block pattern: e.g. UPI/CR/534765332543/GANGA SAGAR/BARB/7930010000
  const upiBlockMatch = cleanMessage.match(/\bUPI\/(?:CR|DR)\/\d+\/([A-Za-z0-9\s&'./\-@]+?)(?:\/|$)/i);
  if (upiBlockMatch) {
    const name = upiBlockMatch[1].trim();
    if (name.length >= 3 && !/^\d+$/.test(name)) {
      return name;
    }
  }

  // 5. Check for NEFT/IMPS reference payee patterns: e.g. NEFT-HSBCN08932182457-HP PPS
  const neftImpsMatch = cleanMessage.match(/\b(?:NEFT|IMPS|RTGS|UPI)-[A-Z0-9]+-([A-Za-z0-9\s&'./\-@]+?)(?:\.|\s+Available|$)/i);
  if (neftImpsMatch) {
    const name = neftImpsMatch[1].trim();
    if (name.length >= 3 && !/^\d+$/.test(name)) {
      return name;
    }
  }

  // 6. Check for "on <merchant>" where merchant is not a date
  const onMatch = cleanMessage.match(/\bon\s+([A-Za-z0-9\s&'./\-@]+?)(?:\s+on\b|\s+[Rr]ef\b|\s+via\b|\s+UPI\b|\s+NEFT\b|\s+IMPS\b|\s+RTGS\b|\bAvl\s+Bal\b|\bAvailable\s+Bal\b|\bCredit\s+Limit\b|\bAvl\s+Limit\b|\.\s|\s*\(|[.\s]*$)/i);
  if (onMatch) {
    const name = onMatch[1].trim();
    const isAmount = /^(?:Rs\.?|INR|₹|inr)\b/i.test(name) || /^[0-9,.]+$/.test(name);
    const isDate = /^\d{1,2}[-/.]\w+[-/.]\d{2,4}$/i.test(name) || 
                   /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/i.test(name) ||
                   /^\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(name) ||
                   /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i.test(name);
    if (!isDate && name.length >= 3 && !/^\d+$/.test(name) && !isAmount) {
      return name;
    }
  }

  // 7. Fallback: extract from VPA handle — e.g. "swiggy@icici" → "swiggy"
  // Skip VPA handles that are pure phone numbers (e.g. 917012345678@ybl)
  const vpaMatch = cleanMessage.match(VPA_MERCHANT_REGEX);
  if (vpaMatch) {
    const vpaName = vpaMatch[1].trim();
    // Only use if it starts with a letter (not a phone number VPA)
    if (/^[A-Za-z]/.test(vpaName) && vpaName.length >= 3) {
      return vpaName;
    }
  }

  return null;
}

import { detectBank } from './bankMap';
import { getMerchantMapping } from '../classifier/merchantMap';

function extractAvailableBalance(message: string): number | null {
  // Currency prefix pattern (optional, handles Rs., Rs, INR, ₹)
  const currencyPrefix = '(?:Rs\\.?|INR|₹)?\\s*';
  // Number pattern (handles comma-separated Indian format like 1,23,456.78)
  const numPattern = '([0-9][0-9,]*(?:\\.[0-9]+)?)';

  // 1. CLR BAL pattern (Punjab & Sind Bank): "CLR BAL 100120CR"
  const clrBalMatch = message.match(
    new RegExp(`\\bCLR\\s*BAL\\s*${currencyPrefix}${numPattern}(?:\\s*CR|\\s*DR)?`, 'i')
  );
  if (clrBalMatch) {
    const raw = clrBalMatch[1].replace(/,/g, '');
    const bal = parseFloat(raw);
    if (!isNaN(bal)) return bal;
  }

  // 2. AvlBal: Rs<amount> (Bank of Baroda): "AvlBal: Rs1015.58" or "AvlBal:Rs1015.58"
  const avlBalColonMatch = message.match(
    new RegExp(`\\bAvl\\s*Bal\\s*:\\s*${currencyPrefix}${numPattern}`, 'i')
  );
  if (avlBalColonMatch) {
    const raw = avlBalColonMatch[1].replace(/,/g, '');
    const bal = parseFloat(raw);
    if (!isNaN(bal)) return bal;
  }

  // 3. Avl Bal <amount> (Bank of India, ICICI): "Avl Bal 1121.00" or "Avl Bal Rs. 2,667.87"
  const avlBalMatch = message.match(
    new RegExp(`\\bAvl\\s*Bal\\s+${currencyPrefix}${numPattern}`, 'i')
  );
  if (avlBalMatch) {
    const raw = avlBalMatch[1].replace(/,/g, '');
    const bal = parseFloat(raw);
    if (!isNaN(bal)) return bal;
  }

  // 4. Avl Limit: INR <amount> (ICICI CC): "Avl Limit: INR 8,667.02"
  const avlLimitMatch = message.match(
    new RegExp(`\\bAvl\\s*Limit\\s*:\\s*${currencyPrefix}${numPattern}`, 'i')
  );
  if (avlLimitMatch) {
    const raw = avlLimitMatch[1].replace(/,/g, '');
    const bal = parseFloat(raw);
    if (!isNaN(bal)) return bal;
  }

  // 5. Available Balance is Rs. <amount> (ICICI savings): "Available Balance is Rs. 67,676.13"
  const availBalIsMatch = message.match(
    new RegExp(`\\bAvailable\\s+Balance\\s+is\\s+${currencyPrefix}${numPattern}`, 'i')
  );
  if (availBalIsMatch) {
    const raw = availBalIsMatch[1].replace(/,/g, '');
    const bal = parseFloat(raw);
    if (!isNaN(bal)) return bal;
  }

  // 6. General fallback: avail[able] bal[ance] or bal[ance] is
  const generalMatch = message.match(
    /\b(?:available\s+(?:bal(?:ance)?|limit)|bal(?:ance)?\s+is)\s*:?\s*(?:Rs\.?|INR|₹)?\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i
  );
  if (generalMatch) {
    const raw = generalMatch[1].replace(/,/g, '');
    const bal = parseFloat(raw);
    if (!isNaN(bal)) return bal;
  }

  return null;
}

export function parseMessage(
  message: string,
  sender: string,
  source: TransactionSource,
): ParsedTransaction {
  console.log('--- NEW MESSAGE ARRIVED ---');
  console.log(`Raw Message: "${message}"`);
  console.log(`Sender: "${sender}"`);
  
  const amount = extractAmount(message);
  console.log(`Extracted Amount: ${amount} (Matched via: ${AMOUNT_REGEX.source})`);
  
  const transactionType = detectTransactionType(message);
  console.log(`Detected Type: ${transactionType} (Debit Regex: ${DEBIT_REGEX.source}, Credit Regex: ${CREDIT_REGEX.source})`);

  const paymentMode = detectPaymentMode(message);
  console.log(`Detected Mode: ${paymentMode}`);

  const account = extractAccount(message);
  console.log(`Extracted Account: ${account}`);

  const bank = detectBank(sender, message);
  console.log(`Detected Bank: ${bank}`);

  const rawMerchant = extractMerchant(message);
  const alias = rawMerchant;
  
  let merchant = rawMerchant;
  if (alias) {
    const mapped = getMerchantMapping(alias);
    if (mapped && mapped.displayName) {
      merchant = mapped.displayName;
    }
  }
  console.log(`Extracted Alias: ${alias}, Display Merchant: ${merchant}`);

  const availableBalance = extractAvailableBalance(message);
  console.log(`Extracted Available Balance: ${availableBalance}`);

  const referenceId = extractReferenceId(message);
  console.log(`Extracted Reference ID: ${referenceId}`);

  console.log('---------------------------');

  return {
    amount,
    merchant,
    alias,
    transactionType,
    paymentMode,
    account,
    bank,
    rawMessage: message,
    source,
    timestamp: Date.now(),
    availableBalance: availableBalance || undefined,
    referenceId: referenceId || undefined,
  };
}
