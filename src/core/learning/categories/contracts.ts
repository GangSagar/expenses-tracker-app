import { Category } from '../../../types/expense';

export interface CategoryFeatureVector {
  /** Debtor, Creditor, Payee, or Merchant name */
  entity?: string;
  /** Originating SMS sender ID or package name */
  sender?: string;
  /** Numerical transaction amount */
  amount?: number;
  /** Payment mode / channel (e.g. upi, cc, dc, netbanking, wallet) */
  paymentMode?: string;
  /** Normalized lowercase alphanumeric token stream */
  tokens: string[];
}

export interface CategorySuggestion {
  category: Category;
  confidence: number;
  matchedFeatures: string[];
}

export interface CategoryModelData {
  version: number;
  updatedAt: number;
  /** Entity (merchant / payee / creditor / debtor) to category co-occurrences */
  entityWeights: Record<string, Partial<Record<Category, number>>>;
  /** Sender (header / package) to category co-occurrences */
  senderWeights: Record<string, Partial<Record<Category, number>>>;
  /** Word tokens to category co-occurrences */
  tokenWeights: Record<string, Partial<Record<Category, number>>>;
  /** Payment channel to category co-occurrences */
  channelWeights: Record<string, Partial<Record<Category, number>>>;
  /** Total times each category has been learned */
  categoryTotals: Record<Category, number>;
  /** Total training observations */
  totalObservations: number;
}

export interface ICategoryLearningEngine {
  /**
   * Suggests ranked categories based on statistical feature likelihood.
   * Returns suggestions sorted by confidence descending.
   */
  suggest(
    features: CategoryFeatureVector,
    maxSuggestions?: number,
    threshold?: number,
  ): CategorySuggestion[];

  /**
   * Online dynamic learning: updates co-occurrences when a transaction
   * is categorized or re-labeled by the user.
   */
  learn(features: CategoryFeatureVector, category: Category): void;

  /** Export model state for persistent SQLite storage */
  serialize(): CategoryModelData;

  /** Restore model state from persistence */
  load(data: CategoryModelData): void;

  /** Reset model state to baseline default priors */
  reset(): void;
}

export interface ICategoryLearningRepository {
  load(): Promise<CategoryModelData | null>;
  save(data: CategoryModelData): Promise<void>;
}

