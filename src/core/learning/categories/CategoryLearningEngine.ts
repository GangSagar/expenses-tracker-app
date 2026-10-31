import { Category } from '../../../types/expense';
import {
  CategoryFeatureVector,
  CategoryModelData,
  CategorySuggestion,
  ICategoryLearningEngine,
} from './contracts';

const CURRENT_MODEL_VERSION = 1;

const WEIGHT_ENTITY = 5.0;
const WEIGHT_TOKEN = 2.0;
const WEIGHT_SENDER = 1.5;
const WEIGHT_CHANNEL = 1.0;

function createDefaultCategoryModelData(): CategoryModelData {
  const categoryTotals: Record<Category, number> = {
    'Food & Dining': 30,
    Shopping: 25,
    Travel: 25,
    Groceries: 20,
    'Bills & Recharge': 20,
    Entertainment: 15,
    Health: 15,
    Finance: 15,
    Education: 15,
    'Self-transfers': 10,
    Transfers: 10,
    Games: 10,
    Other: 10,
  };

  return {
    version: CURRENT_MODEL_VERSION,
    updatedAt: Date.now(),
    entityWeights: {
      swiggy: { 'Food & Dining': 15 },
      zomato: { 'Food & Dining': 15 },
      starbucks: { 'Food & Dining': 12 },
      dominos: { 'Food & Dining': 12 },
      'dominos pizza': { 'Food & Dining': 12 },
      mcdonald: { 'Food & Dining': 10 },
      'chai point': { 'Food & Dining': 10 },
      uber: { Travel: 15 },
      ola: { Travel: 12 },
      rapido: { Travel: 10 },
      irctc: { Travel: 15 },
      indigo: { Travel: 12 },
      fastag: { Travel: 10 },
      'shell petrol pump': { Travel: 10 },
      amazon: { Shopping: 15 },
      flipkart: { Shopping: 15 },
      myntra: { Shopping: 12 },
      ajio: { Shopping: 10 },
      zara: { Shopping: 10 },
      blinkit: { Groceries: 15 },
      zepto: { Groceries: 15 },
      instamart: { Groceries: 12 },
      bigbasket: { Groceries: 15 },
      dmart: { Groceries: 12 },
      airtel: { 'Bills & Recharge': 12 },
      jio: { 'Bills & Recharge': 12 },
      bescom: { 'Bills & Recharge': 12 },
      netflix: { Entertainment: 15 },
      spotify: { Entertainment: 12 },
      pvr: { Entertainment: 12 },
      inox: { Entertainment: 10 },
      apollo: { Health: 12 },
      '1mg': { Health: 12 },
      cultfit: { Health: 10 },
      coursera: { Education: 12 },
      udemy: { Education: 12 },
      aws: { Finance: 12 },
      github: { Finance: 12 },
      google_cloud: { Finance: 12 },
    },
    senderWeights: {
      'net.one97.paytm': { 'Food & Dining': 5, Shopping: 5, Travel: 3 },
      'com.google.android.apps.nbu.paisa': { 'Food & Dining': 5, Shopping: 5 },
      'com.phonepe.app': { 'Food & Dining': 5, Shopping: 5, 'Bills & Recharge': 4 },
    },
    tokenWeights: {
      food: { 'Food & Dining': 10 },
      dining: { 'Food & Dining': 10 },
      restaurant: { 'Food & Dining': 10 },
      cafe: { 'Food & Dining': 10 },
      coffee: { 'Food & Dining': 8 },
      tea: { 'Food & Dining': 8 },
      pizza: { 'Food & Dining': 10 },
      burger: { 'Food & Dining': 8 },
      lunch: { 'Food & Dining': 8 },
      dinner: { 'Food & Dining': 8 },
      breakfast: { 'Food & Dining': 6 },
      travel: { Travel: 10 },
      trip: { Travel: 8 },
      ride: { Travel: 10 },
      cab: { Travel: 10 },
      fuel: { Travel: 8 },
      petrol: { Travel: 8 },
      toll: { Travel: 8 },
      flight: { Travel: 10 },
      train: { Travel: 10 },
      metro: { Travel: 8 },
      grocery: { Groceries: 12 },
      groceries: { Groceries: 12 },
      supermarket: { Groceries: 10 },
      vegetables: { Groceries: 8 },
      milk: { Groceries: 8 },
      fruits: { Groceries: 8 },
      shopping: { Shopping: 10 },
      cloth: { Shopping: 8 },
      shoes: { Shopping: 8 },
      mall: { Shopping: 8 },
      bill: { 'Bills & Recharge': 10 },
      recharge: { 'Bills & Recharge': 10 },
      electricity: { 'Bills & Recharge': 10 },
      broadband: { 'Bills & Recharge': 8 },
      water: { 'Bills & Recharge': 6 },
      gas: { 'Bills & Recharge': 6 },
      movie: { Entertainment: 10 },
      cinema: { Entertainment: 10 },
      show: { Entertainment: 8 },
      game: { Games: 10, Entertainment: 8 },
      music: { Entertainment: 8 },
      pharmacy: { Health: 10 },
      medicine: { Health: 10 },
      hospital: { Health: 10 },
      doctor: { Health: 8 },
      fitness: { Health: 8 },
      gym: { Health: 8 },
      salon: { Health: 8 },
      course: { Education: 10 },
      tuition: { Education: 10 },
      school: { Education: 10 },
      college: { Education: 10 },
      books: { Education: 8 },
      exam: { Education: 8 },
      office: { Finance: 10 },
      client: { Finance: 10 },
      invoice: { Finance: 8 },
      server: { Finance: 8 },
      cloud: { Finance: 8 },
    },
    channelWeights: {
      upi: { 'Food & Dining': 5, Shopping: 4, Travel: 3 },
      cc: { Shopping: 5, Travel: 4, 'Food & Dining': 3 },
      cash: { 'Food & Dining': 4, Groceries: 4 },
      wallet: { 'Bills & Recharge': 5, 'Food & Dining': 3 },
    },
    categoryTotals,
    totalObservations: 200,
  };
}

export class CategoryLearningEngine implements ICategoryLearningEngine {
  private data: CategoryModelData;

  constructor(initialData?: CategoryModelData) {
    this.data = initialData || createDefaultCategoryModelData();
  }

  /**
   * Suggests ranked categories based on statistical feature likelihood.
   * Returns top suggestions sorted by confidence descending.
   */
  public suggest(
    features: CategoryFeatureVector,
    maxSuggestions: number = 3,
    threshold: number = 0.1,
  ): CategorySuggestion[] {
    const scores: Partial<Record<Category, { total: number; evidence: string[] }>> = {};

    const addScore = (cat: Category, points: number, reason: string) => {
      if (!scores[cat]) {
        scores[cat] = { total: 0, evidence: [] };
      }
      scores[cat]!.total += points;
      scores[cat]!.evidence.push(reason);
    };

    // 1. Entity / Debtor / Creditor affinity
    if (features.entity) {
      const entKey = features.entity.trim().toLowerCase();
      const entityMap = this.data.entityWeights[entKey];
      if (entityMap) {
        for (const [cat, count] of Object.entries(entityMap)) {
          if (count && count > 0) {
            const affinity = count / (this.data.categoryTotals[cat as Category] || 15);
            addScore(cat as Category, affinity * WEIGHT_ENTITY, `entity:${features.entity}`);
          }
        }
      }
    }

    // 2. Sender package / SMS header affinity
    if (features.sender) {
      const senderKey = features.sender.trim().toLowerCase();
      const senderMap = this.data.senderWeights[senderKey];
      if (senderMap) {
        for (const [cat, count] of Object.entries(senderMap)) {
          if (count && count > 0) {
            const affinity = count / (this.data.categoryTotals[cat as Category] || 15);
            addScore(cat as Category, affinity * WEIGHT_SENDER, `sender:${features.sender}`);
          }
        }
      }
    }

    // 3. Payment mode / channel affinity
    if (features.paymentMode) {
      const modeKey = features.paymentMode.trim().toLowerCase();
      const channelMap = this.data.channelWeights[modeKey];
      if (channelMap) {
        for (const [cat, count] of Object.entries(channelMap)) {
          if (count && count > 0) {
            const affinity = count / (this.data.categoryTotals[cat as Category] || 15);
            addScore(cat as Category, affinity * WEIGHT_CHANNEL, `channel:${features.paymentMode}`);
          }
        }
      }
    }

    // 4. Token stream likelihood
    if (features.tokens && features.tokens.length > 0) {
      for (const token of features.tokens) {
        const tKey = token.toLowerCase();
        const tokenMap = this.data.tokenWeights[tKey];
        if (tokenMap) {
          for (const [cat, count] of Object.entries(tokenMap)) {
            if (count && count > 0) {
              const affinity = count / (this.data.categoryTotals[cat as Category] || 15);
              addScore(cat as Category, affinity * WEIGHT_TOKEN, `token:${tKey}`);
            }
          }
        }
      }
    }

    // If no features matched, return default baseline "Other"
    const matchedCategories = Object.keys(scores) as Category[];
    if (matchedCategories.length === 0) {
      return [
        {
          category: 'Other',
          confidence: 0.5,
          matchedFeatures: ['fallback:no_matching_features'],
        },
      ];
    }

    // Compute relative softmax / normalized probabilities
    let sumScores = 0;
    for (const cat of matchedCategories) {
      sumScores += scores[cat]!.total;
    }

    const suggestions: CategorySuggestion[] = [];
    for (const cat of matchedCategories) {
      const rawScore = scores[cat]!.total;
      const confidence = sumScores > 0 ? Math.round((rawScore / sumScores) * 100) / 100 : 0.5;
      if (confidence >= threshold) {
        suggestions.push({
          category: cat,
          confidence,
          matchedFeatures: scores[cat]!.evidence,
        });
      }
    }

    // Sort by confidence descending, take top maxSuggestions
    suggestions.sort((a, b) => b.confidence - a.confidence);

    return suggestions.slice(0, maxSuggestions);
  }

  /**
   * Online dynamic training: Updates frequency co-occurrences
   * when a user saves or edits a transaction with a category.
   */
  public learn(features: CategoryFeatureVector, category: Category): void {
    if (!category) return;

    this.data.categoryTotals[category] = (this.data.categoryTotals[category] || 0) + 1;

    // Update entity association
    if (features.entity) {
      const entKey = features.entity.trim().toLowerCase();
      if (!this.data.entityWeights[entKey]) this.data.entityWeights[entKey] = {};
      this.data.entityWeights[entKey][category] =
        (this.data.entityWeights[entKey][category] || 0) + 1;
    }

    // Update sender association
    if (features.sender) {
      const senderKey = features.sender.trim().toLowerCase();
      if (!this.data.senderWeights[senderKey]) this.data.senderWeights[senderKey] = {};
      this.data.senderWeights[senderKey][category] =
        (this.data.senderWeights[senderKey][category] || 0) + 1;
    }

    // Update channel association
    if (features.paymentMode) {
      const modeKey = features.paymentMode.trim().toLowerCase();
      if (!this.data.channelWeights[modeKey]) this.data.channelWeights[modeKey] = {};
      this.data.channelWeights[modeKey][category] =
        (this.data.channelWeights[modeKey][category] || 0) + 1;
    }

    // Update token associations
    if (features.tokens && features.tokens.length > 0) {
      for (const token of features.tokens) {
        const tKey = token.toLowerCase();
        if (tKey.length < 2) continue;
        if (!this.data.tokenWeights[tKey]) this.data.tokenWeights[tKey] = {};
        this.data.tokenWeights[tKey][category] =
          (this.data.tokenWeights[tKey][category] || 0) + 1;
      }
    }

    this.data.totalObservations += 1;
    this.data.updatedAt = Date.now();
  }

  public serialize(): CategoryModelData {
    return JSON.parse(JSON.stringify(this.data));
  }

  public load(data: CategoryModelData): void {
    if (data && data.version === CURRENT_MODEL_VERSION) {
      this.data = data;
    }
  }

  public reset(): void {
    this.data = createDefaultCategoryModelData();
  }
}

/** Global singleton instance for on-device category learning & suggestion */
export const defaultCategoryLearningEngine = new CategoryLearningEngine();
