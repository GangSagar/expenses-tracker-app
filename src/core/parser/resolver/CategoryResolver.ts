import { Category } from '../../../types/expense';
import { configManager } from '../config';
import { ILearningEngine } from '../learning/LearningEngine';

export interface ResolvedCategory {
  category: Category;
  confidence: number;
  source: 'learned' | 'rule' | 'keyword' | 'default';
}

export interface ICategoryResolver {
  resolve(
    normalizedMerchant: string,
    rawMerchant: string,
    rawMessage: string,
    learningEngine?: ILearningEngine | null
  ): ResolvedCategory;
}

export class CategoryResolver implements ICategoryResolver {
  public resolve(
    normalizedMerchant: string,
    rawMerchant: string,
    rawMessage: string,
    learningEngine?: ILearningEngine | null
  ): ResolvedCategory {
    // 1. Check Learning Engine first (user personalized knowledge)
    if (learningEngine) {
      const learned = learningEngine.getLearnedMerchant(normalizedMerchant) ||
                      learningEngine.getLearnedMerchant(rawMerchant);
      if (learned && learned.category) {
        return {
          category: learned.category,
          confidence: 1.0,
          source: 'learned',
        };
      }
    }

    const catRules = configManager.getCategoryRules();

    // 2. Exact or substring merchant rule match
    const normUpper = normalizedMerchant.toUpperCase();
    for (const [merchName, cat] of Object.entries(catRules.merchantCategories)) {
      const targetUpper = merchName.toUpperCase();
      if (normUpper === targetUpper || normUpper.includes(targetUpper)) {
        return {
          category: cat as Category,
          confidence: 0.95,
          source: 'rule',
        };
      }
    }

    // 3. Keyword heuristic on merchant and raw message
    const searchTarget = `${normalizedMerchant} ${rawMerchant} ${rawMessage}`.toUpperCase();
    for (const [categoryName, keywords] of Object.entries(catRules.keywordCategories)) {
      for (const kw of keywords) {
        const regex = new RegExp(`\\b${kw}\\b`, 'i');
        if (regex.test(searchTarget)) {
          return {
            category: categoryName as Category,
            confidence: 0.85,
            source: 'keyword',
          };
        }
      }
    }

    // 4. Fallback default category
    return {
      category: (catRules.defaultCategory || 'Other') as Category,
      confidence: 0.40,
      source: 'default',
    };
  }
}

export const defaultCategoryResolver = new CategoryResolver();
