import {
  ITagLearningEngine,
  TagFeatureVector,
  TagModelData,
  TagPrediction,
} from './contracts';

const CURRENT_MODEL_VERSION = 1;

/** Default weights assigned to different feature types */
const WEIGHT_ENTITY = 4.0;
const WEIGHT_CHANNEL = 3.5;
const WEIGHT_SENDER = 3.0;
const WEIGHT_CATEGORY = 2.5;
const WEIGHT_TOKEN = 1.2;

/**
 * Baseline statistical priors to bootstrap the cold-start state
 * without requiring brittle regex rules.
 */
function createDefaultModelData(): TagModelData {
  return {
    version: CURRENT_MODEL_VERSION,
    updatedAt: Date.now(),
    entityWeights: {
      'net.one97.paytm': { UPI: 10, Personal: 5 },
      'com.google.android.apps.nbu.paisa': { UPI: 10, Personal: 5 },
      'com.phonepe.app': { UPI: 10, Personal: 5 },
      'in.org.npci.upiapp': { UPI: 10, Personal: 5 },
      swiggy: { Personal: 8 },
      zomato: { Personal: 8 },
      starbucks: { Personal: 6 },
      'dominos pizza': { Personal: 6 },
      dominos: { Personal: 6 },
      uber: { Personal: 5 },
      ola: { Personal: 5 },
      amazon: { Personal: 6 },
      flipkart: { Personal: 6 },
      myntra: { Personal: 6 },
      github: { Work: 10 },
      aws: { Work: 10 },
      google_cloud: { Work: 10 },
      coursera: { School: 8 },
      udemy: { School: 8 },
    },
    categoryWeights: {
      'food & dining': { Personal: 8 },
      shopping: { Personal: 7 },
      entertainment: { Personal: 7 },
      'personal care': { Personal: 9 },
      travel: { Personal: 5 },
      groceries: { Family: 8, Personal: 5 },
      bills: { Family: 8 },
      education: { School: 10 },
      business: { Work: 10 },
    },
    channelWeights: {
      upi: { UPI: 15 },
      wallet: { Personal: 6 },
      cc: { Personal: 4 },
      dc: { Personal: 4 },
      netbanking: { Personal: 3 },
    },
    tokenWeights: {
      upi: { UPI: 10 },
      gpay: { UPI: 8 },
      phonepe: { UPI: 8 },
      paytm: { UPI: 8 },
      bhim: { UPI: 8 },
      vpa: { UPI: 8 },
      dinner: { Personal: 5, Friends: 4 },
      lunch: { Personal: 5, Work: 3 },
      coffee: { Personal: 5, Work: 3 },
      grocery: { Family: 6 },
      rent: { Family: 8 },
      tuition: { School: 8 },
      books: { School: 6 },
      office: { Work: 8 },
      client: { Work: 8 },
      team: { Work: 6, Friends: 4 },
      trip: { Friends: 6, Personal: 4 },
      split: { Friends: 8 },
    },
    tagTotals: {
      UPI: 35,
      Personal: 40,
      Work: 20,
      Family: 15,
      Friends: 15,
      School: 15,
    },
    totalObservations: 140,
  };
}

/**
 * On-Device Self-Learning Dynamic Tag Engine.
 * Multi-label statistical affinity scorer with continuous online learning.
 */
export class TagLearningEngine implements ITagLearningEngine {
  private data: TagModelData;

  constructor(initialData?: TagModelData) {
    this.data = initialData || createDefaultModelData();
  }

  /**
   * Predicts top tags for the provided feature vector using weighted log-likelihood.
   * Capped to maxTags (defaults to 3 per user specification).
   */
  public predict(
    features: TagFeatureVector,
    maxTags: number = 3,
    threshold: number = 0.35,
  ): TagPrediction[] {
    const scores: Record<string, { total: number; evidence: string[] }> = {};

    const addScore = (tag: string, points: number, reason: string) => {
      if (!scores[tag]) {
        scores[tag] = { total: 0, evidence: [] };
      }
      scores[tag].total += points;
      scores[tag].evidence.push(reason);
    };

    // 1. Entity / Debtor / Creditor affinity
    if (features.entity) {
      const entKey = features.entity.trim().toLowerCase();
      const entityMap = this.data.entityWeights[entKey];
      if (entityMap) {
        for (const [tag, count] of Object.entries(entityMap)) {
          const affinity = count / (this.data.tagTotals[tag] || 10);
          addScore(tag, affinity * WEIGHT_ENTITY, `entity:${features.entity}`);
        }
      }
    }

    // 2. Sender package / SMS header affinity
    if (features.sender) {
      const senderKey = features.sender.trim().toLowerCase();
      const senderMap = this.data.entityWeights[senderKey];
      if (senderMap) {
        for (const [tag, count] of Object.entries(senderMap)) {
          const affinity = count / (this.data.tagTotals[tag] || 10);
          addScore(tag, affinity * WEIGHT_SENDER, `sender:${features.sender}`);
        }
      }
    }

    // 3. Payment mode / channel affinity
    if (features.paymentMode) {
      const modeKey = features.paymentMode.trim().toLowerCase();
      const channelMap = this.data.channelWeights[modeKey];
      if (channelMap) {
        for (const [tag, count] of Object.entries(channelMap)) {
          const affinity = count / (this.data.tagTotals[tag] || 10);
          addScore(tag, affinity * WEIGHT_CHANNEL, `channel:${features.paymentMode}`);
        }
      }
    }

    // 4. Category affinity
    if (features.category) {
      const catKey = features.category.trim().toLowerCase();
      const catMap = this.data.categoryWeights[catKey];
      if (catMap) {
        for (const [tag, count] of Object.entries(catMap)) {
          const affinity = count / (this.data.tagTotals[tag] || 10);
          addScore(tag, affinity * WEIGHT_CATEGORY, `category:${features.category}`);
        }
      }
    }

    // 5. Token stream likelihood
    if (features.tokens && features.tokens.length > 0) {
      for (const token of features.tokens) {
        const tKey = token.toLowerCase();
        const tokenMap = this.data.tokenWeights[tKey];
        if (tokenMap) {
          for (const [tag, count] of Object.entries(tokenMap)) {
            const affinity = count / (this.data.tagTotals[tag] || 10);
            addScore(tag, affinity * WEIGHT_TOKEN, `token:${tKey}`);
          }
        }
      }
    }

    // Convert raw accumulated scores to bounded confidence via sigmoid mapping:
    // P = 1 / (1 + e^(-score / 2.5))
    const predictions: TagPrediction[] = [];
    for (const [tag, data] of Object.entries(scores)) {
      const confidence = 1 / (1 + Math.exp(-data.total / 2.5));
      if (confidence >= threshold) {
        predictions.push({
          tag,
          confidence: Math.round(confidence * 100) / 100,
          matchedFeatures: data.evidence,
        });
      }
    }

    // Sort by confidence descending, cap to maxTags (3)
    return predictions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxTags);
  }

  /**
   * Online dynamic training: Updates frequency co-occurrences
   * when a user saves or edits a transaction with tags.
   */
  public learn(features: TagFeatureVector, tags: string[]): void {
    if (!tags || tags.length === 0) return;

    for (const rawTag of tags) {
      const tag = rawTag.trim();
      if (!tag) continue;

      this.data.tagTotals[tag] = (this.data.tagTotals[tag] || 0) + 1;

      // Update entity association
      if (features.entity) {
        const entKey = features.entity.trim().toLowerCase();
        if (!this.data.entityWeights[entKey]) this.data.entityWeights[entKey] = {};
        this.data.entityWeights[entKey][tag] = (this.data.entityWeights[entKey][tag] || 0) + 1;
      }

      // Update sender association
      if (features.sender) {
        const senderKey = features.sender.trim().toLowerCase();
        if (!this.data.entityWeights[senderKey]) this.data.entityWeights[senderKey] = {};
        this.data.entityWeights[senderKey][tag] = (this.data.entityWeights[senderKey][tag] || 0) + 1;
      }

      // Update channel association
      if (features.paymentMode) {
        const modeKey = features.paymentMode.trim().toLowerCase();
        if (!this.data.channelWeights[modeKey]) this.data.channelWeights[modeKey] = {};
        this.data.channelWeights[modeKey][tag] = (this.data.channelWeights[modeKey][tag] || 0) + 1;
      }

      // Update category association
      if (features.category) {
        const catKey = features.category.trim().toLowerCase();
        if (!this.data.categoryWeights[catKey]) this.data.categoryWeights[catKey] = {};
        this.data.categoryWeights[catKey][tag] = (this.data.categoryWeights[catKey][tag] || 0) + 1;
      }

      // Update token associations
      if (features.tokens && features.tokens.length > 0) {
        for (const token of features.tokens) {
          const tKey = token.toLowerCase();
          if (tKey.length < 2) continue;
          if (!this.data.tokenWeights[tKey]) this.data.tokenWeights[tKey] = {};
          this.data.tokenWeights[tKey][tag] = (this.data.tokenWeights[tKey][tag] || 0) + 1;
        }
      }
    }

    this.data.totalObservations += 1;
    this.data.updatedAt = Date.now();
  }

  public serialize(): TagModelData {
    return JSON.parse(JSON.stringify(this.data));
  }

  public load(data: TagModelData): void {
    if (data && data.version === CURRENT_MODEL_VERSION) {
      this.data = data;
    }
  }

  public reset(): void {
    this.data = createDefaultModelData();
  }
}

/** Global singleton instance for on-device tag classification */
export const defaultTagLearningEngine = new TagLearningEngine();

