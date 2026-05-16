import { Category } from '../../types/expense';

export interface MerchantMapping {
  category: Category;
  displayName?: string;
}

// Merchant alias → Mapping (user corrections get added here)
let merchantCategoryMap: Record<string, MerchantMapping> = {};

export function initMerchantMap(initialMap: Record<string, MerchantMapping>): void {
  merchantCategoryMap = { ...initialMap };
  console.log(`Loaded ${Object.keys(merchantCategoryMap).length} merchant categories from DB.`);
}

export function getMerchantMapping(merchantAlias: string): MerchantMapping | null {
  const normalized = merchantAlias.toLowerCase().trim();
  return merchantCategoryMap[normalized] || null;
}

export function setMerchantMapping(
  merchantAlias: string,
  category: Category,
  displayName?: string
): void {
  const normalized = merchantAlias.toLowerCase().trim();
  merchantCategoryMap[normalized] = { category, displayName };
}

export function getMerchantMap(): Record<string, MerchantMapping> {
  return { ...merchantCategoryMap };
}
