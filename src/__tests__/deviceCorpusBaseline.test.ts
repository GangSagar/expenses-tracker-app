import * as fs from 'fs';
import * as path from 'path';
import { processTransaction } from '../services/transactions/transactionDecisionService';
import { processIncomingMessage } from '../services/messaging/messageService';

interface DeviceMessageRecord {
  sender?: string;
  body?: string;
  type?: string;
}

const corpusPath = path.resolve(__dirname, '../../data/extracted_messages.json');
const hasLocalCorpus = fs.existsSync(corpusPath);

describe('local device corpus baseline', () => {
  (hasLocalCorpus ? test : test.skip)('records current parser and policy outcomes without exposing message data', async () => {
    const records = JSON.parse(fs.readFileSync(corpusPath, 'utf8')) as DeviceMessageRecord[];
    const counts = {
      total: records.length,
      inbox: 0,
      sentOrOther: 0,
      repeatedBodies: 0,
      parsed: 0,
      decisions: { auto_save: 0, review: 0, reject: 0 },
      reasons: {} as Record<string, number>,
      parsedDirections: { debit: 0, credit: 0, other: 0 },
      lowConfidenceOrReviewRequired: 0,
    };
    const seenBodies = new Set<string>();

    for (const record of records) {
      if (record.type !== 'INBOX') {
        counts.sentOrOther += 1;
        continue;
      }
      counts.inbox += 1;
      const bodyKey = (record.body || '').normalize('NFKC').trim().toLowerCase();
      if (seenBodies.has(bodyKey)) counts.repeatedBodies += 1;
      seenBodies.add(bodyKey);
      const analysis = await processIncomingMessage({
        body: record.body || '',
        sender: record.sender || '',
        source: 'sms',
      });
      const decision = processTransaction(analysis).decision;
      counts.decisions[decision.kind] += 1;
      counts.reasons[decision.reason] = (counts.reasons[decision.reason] || 0) + 1;
      if (analysis.parsed) {
        counts.parsed += 1;
        if (analysis.parsed.transactionType === 'debit') counts.parsedDirections.debit += 1;
        else if (analysis.parsed.transactionType === 'credit') counts.parsedDirections.credit += 1;
        else counts.parsedDirections.other += 1;
        if (analysis.parsed.requiresConfirmation || analysis.parsed.confidence < 0.75) {
          counts.lowConfidenceOrReviewRequired += 1;
        }
      }
    }

    // Aggregate output intentionally omits all sender/message values and dates.
    console.info(`Local device corpus baseline: ${JSON.stringify(counts)}`);
    expect(counts.total).toBeGreaterThan(0);
    expect(counts.inbox + counts.sentOrOther).toBe(counts.total);
    expect(counts.decisions.auto_save + counts.decisions.review + counts.decisions.reject).toBe(counts.inbox);
  });
});
