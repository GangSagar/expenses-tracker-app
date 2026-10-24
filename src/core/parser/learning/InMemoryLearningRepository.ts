import { ILearningRepository, LearnedMapping } from './ILearningRepository';

export class InMemoryLearningRepository implements ILearningRepository {
  private cache: Map<string, LearnedMapping> = new Map();

  public save(mapping: LearnedMapping): void {
    const key = mapping.merchant.toUpperCase().trim();
    this.cache.set(key, { ...mapping });
  }

  public get(rawMerchant: string): LearnedMapping | null {
    if (!rawMerchant) return null;
    const key = rawMerchant.toUpperCase().trim();
    return this.cache.get(key) || null;
  }

  public getAll(): LearnedMapping[] {
    return Array.from(this.cache.values());
  }

  public clear(): void {
    this.cache.clear();
  }
}
