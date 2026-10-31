#!/usr/bin/env node
/**
 * SpendWise Standalone Headless Backend Verification Tool
 * Tests SMS/notification parsing, decision policy, AI Budget Advisor,
 * and OpenTelemetry / Jaeger distributed trace export without requiring an Android emulator.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { performance } = require('node:perf_hooks');

const ROOT_DIR = path.resolve(__dirname, '../..');
const PARSER_DIST = path.join(ROOT_DIR, 'dist', 'core', 'parser', 'parseMessage.js');
const ADVISOR_DIST = path.join(ROOT_DIR, 'dist', 'services', 'advisor', 'advisorService.js');
const TAGS_DIST = path.join(ROOT_DIR, 'dist', 'src', 'core', 'learning', 'tags', 'TagLearningEngine.js');
const CATEGORY_DIST = path.join(ROOT_DIR, 'dist', 'src', 'core', 'learning', 'categories', 'CategoryLearningEngine.js');

// Auto-compile parser, advisor & dynamic tag engine if missing
if (!fs.existsSync(PARSER_DIST)) {
  execSync(
    'npx tsc src/core/parser/parseMessage.ts --module commonjs --target es2020 --moduleResolution node --resolveJsonModule --esModuleInterop --outDir dist --skipLibCheck',
    { cwd: ROOT_DIR, stdio: 'pipe' }
  );
}
if (!fs.existsSync(ADVISOR_DIST)) {
  execSync(
    'npx tsc src/services/advisor/advisorService.ts --module commonjs --target es2020 --moduleResolution node --resolveJsonModule --esModuleInterop --outDir dist --skipLibCheck',
    { cwd: ROOT_DIR, stdio: 'pipe' }
  );
}
if (!fs.existsSync(TAGS_DIST)) {
  execSync(
    'npx tsc src/core/learning/tags/TagLearningEngine.ts --rootDir . --module commonjs --target es2020 --moduleResolution node --resolveJsonModule --esModuleInterop --outDir dist --skipLibCheck',
    { cwd: ROOT_DIR, stdio: 'pipe' }
  );
}
if (!fs.existsSync(CATEGORY_DIST)) {
  execSync(
    'npx tsc src/core/learning/categories/CategoryLearningEngine.ts --rootDir . --module commonjs --target es2020 --moduleResolution node --resolveJsonModule --esModuleInterop --outDir dist --skipLibCheck',
    { cwd: ROOT_DIR, stdio: 'pipe' }
  );
}

const { parseStructured } = require(PARSER_DIST);
const { generateBudgetInsights } = require(ADVISOR_DIST);
const { TagLearningEngine } = require(TAGS_DIST);
const { CategoryLearningEngine } = require(CATEGORY_DIST);
const tagLearningEngine = new TagLearningEngine();
const categoryLearningEngine = new CategoryLearningEngine();

// Helper for random hex IDs
function randomHex(bytes) {
  let res = '';
  for (let i = 0; i < bytes * 2; i++) {
    res += Math.floor(Math.random() * 16).toString(16);
  }
  return res;
}

async function exportTraceToJaeger(traceId, spanId, name, durationMs, attributes, error) {
  const nowMs = Date.now();
  const startNano = `${nowMs - Math.round(durationMs)}000000`;
  const endNano = `${nowMs}000000`;

  const formattedAttrs = Object.entries(attributes).map(([key, val]) => {
    if (typeof val === 'number') {
      return Number.isInteger(val)
        ? { key, value: { intValue: val.toString() } }
        : { key, value: { doubleValue: val } };
    }
    if (typeof val === 'boolean') {
      return { key, value: { boolValue: val } };
    }
    return { key, value: { stringValue: String(val) } };
  });

  const payload = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'expense-tracker-backend-cli' } },
            { key: 'service.version', value: { stringValue: '1.3.1' } },
            { key: 'environment', value: { stringValue: 'backend-test' } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: 'com.expensetracker.backend' },
            spans: [
              {
                traceId,
                spanId,
                name,
                kind: 1,
                startTimeUnixNano: startNano,
                endTimeUnixNano: endNano,
                attributes: formattedAttrs,
                status: error ? { code: 2, message: error } : { code: 1 },
              },
            ],
          },
        ],
      },
    ],
  };

  try {
    const res = await fetch('http://127.0.0.1:4318/v1/traces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function run() {
  const args = process.argv.slice(2);
  let message = '';
  let sender = 'HDFCBK';
  let source = 'sms';
  let budget = 20000;
  let tags = null;
  let notes = null;
  let bill = null;
  let lat = null;
  let lng = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      console.log(`
SpendWise Headless Backend Verification Tool
Usage: ./run test --backend [options] [message] [sender]

Options:
  --msg, -m <text>     Message text to test
  --sender, -s <code>  Sender ID (default: HDFCBK)
  --source <type>      Source type: "sms" or "notification" (default: sms)
  --budget <number>    Monthly budget limit for AI Advisor (default: 20000)
  --tags <list>        Comma-separated tags (e.g. "Work,School")
  --notes <text>       Transaction note / description
  --bill <uri>         Bill / receipt image URI
  --lat <number>       Latitude for automatic location capture simulation
  --lng <number>       Longitude for automatic location capture simulation
  --help, -h           Show this help message

Examples:
  ./run test --backend "Dear Customer, A/c XX1234 debited for Rs 450.00 at SWIGGY"
  ./run test --backend "Paid ₹350.00 to Starbucks on Google Pay" com.google.android.apps.nbu.paisa --tags "Food,Work" --notes "Meeting coffee" --lat 12.9716 --lng 77.5946
`);
      process.exit(0);
    } else if (arg === '--msg' || arg === '-m') {
      message = args[++i] || '';
    } else if (arg === '--sender' || arg === '-s') {
      sender = args[++i] || '';
    } else if (arg === '--source') {
      source = args[++i] || 'sms';
    } else if (arg === '--budget') {
      budget = parseFloat(args[++i]) || 20000;
    } else if (arg === '--tags') {
      tags = (args[++i] || '').split(',').map(t => t.trim()).filter(Boolean);
    } else if (arg === '--notes') {
      notes = args[++i] || null;
    } else if (arg === '--bill') {
      bill = args[++i] || null;
    } else if (arg === '--lat') {
      lat = parseFloat(args[++i]);
    } else if (arg === '--lng') {
      lng = parseFloat(args[++i]);
    } else if (!message) {
      message = arg;
    } else if (!sender || sender === 'HDFCBK') {
      sender = arg;
    }
  }

  if (!message) {
    message = 'Dear Customer, your A/c XX1234 is debited for Rs 650.00 on 31-Oct-26 at ZOMATO - HDFC Bank';
  }

  const traceId = randomHex(16);
  const spanId = randomHex(8);
  const startTime = performance.now();

  console.log('\n============================================================');
  console.log('🧪 SPENDWISE HEADLESS BACKEND TEST REPORT');
  console.log('============================================================');
  console.log(`📨 Source:            ${source.toUpperCase()} (${sender})`);
  console.log(`💬 Message:           "${message}"`);
  console.log('------------------------------------------------------------');

  // Step 1: Parse
  const parsed = parseStructured(message, sender);
  const durationMs = performance.now() - startTime;

  // Standard simulated GPS coordinates fallback
  let locationLabel = 'Automatic GPS';
  if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) {
    try {
      const dump = execSync('adb shell dumpsys location 2>/dev/null', { timeout: 1200 }).toString();
      const match = dump.match(/last location=Location\[(?:gps|fused)\s+([\d.-]+),([\d.-]+)/);
      if (match) {
        lat = parseFloat(match[1]);
        lng = parseFloat(match[2]);
        locationLabel = 'Active Emulator GPS';
      }
    } catch { }
    if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) {
      lat = 12.9716;
      lng = 77.5946;
      locationLabel = 'Standard Simulated GPS';
    }
  }

  // Dynamic self-learning category suggestions & tag prediction
  const tokens = (message || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);

  let categorySuggestions = [];
  let resolvedCategory = parsed?.category || 'Other';
  let categoryConfidence = 0;

  if (parsed && parsed.amount > 0) {
    categorySuggestions = categoryLearningEngine.suggest(
      {
        entity: parsed.merchant || parsed.normalizedMerchant,
        sender,
        amount: parsed.amount,
        paymentMode: parsed.paymentMode,
        tokens,
      },
      3,
    );
    if (categorySuggestions.length > 0 && categorySuggestions[0].category !== 'Other') {
      resolvedCategory = categorySuggestions[0].category;
      categoryConfidence = categorySuggestions[0].confidence;
    }
  }

  // Dynamic self-learning auto-tagging if not specified (capped at 3 tags)
  let tagsAutoDetected = false;
  if (!tags || tags.length === 0) {
    if (parsed && parsed.amount > 0) {
      const predictions = tagLearningEngine.predict(
        {
          entity: parsed.merchant || parsed.normalizedMerchant,
          category: resolvedCategory,
          sender,
          transactionType: parsed.transactionType || 'debit',
          paymentMode: parsed.paymentMode,
          tokens,
        },
        3,
      );
      if (predictions.length > 0) {
        tags = predictions.map(p => p.tag);
        tagsAutoDetected = true;
      }
    }
  }

  // Step 2: Determine Decision
  let decision = 'reject';
  let reason = 'unknown';

  if (!parsed || !parsed.amount || parsed.amount <= 0) {
    decision = 'reject';
    reason = 'missing_amount';
  } else if (parsed.confidence >= 0.85) {
    decision = 'auto_save';
    reason = 'high_confidence';
  } else if (parsed.confidence >= 0.6) {
    decision = 'review';
    reason = 'medium_confidence';
  } else {
    decision = 'reject';
    reason = 'low_confidence';
  }

  console.log('📊 1. PARSER & EXTRACTOR ANALYSIS:');
  if (parsed && parsed.amount > 0) {
    console.log(`   • Amount:          ₹${parsed.amount.toFixed(2)}`);
    console.log(`   • Merchant:        ${parsed.merchant || 'Unknown'}`);
    const catConfStr = categoryConfidence > 0 ? ` (${(categoryConfidence * 100).toFixed(1)}% match)` : '';
    console.log(`   • Category:        ${resolvedCategory}${catConfStr}`);
    if (categorySuggestions.length > 0) {
      const suggestionsStr = categorySuggestions
        .map(s => `${s.category} (${(s.confidence * 100).toFixed(1)}%)`)
        .join(', ');
      console.log(`   • Suggestions:     ${suggestionsStr}`);
    }
    console.log(`   • Transaction:     ${(parsed.transactionType || 'debit').toUpperCase()}`);
    console.log(`   • Bank:            ${parsed.bank || 'Unknown'}`);
    console.log(`   • Account:         ${parsed.account ? 'XX' + parsed.account : 'N/A'}`);
    console.log(`   • Payment Mode:    ${(parsed.paymentMode || 'unknown').toUpperCase()}`);
    console.log(`   • Confidence:      ${(parsed.confidence * 100).toFixed(1)}%`);
    const txnId = parsed.referenceNumber || parsed.referenceId || parsed.transactionId || null;
    console.log(`   • Txn / Ref ID:    ${txnId || 'None'}`);
    if (tags && tags.length > 0) {
      const tagSuffix = tagsAutoDetected ? ' (Auto-detected)' : '';
      console.log(`   • Tags:            ${tags.join(', ')}${tagSuffix}`);
    }
    if (notes) {
      console.log(`   • Notes:           "${notes}"`);
    }
    if (bill) {
      console.log(`   • Bill Attachment: ${bill}`);
    }
    if (lat !== null && lng !== null) {
      console.log(`   • Map Location:    ${lat.toFixed(4)}, ${lng.toFixed(4)} (${locationLabel})`);
    }
    console.log(`   • Execution Time:  ${durationMs.toFixed(3)} ms`);
  } else {
    console.log('   🛑 No transaction amount extracted from message.');
  }

  console.log('\n⚖️ 2. TRANSACTION DECISION:');
  if (decision === 'auto_save') {
    console.log(`   • Policy Result:   \x1b[32m✅ AUTO_SAVE (Ready for SQLite Ledger)\x1b[0m`);
  } else if (decision === 'review') {
    console.log(`   • Policy Result:   \x1b[33m⚠️ REVIEW (Requires User Confirmation)\x1b[0m`);
  } else {
    console.log(`   • Policy Result:   \x1b[31m🛑 REJECT (Filtered)\x1b[0m`);
  }
  console.log(`   • Reason Code:     ${reason}`);

  // Step 3: Run AI Smart Budget Advisor with existing device transactions + this new candidate
  const sampleExpenses = [
    { id: 1, merchant: 'SWIGGY', amount: 450, category: 'Food & Dining', transactionType: 'debit', timestamp: Date.now() - 3600000, isInvalid: false },
    { id: 2, merchant: 'UBER', amount: 120, category: 'Travel', transactionType: 'debit', timestamp: Date.now() - 1800000, isInvalid: false },
    { id: 3, merchant: 'Starbucks', amount: 350, category: 'Food & Dining', transactionType: 'debit', timestamp: Date.now() - 900000, isInvalid: false },
    { id: 4, merchant: 'FLIPKART', amount: 850, category: 'Shopping', transactionType: 'debit', timestamp: Date.now() - 300000, isInvalid: false },
  ];

  if (decision === 'auto_save' && parsed) {
    sampleExpenses.push({
      id: 5,
      merchant: parsed.merchant || 'Simulated Merchant',
      amount: parsed.amount,
      category: resolvedCategory,
      transactionType: parsed.transactionType || 'debit',
      timestamp: Date.now(),
      isInvalid: false,
    });
  }

  const insights = generateBudgetInsights(sampleExpenses, budget);

  console.log('\n✨ 3. SMART AI BUDGET ADVISOR INSIGHTS:');
  const statusColor = insights.status === 'good' ? '\x1b[32m✔ ON TRACK (Good)\x1b[0m' : insights.status === 'warning' ? '\x1b[33m⚠️ WARNING\x1b[0m' : '\x1b[31m🚨 CRITICAL\x1b[0m';
  console.log(`   • Status:          ${statusColor}`);
  console.log(`   • Headline:        \x1b[1m${insights.headline}\x1b[0m`);
  console.log(`   • Daily Burn Rate: ₹${insights.dailyBurnRate}/day`);
  console.log(`   • Month Forecast:  ₹${insights.projectedExpense} (Est. Savings: ₹${insights.savingsEstimate})`);
  const adviceLines = insights.message.split('\n');
  console.log(`   • Micro-Advisory:  ${adviceLines[0]}`);
  for (let j = 1; j < adviceLines.length; j++) {
    if (adviceLines[j].trim()) console.log(`                      ${adviceLines[j].trim()}`);
  }

  // Step 4: Export OpenTelemetry Trace to Jaeger
  const exported = await exportTraceToJaeger(
    traceId,
    spanId,
    'backend.headless_verification',
    durationMs,
    {
      source,
      sender,
      amount: parsed ? parsed.amount : 0,
      merchant: parsed ? parsed.merchant : 'unknown',
      category: parsed ? parsed.category : 'other',
      decision,
      reason,
      transaction_id: parsed ? (parsed.referenceNumber || parsed.referenceId || parsed.transactionId || null) : null,
      tags: tags ? tags.join(',') : null,
      notes,
      has_bill: Boolean(bill),
      has_location: lat !== null && lng !== null,
      latitude: lat,
      longitude: lng,
      burn_rate: insights.dailyBurnRate,
      projected_expense: insights.projectedExpense,
    }
  );

  console.log('\n🌐 4. DISTRIBUTED TRACING (JAEGER):');
  console.log(`   • Trace ID:        ${traceId}`);
  if (exported) {
    console.log(`   • Export Status:   \x1b[32m✔ Exported to Jaeger OTLP receiver (127.0.0.1:4318)\x1b[0m`);
    console.log(`   • Waterfall UI:    \x1b[36mhttp://localhost:16686/trace/${traceId}\x1b[0m`);
  } else {
    console.log(`   • Export Status:   \x1b[33m⚠️ Jaeger collector was not reached on port 4318 (Run: ./run jaeger start)\x1b[0m`);
    console.log(`   • Trace Link:      http://localhost:16686/trace/${traceId}`);
  }
  console.log('============================================================\n');
}

run();

