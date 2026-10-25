#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { performance } = require('node:perf_hooks');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_ENTRY = path.join(ROOT_DIR, 'dist', 'core', 'parser', 'parseMessage.js');

// Auto-compile dist if not built
if (!fs.existsSync(DIST_ENTRY)) {
  console.log('⚙️ First-time build: Compiling TypeScript parser engine...');
  try {
    execSync(
      'npx tsc src/core/parser/parseMessage.ts --module commonjs --target es2020 --moduleResolution node --resolveJsonModule --esModuleInterop --outDir dist --skipLibCheck',
      { cwd: ROOT_DIR, stdio: 'pipe' }
    );
  } catch (err) {
    console.error('❌ Failed to compile parser:', err.message);
    process.exit(1);
  }
}

const { parseMessage, parseStructured } = require(DIST_ENTRY);

const args = process.argv.slice(2);

let msg = '';
let sender = 'HDFCBK';
let isBenchmark = false;
let benchmarkCount = 1000;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    console.log(`
SpendWise Fast SMS Parser CLI
Usage: ./run parse [options] [message] [sender]

Options:
  --msg, -m <text>          The SMS message text to parse
  --sender, -s <code>       The sender ID (defaults to HDFCBK)
  --benchmark, -b [count]   Run throughput benchmark (default: 1,000 messages)
  --help, -h                Show this help message

Examples:
  ./run parse "Dear Customer, A/c XX1234 debited for Rs 450.00 at SWIGGY - HDFC Bank"
  ./run parse --msg "Rs 1,500 credited to account XX5678" --sender "SBINB"
  ./run parse --benchmark 5000
`);
    process.exit(0);
  } else if (arg === '--benchmark' || arg === '-b') {
    isBenchmark = true;
    if (args[i + 1] && !args[i + 1].startsWith('-')) {
      benchmarkCount = parseInt(args[i + 1], 10) || 1000;
      i++;
    }
  } else if (arg === '--msg' || arg === '-m') {
    msg = args[++i] || '';
  } else if (arg === '--sender' || arg === '-s') {
    sender = args[++i] || 'HDFCBK';
  } else if (!msg) {
    msg = arg;
  } else if (sender === 'HDFCBK') {
    sender = arg;
  }
}

if (isBenchmark) {
  runBenchmark(benchmarkCount);
  process.exit(0);
}

if (!msg) {
  msg = 'Dear Customer, your A/c XX1234 is debited for Rs 450.00 on 18-Oct-26 at SWIGGY - HDFC Bank';
}

const t0 = performance.now();
const parsed = parseMessage(msg, sender, 'sms');
const structured = parseStructured(msg, sender, 'sms');
const t1 = performance.now();
const parseTimeMs = t1 - t0;
const parseTimeUs = Math.round(parseTimeMs * 1000);

console.log('\n============================================================');
console.log('🔍 FAST BACKEND SMS PARSER DIAGNOSTIC REPORT');
console.log('============================================================');
console.log(`📨 Sender:            ${sender}`);
console.log(`💬 Message:           "${msg}"`);
console.log('------------------------------------------------------------');
console.log('📊 PARSED EXTRACTED DATA:');
console.log(`   • Amount:            ${parsed && parsed.amount !== null ? `₹${parsed.amount.toFixed(2)}` : '❌ Not Found'}`);
console.log(`   • Transaction Type:  ${parsed ? parsed.transactionType.toUpperCase() : 'None'}`);
console.log(`   • Payment Mode:      ${parsed ? parsed.paymentMode.toUpperCase() : 'UNKNOWN'}`);
console.log(`   • Merchant / Payee:  ${parsed && parsed.merchant ? parsed.merchant : 'None'}`);
console.log(`   • Account Number:    ${parsed && parsed.account ? `XX${parsed.account}` : 'None'}`);
console.log(`   • Bank:              ${parsed && parsed.bank ? parsed.bank : 'None'}`);
console.log(`   • Available Balance: ${parsed && parsed.availableBalance !== undefined ? `₹${parsed.availableBalance.toFixed(2)}` : 'Not Reported'}`);
console.log(`   • Reference ID:      ${parsed && parsed.referenceId ? parsed.referenceId : 'None'}`);
if (structured && typeof structured.confidence === 'number') {
  console.log(`   • Quality Confidence: ${(structured.confidence * 100).toFixed(1)}%`);
}
console.log('------------------------------------------------------------');
console.log(`⚡ Execution Speed:     ${parseTimeMs.toFixed(3)} ms (${parseTimeUs} microseconds)`);
console.log(`🚀 Throughput Rate:     ~${Math.round(1000 / Math.max(parseTimeMs, 0.001)).toLocaleString()} messages / second`);
console.log(`⏱️ Est. 10,000 Inbox:   ${((10000 * parseTimeMs) / 1000).toFixed(2)} seconds total`);
console.log('============================================================\n');

function runBenchmark(count) {
  const sampleMessages = [
    {
      msg: 'Dear Customer, your A/c XX1234 is debited for Rs 450.00 on 18-Oct-26 at SWIGGY - HDFC Bank',
      sender: 'HDFCBK',
    },
    {
      msg: 'Your A/C X5678 debited by Rs.1,250.00 on 12-May-2026 14:30:15 transfer to Zomato UPI Ref 412345678901 - SBI',
      sender: 'SBIINB',
    },
    {
      msg: 'Acct XX9012 debited with INR 85.50 on 05-Jun-26. Info: UPI/uber/paytm. Bal: INR 12,450.00',
      sender: 'ICICIB',
    },
    {
      msg: 'Rs 549.00 spent on Axis Bank Card ending 4321 at FLIPKART on 20-Jul-26. Avl Lmt: Rs 45,000.00',
      sender: 'AXISBK',
    },
    {
      msg: 'KOTAK BANK: Rs 300 debited from a/c ...7890 towards AMAZON PAY on 10-Aug-26. Ref: 654321987012',
      sender: 'KOTAKB',
    },
  ];

  console.log(`\n============================================================`);
  console.log(`⚡ RUNNING PARSER BENCHMARK: ${count.toLocaleString()} MESSAGES`);
  console.log(`============================================================`);

  // Warm up JIT
  for (let i = 0; i < 50; i++) {
    const s = sampleMessages[i % sampleMessages.length];
    parseMessage(s.msg, s.sender, 'sms');
  }

  const start = performance.now();
  for (let i = 0; i < count; i++) {
    const s = sampleMessages[i % sampleMessages.length];
    parseMessage(s.msg, s.sender, 'sms');
  }
  const elapsed = performance.now() - start;
  const perMsg = elapsed / count;
  const rate = Math.round((count / elapsed) * 1000);

  console.log(`Total Elapsed Time:   ${elapsed.toFixed(2)} ms (${(elapsed / 1000).toFixed(3)}s)`);
  console.log(`Average Per Message:  ${perMsg.toFixed(4)} ms (${(perMsg * 1000).toFixed(1)} µs)`);
  console.log(`Parsing Throughput:   ${rate.toLocaleString()} messages / second`);
  console.log(`------------------------------------------------------------`);
  console.log(`📊 ESTIMATED INBOX SCENARIOS:`);
  console.log(`   • 1,000 Messages:   ${((1000 * perMsg) / 1000).toFixed(2)} seconds`);
  console.log(`   • 5,000 Messages:   ${((5000 * perMsg) / 1000).toFixed(2)} seconds`);
  console.log(`   • 10,000 Messages:  ${((10000 * perMsg) / 1000).toFixed(2)} seconds`);
  console.log(`   • 50,000 Messages:  ${((50000 * perMsg) / 1000).toFixed(2)} seconds`);
  console.log(`============================================================\n`);
}
