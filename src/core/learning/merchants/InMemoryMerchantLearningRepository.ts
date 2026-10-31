import { IMerchantLearningRepository, LearnedMapping } from './contracts';

export class InMemoryMerchantLearningRepository implements IMerchantLearningRepository {
  private mappings: Map<string, LearnedMapping> = new Map();

  public save(mapping: LearnedMapping): void {
    this.mappings.set(mapping.merchant.toLowerCase(), mapping);
  }

  public get(rawMerchant: string): LearnedMapping | null {
    if (!rawMerchant) return null;
    return this.mappings.get(rawMerchant.toLowerCase()) || null;
  }

  public getAll(): LearnedMapping[] {
    return Array.from(this.mappings.values());
  }

  public clear(): void {
    this.mappings.clear();
  }
}

