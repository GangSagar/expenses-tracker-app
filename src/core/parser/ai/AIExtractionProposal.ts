import { Category } from '../../../types/expense';
import { CATEGORIES } from '../../../constants/appOptions';

export type ParseExecutionContext =
  | 'live_background'
  | 'foreground_interaction'
  | 'historical_import'
  | 'unknown';

export type ProposalField =
  | 'amount'
  | 'currency'
  | 'transactionType'
  | 'merchant'
  | 'category'
  | 'referenceId';

export interface FieldEvidence<T> {
  value: T;
  confidence: number;
  source: 'deterministic' | 'local_model' | 'user_correction';
}

export interface AIExtractionProposal {
  amount?: FieldEvidence<number>;
  currency?: FieldEvidence<string>;
  transactionType?: FieldEvidence<'debit' | 'credit'>;
  merchant?: FieldEvidence<string>;
  category?: FieldEvidence<Category>;
  referenceId?: FieldEvidence<string>;
  conflicts: ProposalField[];
  modelId: string;
  modelVersion: string;
}

export interface AIInferenceRequest {
  message: string;
  merchantCandidate?: string;
  context: ParseExecutionContext;
}

export interface AIExtractionEngine {
  propose(request: AIInferenceRequest): Promise<unknown>;
}

export interface ValidatedAIExtractionProposal extends AIExtractionProposal {}

const supportedCurrencies = new Set(['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'CAD', 'AUD', 'JPY']);
const supportedCategories = new Set<string>(CATEGORIES);
const MAX_FIELD_TEXT = 120;

function validConfidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_FIELD_TEXT;
}

function validEvidence<T>(value: unknown, isValid: (candidate: unknown) => candidate is T): value is FieldEvidence<T> {
  if (!value || typeof value !== 'object') return false;
  const evidence = value as Partial<FieldEvidence<T>>;
  return isValid(evidence.value) && validConfidence(evidence.confidence) && evidence.source === 'local_model';
}

/** Strictly validates model output before it can become parser evidence. */
export function validateAIExtractionProposal(
  value: unknown,
  modelId: string,
  modelVersion: string,
): ValidatedAIExtractionProposal | null {
  if (!value || typeof value !== 'object' || !validText(modelId) || !validText(modelVersion)) return null;
  const proposal = value as Record<string, unknown>;
  const allowed = new Set(['amount', 'currency', 'transactionType', 'merchant', 'category', 'referenceId', 'conflicts', 'modelId', 'modelVersion']);
  if (Object.keys(proposal).some(key => !allowed.has(key))) return null;
  if ((proposal.modelId !== undefined && proposal.modelId !== modelId) ||
      (proposal.modelVersion !== undefined && proposal.modelVersion !== modelVersion)) return null;

  const conflicts = proposal.conflicts === undefined ? [] : proposal.conflicts;
  const fields: ProposalField[] = ['amount', 'currency', 'transactionType', 'merchant', 'category', 'referenceId'];
  if (!Array.isArray(conflicts) || conflicts.some(field => !fields.includes(field as ProposalField))) return null;

  const result: ValidatedAIExtractionProposal = { conflicts: conflicts as ProposalField[], modelId, modelVersion };
  if (proposal.amount !== undefined) {
    if (!validEvidence(proposal.amount, (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)) return null;
    result.amount = proposal.amount;
  }
  if (proposal.currency !== undefined) {
    if (!validEvidence(proposal.currency, (v): v is string => typeof v === 'string' && supportedCurrencies.has(v.toUpperCase()))) return null;
    result.currency = { ...(proposal.currency as FieldEvidence<string>), value: (proposal.currency as FieldEvidence<string>).value.toUpperCase() };
  }
  if (proposal.transactionType !== undefined) {
    if (!validEvidence(proposal.transactionType, (v): v is 'debit' | 'credit' => v === 'debit' || v === 'credit')) return null;
    result.transactionType = proposal.transactionType;
  }
  if (proposal.merchant !== undefined) {
    if (!validEvidence(proposal.merchant, validText)) return null;
    result.merchant = proposal.merchant;
  }
  if (proposal.category !== undefined) {
    if (!validEvidence(proposal.category, (v): v is Category => typeof v === 'string' && supportedCategories.has(v))) return null;
    result.category = proposal.category;
  }
  if (proposal.referenceId !== undefined) {
    if (!validEvidence(proposal.referenceId, validText)) return null;
    result.referenceId = proposal.referenceId;
  }
  return result;
}

export function mayRunAIForContext(context: ParseExecutionContext): boolean {
  return context === 'foreground_interaction' || context === 'historical_import';
}
