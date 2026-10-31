import { classify } from '../../core/classifier';
import { calculateConfidence } from '../../core/confidence';
import { toExpenseModel, toParsedTransaction } from '../../core/parser/models';
import { defaultTagLearningEngine } from '../../core/tags';
import { TransactionCandidate, TransactionDecision, TransactionDecisionInput } from '../../core/transactions/contracts';
import { decideTransaction } from '../../core/transactions/decisionPolicy';
import { SplitSettlementUpdate } from '../../core/transactions/repaymentPlanner';
import { IncomingTransactionAnalysis } from '../messaging/messageService';

export interface ProcessedExpense {
  candidate: TransactionCandidate | null;
  decision: TransactionDecision;
  repaymentUpdates: SplitSettlementUpdate[];
}

/** Convert collected parser/classifier evidence into the single policy result. */
export function processTransaction(analysis: IncomingTransactionAnalysis): ProcessedExpense {
  const parsed = analysis.parsed;
  if (!parsed) {
    const decision = decideTransaction({
      candidate: null, parser: null, classifier: null,
      rejectionSignals: analysis.rejectionSignals,
    });
    return { candidate: null, decision, repaymentUpdates: [] };
  }

  const legacyParsed = toParsedTransaction(parsed);
  const classification = classify(legacyParsed.alias, legacyParsed.rawMessage);
  const legacyConfidence = calculateConfidence(legacyParsed, classification);

  // Extract word tokens for dynamic feature association (zero regexes)
  const tokens = analysis.normalizedBody
    ? analysis.normalizedBody.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(t => t.length > 1)
    : [];

  // Self-learning dynamic tag prediction (capped at 3 tags)
  const predictedTags = defaultTagLearningEngine.predict(
    {
      entity: parsed.merchant || parsed.normalizedMerchant,
      category: classification.category,
      sender: analysis.message.sender,
      transactionType: parsed.transactionType === 'credit' ? 'credit' : 'debit',
      paymentMode: parsed.paymentMode,
      tokens,
    },
    3,
  ).map(p => p.tag);

  const candidate: TransactionCandidate = {
    ...toExpenseModel(parsed),
    category: classification.category,
    confidence: legacyConfidence,
    timestamp: analysis.message.timestamp ?? parsed.timestamp,
    rawMessage: analysis.normalizedBody,
    location: analysis.message.location,
    referenceId: parsed.transactionId || parsed.referenceId || parsed.referenceNumber || legacyParsed.referenceId || undefined,
    transactionId: parsed.transactionId || parsed.referenceId || parsed.referenceNumber || legacyParsed.referenceId || undefined,
    tags: predictedTags.length > 0 ? predictedTags : undefined,
  };
  const input: TransactionDecisionInput = {
    candidate,
    parser: {
      confidence: parsed.confidence,
      requiresConfirmation: parsed.requiresConfirmation,
      parserVersion: parsed.parserVersion,
      confidenceBreakdown: parsed.confidenceBreakdown,
      ...(parsed.aiProposal ? {
        aiEvidence: {
          modelId: parsed.aiProposal.modelId,
          modelVersion: parsed.aiProposal.modelVersion,
          conflicts: parsed.aiProposal.conflicts,
          fieldEvidence: Object.fromEntries(
            Object.entries(parsed.fieldEvidence || {}).map(([field, evidence]) => [field, {
              source: evidence?.source || 'unknown',
              confidence: evidence?.confidence || 0,
            }]),
          ),
        },
      } : {}),
    },
    classifier: {
      category: classification.category,
      matchedVia: classification.matchedVia,
      confidence: legacyConfidence,
    },
    rejectionSignals: analysis.rejectionSignals,
  };
  return { candidate, decision: decideTransaction(input), repaymentUpdates: [] };
}
