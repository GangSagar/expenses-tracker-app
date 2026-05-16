import { Category } from '../../types/expense';
import { categoryRules } from './rules';
import { getMerchantMapping } from './merchantMap';

export interface ClassificationResult {
  category: Category;
  matchedVia: 'merchant_map' | 'keyword' | 'default';
}

export function classify(
  merchantAlias: string | null,
  rawMessage: string,
): ClassificationResult {
  // 1. Try exact merchant map first (user corrections)
  if (merchantAlias) {
    const mapped = getMerchantMapping(merchantAlias);
    if (mapped) {
      return { category: mapped.category, matchedVia: 'merchant_map' };
    }
  }

  // 2. Keyword/substring match against category rules
  const searchText = `${merchantAlias || ''} ${rawMessage}`.toLowerCase();

  for (const rule of categoryRules) {
    for (const keyword of rule.keywords) {
      if (searchText.includes(keyword)) {
        return { category: rule.category, matchedVia: 'keyword' };
      }
    }
  }

  // 3. Default to "Other"
  return { category: 'Other', matchedVia: 'default' };
}
