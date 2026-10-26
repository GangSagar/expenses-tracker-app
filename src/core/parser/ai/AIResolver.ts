import { Category } from '../../../types/expense';
import { configManager } from '../config';
import { AICache, AIResolutionResult } from './AICache';

export type AIInferenceHandler = (
  rawMessage: string,
  merchantCandidate: string
) => Promise<AIResolutionResult | null>;

export interface IAIResolver {
  shouldInvoke(merchant: string, category: Category, confidence: number): boolean;
  resolve(rawMessage: string, merchantCandidate: string): Promise<AIResolutionResult | null>;
  setInferenceHandler(handler: AIInferenceHandler): void;
  getCache(): AICache;
}

export class AIResolver implements IAIResolver {
  private cache: AICache;
  private customHandler: AIInferenceHandler | null = null;

  constructor(cache?: AICache) {
    this.cache = cache || new AICache();
  }

  public shouldInvoke(merchant: string, category: Category, confidence: number): boolean {
    const config = configManager.getConfig();
    if (!config.enableAI) return false;

    // Only invoke AI if merchant is unknown, category cannot be resolved, or overall confidence < threshold
    const isUnknownMerchant = !merchant || merchant.toLowerCase() === 'unknown';
    const isDefaultCategory = !category || category === 'Other';
    const isLowConfidence = confidence < config.aiConfidenceThreshold;

    return isUnknownMerchant || isDefaultCategory || isLowConfidence;
  }

  public async resolve(
    rawMessage: string,
    merchantCandidate: string
  ): Promise<AIResolutionResult | null> {
    const cacheKey = this.createCacheKey(merchantCandidate, rawMessage);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    if (this.customHandler) {
      try {
        const result = await this.customHandler(rawMessage, merchantCandidate);
        if (result) {
          this.cache.set(cacheKey, result);
          return result;
        }
      } catch (err) {
        console.warn('AIResolver inference handler error:', err);
      }
    }

    return null;
  }

  /** In-memory cache identity without retaining source message text. */
  private createCacheKey(merchantCandidate: string, rawMessage: string): string {
    const input = `${merchantCandidate.toLowerCase().trim()}\u0000${rawMessage.toLowerCase().trim()}`;
    let hash = 5381;
    for (let index = 0; index < input.length; index += 1) {
      hash = (hash * 33 + input.charCodeAt(index)) % 0xffffffff;
    }
    return `djb2:${Math.floor(hash).toString(16)}`;
  }

  public setInferenceHandler(handler: AIInferenceHandler): void {
    this.customHandler = handler;
  }

  public getCache(): AICache {
    return this.cache;
  }
}

export const defaultAIResolver = new AIResolver();
