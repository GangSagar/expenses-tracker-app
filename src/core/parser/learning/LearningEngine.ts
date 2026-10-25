import { Category } from '../../../types/expense';
import { ILearningRepository, LearnedMapping } from './ILearningRepository';

export interface ILearningEngine {
  learn(rawMerchant: string, displayName: string, category: Category): void;
  getLearnedMerchant(rawMerchant: string): LearnedMapping | null;
  hasKnowledge(rawMerchant: string): boolean;
  getAllLearned(): LearnedMapping[];
}

export class LearningEngine implements ILearningEngine {
  private repository: ILearningRepository;

  constructor(repository: ILearningRepository) {
    this.repository = repository;
  }

  public learn(rawMerchant: string, displayName: string, category: Category): void {
    if (!rawMerchant) return;
    const mapping: LearnedMapping = {
      merchant: rawMerchant.trim(),
      displayName: (displayName || rawMerchant).trim(),
      category,
      updatedAt: Date.now(),
    };
    this.repository.save(mapping);
  }

  public getLearnedMerchant(rawMerchant: string): LearnedMapping | null {
    if (!rawMerchant) return null;
    return this.repository.get(rawMerchant);
  }

  public hasKnowledge(rawMerchant: string): boolean {
    return this.getLearnedMerchant(rawMerchant) !== null;
  }

  public getAllLearned(): LearnedMapping[] {
    return this.repository.getAll();
  }
}
