import { Category } from '../../../types/expense';

export interface AIResolutionResult {
  merchant: string;
  category: Category;
  confidence: number;
  reasoning?: string;
  timestamp: number;
}

export class AICache {
  private cache: Map<string, AIResolutionResult> = new Map();
  private readonly maxEntries: number;

  constructor(maxEntries: number = 200) {
    this.maxEntries = maxEntries;
  }

  public get(key: string): AIResolutionResult | null {
    const entry = this.cache.get(key.toUpperCase().trim());
    return entry || null;
  }

  public set(key: string, result: AIResolutionResult): void {
    if (this.cache.size >= this.maxEntries) {
      // Evict oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key.toUpperCase().trim(), result);
  }

  public clear(): void {
    this.cache.clear();
  }
}
