import samples from './__fixtures__/sms-samples.json';
import { parseMessage } from '../core/parser/parseMessage';
import { classify } from '../core/classifier';
import { calculateConfidence } from '../core/confidence';
import { processIncomingMessage } from '../services/messageService';
import { processTransaction } from '../services/expenseService';

function legacyDecision(analysis: Awaited<ReturnType<typeof processIncomingMessage>>) {
  if (analysis.rejectionSignals.length > 0 || !analysis.parsed) return 'reject';
  const parsed = parseMessage(analysis.normalizedBody, analysis.normalizedSender, analysis.message.source);
  if (parsed.amount === null) return 'reject';
  const classification = classify(parsed.alias, parsed.rawMessage);
  const confidence = calculateConfidence(parsed, classification);
  if (confidence < 0.5) return 'reject';
  return confidence >= 0.8 ? 'auto_save' : 'review';
}

describe('decision policy compatibility corpus', () => {
  it('records current-route differences against the legacy classifier thresholds', async () => {
    const differences: Array<{ index: number; legacy: string; policy: string }> = [];

    for (let index = 0; index < samples.length; index++) {
      const sample = samples[index];
      const analysis = await processIncomingMessage({
        body: sample.message,
        sender: 'JD-HDFCBK',
        source: 'sms',
      });
      const legacy = legacyDecision(analysis);
      const current = processTransaction(analysis).decision.kind;
      if (legacy !== current) differences.push({ index, legacy, policy: current });
    }

    console.info('Decision parity corpus differences:', JSON.stringify(differences));
    expect(differences).toEqual([]);
  });
});
