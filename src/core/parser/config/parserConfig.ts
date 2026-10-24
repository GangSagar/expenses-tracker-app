/**
 * Configuration interfaces and defaults for the Expense Parser Engine.
 */

export interface BankRule {
  id: string;
  name: string;
  senderKeywords: string[];
  bodyKeywords: string[];
  accountPrefixes?: string[];
  balanceKeywords?: string[];
}

export interface MerchantAliasConfig {
  aliases: Record<string, string>;
  stripPrefixes: string[];
  stripSuffixes: string[];
}

export interface CategoryRuleConfig {
  merchantCategories: Record<string, string>;
  keywordCategories: Record<string, string[]>;
  defaultCategory: string;
}

export interface TokenDictionaryConfig {
  debitKeywords: string[];
  creditKeywords: string[];
  refundKeywords: string[];
  reversalKeywords: string[];
  failedKeywords: string[];
  pendingKeywords: string[];
  chargebackKeywords: string[];
  currencies: Record<string, string>;
  accountLabels: string[];
  noiseWords: string[];
}

export interface ConfidenceWeights {
  amountWeight: number;
  transactionWeight: number;
  merchantWeight: number;
  categoryWeight: number;
  accountWeight: number;
}

export interface ParserEngineConfig {
  version: string;
  confirmationThreshold: number; // e.g. 0.75: below this, requiresConfirmation = true
  weights: ConfidenceWeights;
  enableAI: boolean;
  aiConfidenceThreshold: number; // e.g. 0.70: below this, invoke AI if enabled
}

export const DEFAULT_PARSER_CONFIG: ParserEngineConfig = {
  version: '2.0.0',
  confirmationThreshold: 0.75,
  weights: {
    amountWeight: 0.35,
    transactionWeight: 0.25,
    merchantWeight: 0.20,
    categoryWeight: 0.10,
    accountWeight: 0.10,
  },
  enableAI: false,
  aiConfidenceThreshold: 0.70,
};
