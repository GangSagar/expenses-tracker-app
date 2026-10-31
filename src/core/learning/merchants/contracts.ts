import { Category } from '../../../types/expense';

export interface LearnedMapping {
  merchant: string;
  displayName: string;
  category: Category;
  updatedAt?: number;
}

export interface IMerchantLearningRepository {
  save(mapping: LearnedMapping): void;
  get(rawMerchant: string): LearnedMapping | null;
  getAll(): LearnedMapping[];
}

export interface IMerchantLearningEngine {
  learn(rawMerchant: string, displayName: string, category: Category): void;
  getLearnedMerchant(rawMerchant: string): LearnedMapping | null;
  hasKnowledge(rawMerchant: string): boolean;
  getAllLearned(): LearnedMapping[];
}

