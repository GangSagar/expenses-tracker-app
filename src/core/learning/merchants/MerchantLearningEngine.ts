import { Category } from '../../../types/expense';
import {
  IMerchantLearningEngine,
  IMerchantLearningRepository,
  LearnedMapping,
} from './contracts';

export class MerchantLearningEngine implements IMerchantLearningEngine {
  private repository: IMerchantLearningRepository;

  constructor(repository: IMerchantLearningRepository) {
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

