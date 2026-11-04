import { Category } from '../../types/expense';
import { getMerchantMapping } from './merchantMap';
import { configManager } from '../parser/config';

export interface ClassificationResult {
  category: Category;
  matchedVia: 'merchant_map' | 'keyword' | 'default';
}

/**
 * Classifies an expense category based on learned user preferences,
 * registered merchant rules, and keyword heuristics.
 */
export function classify(
  merchantAlias: string | null,
  rawMessage: string,
): ClassificationResult {
  // 1. Check exact user preference mappings from database / memory
  if (merchantAlias) {
    const mapped = getMerchantMapping(merchantAlias);
    if (mapped) {
      return { category: mapped.category, matchedVia: 'merchant_map' };
    }
  }

  const categoryRules = configManager.getCategoryRules();
  const searchTarget = `${merchantAlias || ''} ${rawMessage}`.toUpperCase();

  // 2. Exact or word-boundary merchant rule match
  for (const [merchName, cat] of Object.entries(categoryRules.merchantCategories)) {
    const escaped = merchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(searchTarget)) {
      return { category: cat as Category, matchedVia: 'keyword' };
    }
  }

  // 3. Keyword heuristic on message content
  for (const [categoryName, keywords] of Object.entries(categoryRules.keywordCategories)) {
    for (const kw of keywords) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(searchTarget)) {
        return { category: categoryName as Category, matchedVia: 'keyword' };
      }
    }
  }

  // 4. Default fallback category
  return { category: (categoryRules.defaultCategory || 'Other') as Category, matchedVia: 'default' };
}
