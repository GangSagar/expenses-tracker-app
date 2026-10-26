import {
  TransactionDecision,
  TransactionDecisionInput,
  TransactionRejectionReason,
} from './contracts';

export const TRANSACTION_DECISION_POLICY_VERSION = '1.0.0';

export const DEFAULT_TRANSACTION_DECISION_THRESHOLDS = {
  rejectBelow: 0.5,
  autoSaveAtOrAbove: 0.8,
  parserMinimumForReview: 0.5,
} as const;

const REJECTION_PRECEDENCE: TransactionRejectionReason[] = [
  'non_transactional_sender',
  'blocked_message',
  'spam',
  'missing_amount',
  'low_confidence',
];

function summarize(input: TransactionDecisionInput) {
  return {
    policyVersion: TRANSACTION_DECISION_POLICY_VERSION,
    parserVersion: input.parser?.parserVersion,
    parserConfidence: input.parser?.confidence,
    parserRequiresConfirmation: input.parser?.requiresConfirmation,
    parserConfidenceBreakdown: input.parser?.confidenceBreakdown,
    parserAIEvidence: input.parser?.aiEvidence,
    classifierConfidence: input.classifier?.confidence,
    classifierMatchedVia: input.classifier?.matchedVia,
  };
}

/**
 * Sole business decision point for reject/review/auto-save.
 * Compatibility thresholds are retained, while parser confidence and its
 * confirmation signal can prevent an unsafe automatic save.
 */
export function decideTransaction(input: TransactionDecisionInput): TransactionDecision {
  const evidence = summarize(input);
  const rejection = REJECTION_PRECEDENCE.find(reason =>
    input.rejectionSignals.includes(reason),
  );

  if (rejection) {
    return { kind: 'reject', reason: rejection, evidence };
  }

  if (!input.candidate || !input.parser || !input.classifier) {
    return { kind: 'reject', reason: 'missing_amount', evidence };
  }

  if (
    input.classifier.confidence < DEFAULT_TRANSACTION_DECISION_THRESHOLDS.rejectBelow ||
    input.parser.confidence < DEFAULT_TRANSACTION_DECISION_THRESHOLDS.parserMinimumForReview
  ) {
    return { kind: 'reject', reason: 'low_confidence', evidence };
  }

  if (input.parser.requiresConfirmation) {
    return {
      kind: 'review',
      reason: 'parser_requires_confirmation',
      candidate: input.candidate,
      evidence,
    };
  }

  if (
    input.classifier.confidence >= DEFAULT_TRANSACTION_DECISION_THRESHOLDS.autoSaveAtOrAbove
  ) {
    return {
      kind: 'auto_save',
      reason: 'high_confidence',
      candidate: input.candidate,
      evidence,
    };
  }

  return {
    kind: 'review',
    reason: 'medium_confidence',
    candidate: input.candidate,
    evidence,
  };
}
