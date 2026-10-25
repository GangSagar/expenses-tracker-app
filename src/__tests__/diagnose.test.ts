import { parseMessage } from '../core/parser/parseMessage';
import { isTransactionMessage, isTransactionalSender } from '../core/parser/filters';
import { spamClassifier } from '../app/composition';
import { detectBank } from '../core/parser/bankMap';

describe('Backend SMS Diagnostics CLI', () => {
  it('diagnoses message processing', () => {
    const rawMsg =
      process.env.MSG ||
      'Dear Customer, your A/c XX1234 is debited for Rs 450.00 on 18-Oct-26 at SWIGGY - HDFC Bank';
    const sender = process.env.SENDER || 'HDFCBK';

    const isTxSender = isTransactionalSender(sender);
    const isTxMsg = isTransactionMessage(rawMsg);
    const spam = spamClassifier.isSpam(rawMsg);
    const bank = detectBank(sender, rawMsg);
    const parsed = parseMessage(rawMsg, sender, 'sms');

    console.log('\n============================================================');
    console.log('🔍 BACKEND PIPELINE DIAGNOSTIC REPORT');
    console.log('============================================================');
    console.log(`📨 Sender:            ${sender}`);
    console.log(`💬 Message:           "${rawMsg}"`);
    console.log('------------------------------------------------------------');
    console.log(`1. Transaction Sender:  ${isTxSender ? '✅ YES' : '❌ NO'}`);
    console.log(`2. Passed Content Filter: ${isTxMsg ? '✅ YES' : '❌ NO (Matched block pattern)'}`);
    console.log(`3. Spam Classifier:     ${!spam ? '✅ NOT SPAM' : '❌ FLAGGED AS SPAM'}`);
    console.log(`4. Detected Bank:       ${bank || '❓ Unknown'}`);
    console.log('------------------------------------------------------------');
    console.log('📊 PARSED EXTRACTED DATA:');
    console.log(`   • Amount:            ${parsed.amount !== null ? `₹${parsed.amount.toFixed(2)}` : '❌ Not Found'}`);
    console.log(`   • Transaction Type:  ${parsed.transactionType}`);
    console.log(`   • Payment Mode:      ${parsed.paymentMode}`);
    console.log(`   • Merchant / Payee:  ${parsed.merchant || 'None'}`);
    console.log(`   • Account Number:    ${parsed.account ? `XX${parsed.account}` : 'None'}`);
    console.log(`   • Bank:              ${parsed.bank || 'None'}`);
    console.log(`   • Available Balance: ${parsed.availableBalance !== undefined ? `₹${parsed.availableBalance.toFixed(2)}` : 'Not Reported'}`);
    console.log(`   • Reference ID:      ${parsed.referenceId || 'None'}`);
    console.log('============================================================\n');

    expect(typeof parsed).toBe('object');

    // Export trace to Jaeger if local collector is running
    const startTimeNs = `${Date.now() - 50}000000`;
    const endTimeNs = `${Date.now()}000000`;
    const randomHex = (len: number) =>
      Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'expense-tracker-cli' } },
              { key: 'environment', value: { stringValue: 'cli-diagnostics' } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: 'cli.parser' },
              spans: [
                {
                  traceId: randomHex(32),
                  spanId: randomHex(16),
                  name: 'cli.parse_message',
                  kind: 1,
                  startTimeUnixNano: startTimeNs,
                  endTimeUnixNano: endTimeNs,
                  attributes: [
                    { key: 'sender', value: { stringValue: sender } },
                    { key: 'bank', value: { stringValue: bank || 'unknown' } },
                    { key: 'amount', value: { doubleValue: parsed.amount || 0 } },
                    { key: 'type', value: { stringValue: parsed.transactionType || 'unknown' } },
                    { key: 'mode', value: { stringValue: parsed.paymentMode || 'unknown' } },
                    { key: 'is_spam', value: { boolValue: spam } },
                    { key: 'is_tx_message', value: { boolValue: isTxMsg } },
                  ],
                  status: { code: 1 },
                },
              ],
            },
          ],
        },
      ],
    };

      fetch('http://127.0.0.1:4318/v1/traces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
  });
});
