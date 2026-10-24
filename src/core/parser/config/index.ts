import bankRulesJson from './bankRules.json';
import merchantAliasesJson from './merchantAliases.json';
import categoryRulesJson from './categoryRules.json';
import tokenDictionaryJson from './tokenDictionary.json';
import {
  BankRule,
  MerchantAliasConfig,
  CategoryRuleConfig,
  TokenDictionaryConfig,
  ParserEngineConfig,
  DEFAULT_PARSER_CONFIG,
} from './parserConfig';

export * from './parserConfig';

export class ParserConfigurationManager {
  private static instance: ParserConfigurationManager;
  private config: ParserEngineConfig;
  private bankRules: BankRule[];
  private merchantAliases: MerchantAliasConfig;
  private categoryRules: CategoryRuleConfig;
  private tokenDictionary: TokenDictionaryConfig;

  private constructor() {
    this.config = { ...DEFAULT_PARSER_CONFIG };
    this.bankRules = bankRulesJson as BankRule[];
    this.merchantAliases = merchantAliasesJson as MerchantAliasConfig;
    this.categoryRules = categoryRulesJson as CategoryRuleConfig;
    this.tokenDictionary = tokenDictionaryJson as TokenDictionaryConfig;
  }

  public static getInstance(): ParserConfigurationManager {
    if (!ParserConfigurationManager.instance) {
      ParserConfigurationManager.instance = new ParserConfigurationManager();
    }
    return ParserConfigurationManager.instance;
  }

  public getConfig(): ParserEngineConfig {
    return this.config;
  }

  public setConfig(newConfig: Partial<ParserEngineConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getBankRules(): BankRule[] {
    return this.bankRules;
  }

  public addBankRule(rule: BankRule): void {
    this.bankRules.unshift(rule);
  }

  public getMerchantAliases(): MerchantAliasConfig {
    return this.merchantAliases;
  }

  public setMerchantAlias(raw: string, normalized: string): void {
    this.merchantAliases.aliases[raw.toUpperCase()] = normalized;
  }

  public getCategoryRules(): CategoryRuleConfig {
    return this.categoryRules;
  }

  public getTokenDictionary(): TokenDictionaryConfig {
    return this.tokenDictionary;
  }
}

export const configManager = ParserConfigurationManager.getInstance();
