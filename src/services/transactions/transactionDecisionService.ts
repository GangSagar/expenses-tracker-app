import { classify } from '../../core/classifier';
import { calculateConfidence } from '../../core/confidence';
import { toExpenseModel, toParsedTransaction } from '../../core/parser/models';
import { defaultCategoryLearningEngine } from '../../core/learning/categories';
import { defaultTagLearningEngine } from '../../core/learning/tags';
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

  const entity = parsed.merchant || parsed.normalizedMerchant;

  // 1. Dynamic category suggestion & classification (zero regexes, top 3 suggestions)
  const categorySuggestions = defaultCategoryLearningEngine.suggest(
    {
      entity,
      sender: analysis.message.sender,
      amount: parsed.amount,
      paymentMode: parsed.paymentMode,
      tokens,
    },
    3,
  );

  // Resolved candidate category:
  // 1. If classifier matched via merchant_map or keyword rule, honor classification.category
  // 2. If classifier defaulted to 'Other' and CategoryLearningEngine has a confident suggestion, adopt it
  // 3. Otherwise default to classification.category
  const topSuggestion = categorySuggestions.length > 0 ? categorySuggestions[0] : null;
  const resolvedCategory =
    classification.matchedVia !== 'default'
      ? classification.category
      : (topSuggestion && topSuggestion.category !== 'Other' && topSuggestion.confidence >= 0.5)
        ? topSuggestion.category
        : classification.category;

  // 2. Self-learning dynamic tag prediction (capped at 3 tags)
  const predictedTags = defaultTagLearningEngine.predict(
    {
      entity,
      category: resolvedCategory,
      sender: analysis.message.sender,
      transactionType: parsed.transactionType === 'credit' ? 'credit' : 'debit',
      paymentMode: parsed.paymentMode,
      tokens,
    },
    3,
  ).map(p => p.tag);

  const candidate: TransactionCandidate = {
    ...toExpenseModel(parsed),
    category: resolvedCategory,
    suggestedCategories: categorySuggestions.map(s => ({
      category: s.category,
      confidence: s.confidence,
      evidence: s.matchedFeatures,
    })),
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
