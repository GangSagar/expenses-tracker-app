/**
 * Contracts for the Dynamic Self-Learning Tag Engine.
 * Adheres strictly to SOLID principles: decoupled interfaces with zero regex dependency.
 */

export interface TagFeatureVector {
  /** Debtor, Creditor, or Payee / Merchant name */
  entity?: string;
  /** Primary transaction category */
  category?: string;
  /** Originating sender ID or package name */
  sender?: string;
  /** Direction: debit or credit */
  transactionType?: 'debit' | 'credit';
  /** Detected payment channel / mode (e.g. upi, cc, dc, wallet) */
  paymentMode?: string;
  /** Normalized lowercase alphanumeric token stream */
  tokens: string[];
}

export interface TagPrediction {
  tag: string;
  confidence: number;
  matchedFeatures: string[];
}

export interface TagModelData {
  version: number;
  updatedAt: number;
  /** Entity (merchant / payee / sender) to tag counts */
  entityWeights: Record<string, Record<string, number>>;
  /** Category to tag counts */
  categoryWeights: Record<string, Record<string, number>>;
  /** Payment mode to tag counts */
  channelWeights: Record<string, Record<string, number>>;
  /** Word token to tag counts */
  tokenWeights: Record<string, Record<string, number>>;
  /** Total times each tag has been learned */
  tagTotals: Record<string, number>;
  /** Total learning observations */
  totalObservations: number;
}

export interface ITagLearningEngine {
  /** Predict top tags for a given transaction feature vector */
  predict(features: TagFeatureVector, maxTags?: number, threshold?: number): TagPrediction[];
  /** Learn new associations when a transaction is confirmed or edited */
  learn(features: TagFeatureVector, tags: string[]): void;
  /** Export raw state for persistence */
  serialize(): TagModelData;
  /** Hydrate engine with persisted state */
  load(data: TagModelData): void;
  /** Reset to default baseline priors */
  reset(): void;
}

export interface ITagLearningRepository {
  load(): Promise<TagModelData | null>;
  save(data: TagModelData): Promise<void>;
}

