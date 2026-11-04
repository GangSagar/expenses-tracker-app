/**
 * Unified Base Contracts for On-Device Self-Learning Engines.
 * Adheres strictly to SOLID principles: decoupled interfaces with zero regex dependency.
 */

export interface ILearningModel<TFeature, TOutput> {
  /** Generate predictions / suggestions for a given feature vector */
  predict(features: TFeature, maxResults?: number, threshold?: number): TOutput[];
  /** Continuously update weights when user labels or edits transactions */
  learn(features: TFeature, label: any): void;
  /** Serialize model weights for persistent on-device storage */
  serialize(): any;
  /** Restore model weights from persistence */
  load(data: any): void;
  /** Reset model to baseline default priors */
  reset(): void;
}

export interface IModelRepository<TData> {
  load(): Promise<TData | null>;
  save(data: TData): Promise<void>;
}

