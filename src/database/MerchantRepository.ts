/**
 * MerchantRepository — focused interface for `merchant_categories` persistence.
 *
 * Owns all read/write operations for the merchant → category mapping table
 * and BayesClassifier model state (classifier_state table).
 */

export {
  saveMerchantCategory,
  loadMerchantCategories,
  getSetting,
  setSetting,
} from './expenseRepo';
