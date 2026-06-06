// ─── Amount ───────────────────────────────────────────────────────────────────
// Matches: Rs.500 | Rs 500 | INR 500 | ₹500 | INR500 | Rs.1,000.50
export const AMOUNT_REGEX =
  /(?:Rs\.?|INR|₹)\s*(\d+(?:[,\d]*)?(?:\.\d{1,2})?)/i;

// ─── Transaction Type ─────────────────────────────────────────────────────────
// DEBIT keywords — covers:
//   Standard        : debited, spent, paid, withdrawn, purchase, paying, sent, payment
//   SBI / BOB / PNB : deducted, debit (stem only)
//   IndusInd        : debit
//   RTGS / wire     : transferred, transfer
//   Axis short form : trf
//   Additional      : withdrew, withdraw, withdrawal, purchased, charged, recharge, billed, billing
export const DEBIT_REGEX =
  /\b(?:debit|debited|spent|spend|spends|spending|paid|paying|payment|payments|pay|pays|withdrawn|withdrew|withdraw|withdrawal|withdrawals|purchase|purchased|purchases|purchasing|sent|send|sending|deducted|deduct|deducts|deduction|deductions|transferred|transfer|transfers|transferring|trf|charged?|charges?|recharged?|recharges?|recharging|billed?|billing|transact|transacted|transacting|transaction|transactions|Dr\.?)\b/i;

// CREDIT keywords — covers:
//   Standard : credited, received, refund, reversed, deposited
//   SBI      : credit (stem only)
//   Kotak    : added
//   Additional: credit, receive, receives, receiving, recieved, recieve, refunded, reverse, reversal, deposit, added, add, adds
export const CREDIT_REGEX =
  /\b(?:credit|credited|credits|received|receive|receives|receiving|recieved|recieve|refund|refunded|refunds|reversed|reverse|reversal|reversals|deposited|deposit|deposits|added|add|adds|Cr\.?)\b/i;

// ─── Account Number ────────────────────────────────────────────────────────────
// Supports masking styles used by different banks:
//   XX1234     (HDFC, ICICI, Axis, SBI)
//   *1234      (Axis, Yes Bank)
//   **1234     (Kotak)
//   X1234      (some co-operative banks)
//   ending 1234  (spoken-English format used by some banks)
//   no.1234    (some banks prefix with "no.")
export const ACCOUNT_REGEX =
  /(?:A\/c|Acct?|account|a\/c|Card|ending|no\.?|\bAc\b|\bCC\b)\s*(?:[3-6]\d{0,3}[A-Za-z*.\s\-\/]{3,15}|[A-Za-z*.\s\-\/]{0,15})\s*(\d{3,4})\b/i;

// ─── Payment Mode ─────────────────────────────────────────────────────────────
// UPI — covers the most common UPI app references and @VPA handles
export const UPI_REGEX =
  /\b(?:UPI|VPA|Google\s*Pay|GPay|PhonePe|Paytm|BHIM|@[\w.]+)\b/i;

// Credit Cards
export const CC_REGEX =
  /\b(?:credit\s*card|cc|limit|credit\s*limit|avl\s*limit)\b/i;

// Wallets — includes Amazon Pay, MobiKwik, FreeCharge
export const WALLET_REGEX =
  /\b(?:wallet|Paytm\s*Wallet|PhonePe\s*Wallet|Amazon\s*Pay|mobikwik|freecharge)\b/i;

// ─── Merchant Extraction ──────────────────────────────────────────────────────
// Primary: text after "at / to / towards / for / transfer to / trf to"
// Stops before "on", "Ref", "via", "UPI", "NEFT", "IMPS", "RTGS", end-of-line
export const MERCHANT_REGEX =
  /(?:at|(?<!linked\s+)\bto\b|towards|for|transferred?\s+to|trf\s+to)\s+([A-Za-z0-9\s&'./\-@]+?)(?:\s+on\b|\s+[Rr]ef\b|\s+via\b|\s+UPI\b|\s+NEFT\b|\s+IMPS\b|\s+RTGS\b|\bAvl\s+Bal\b|\bAvailable\s+Bal\b|\bCredit\s+Limit\b|\bAvl\s+Limit\b|\.\s|\s*\(|[.\s]*$)/i;

// Fallback: pull the VPA handle's local-part as the merchant name
//   e.g. "swiggy@icici" → "swiggy" | "917012345678@ybl" → skipped (pure number)
export const VPA_MERCHANT_REGEX = /\b([A-Za-z][A-Za-z0-9._-]{1,}?)@[\w]+\b/i;

// ─── Ignore Filters ────────────────────────────────────────────────────────────
// OTP / verification messages
export const OTP_REGEX =
  /\b(?:OTP|one.time.password|verification\s+code|passcode)\b/i;

// Promotional keywords — only discard if NO debit/credit keyword is also present
export const PROMO_REGEX =
  /\b(?:offer|cashback|reward|congratulations|won?|free|discount|coupon|lucky|prize)\b/i;

// Pure balance-inquiry messages — only discard if NO debit/credit keyword is present
// Covers: "Avl Bal", "Avl Balance", "Available Balance", "Bal is", "Balance: Rs", "Bal: INR"
export const BALANCE_REGEX =
  /\b(?:avail(?:able)?\s*bal(?:ance)?|bal(?:ance)?\s*(?:is\b|:)|balance\s*(?:Rs|INR|₹))\b/i;

// Login / security alerts
export const LOGIN_REGEX =
  /\b(?:logged?\s*in|login|sign.in|password\s*changed|new\s*login|access\s*from)\b/i;
