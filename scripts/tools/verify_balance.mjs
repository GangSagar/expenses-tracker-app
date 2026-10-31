// Quick balance extraction verification script
// Run: node verify_balance.mjs

function extractAvailableBalance(message) {
  const currencyPrefix = '(?:Rs\\.?|INR|₹)?\\s*';
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

  // 2. AvlBal: Rs<amount> (Bank of Baroda): "AvlBal: Rs1015.58"
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

  // 6. General fallback: available bal[ance] or bal[ance] is
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

const tests = [
  {
    name: 'PSB CLR BAL',
    msg: 'A/c No **2540 Credited with Rs 50000--UPI/CR/534765332543/GANGA SAGAR/BARB/7930010000 (CLR BAL 100120CR)(13-12-2025 22:27:02)-Punjab&Sind Bank',
    expected: 100120,
  },
  {
    name: 'BOB AvlBal: Rs<amount>',
    msg: 'Dear BOB UPI User: Your account is credited with INR 1.00 on 2026-05-17 03:16:35 AM by UPI Ref No 380133147553; AvlBal: Rs1015.58 - BOB',
    expected: 1015.58,
  },
  {
    name: 'BOB AvlBal: with parentheses',
    msg: 'Rs.1.00 Dr. from A/C XXXXXX9132 and Cr. to harshithrn@ybl. Ref:726412060639. AvlBal:Rs1015.58(2026:05:17 03:32:18).',
    expected: 1015.58,
  },
  {
    name: 'BOI Avl Bal <amount>',
    msg: 'BOI -  Rs.1.00 Credited to your Ac XX0604 on 17-05-26 by UPI ref No.613709668637.Avl Bal 1121.00',
    expected: 1121.00,
  },
  {
    name: 'ICICI Avl Limit: INR <amount>',
    msg: 'INR 665.64 spent using ICICI Bank Card XX4000 on 16-May-26 on TECHMASH SOLUTI. Avl Limit: INR 8,667.02. If not you, call 1800 2662/SMS BLOCK 4000 to 9215676766.',
    expected: 8667.02,
  },
  {
    name: 'ICICI Avl Bal Rs. <amount> comma-separated',
    msg: 'ICICI Bank Acc XX575 debited Rs. 450.36 on 30-Apr-26 InfoBIL*INFT*0011.Avl Bal Rs. 2,667.87.To dispute call 18002662',
    expected: 2667.87,
  },
  {
    name: 'ICICI Available Balance is Rs. <amount>',
    msg: 'ICICI Bank Account XX575 credited:Rs. 67,632.00 on 30-Mar-26. Info NEFT-HSBCN08932182457-HP PPS. Available Balance is Rs. 67,676.13.',
    expected: 67676.13,
  },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  const result = extractAvailableBalance(t.msg);
  const ok = result === t.expected;
  if (ok) {
    console.log(`✅ ${t.name}: ${result}`);
    passed++;
  } else {
    console.log(`❌ ${t.name}: expected ${t.expected}, got ${result}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
