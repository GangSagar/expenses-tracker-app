import { Category } from '../../../types/expense';

export interface LearnedMapping {
  merchant: string;
  displayName: string;
  category: Category;
  updatedAt?: number;
}

export interface ILearningRepository {
  save(mapping: LearnedMapping): void;
  get(rawMerchant: string): LearnedMapping | null;
  getAll(): LearnedMapping[];
}
