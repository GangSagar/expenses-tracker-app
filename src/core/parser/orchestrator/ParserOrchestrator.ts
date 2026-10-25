import { TransactionSource } from '../../../types/expense';
import { INormalizer, defaultNormalizer } from '../normalizer';
import { ITokenizer, defaultTokenizer } from '../tokenizer';
import { IEntityExtractor, defaultEntityExtractor } from '../extractor';
import { IMerchantResolver, defaultMerchantResolver } from '../resolver/MerchantResolver';
import { ITransactionResolver, defaultTransactionResolver } from '../resolver/TransactionResolver';
import { ICategoryResolver, defaultCategoryResolver } from '../resolver/CategoryResolver';
import { IConfidenceEngine, defaultConfidenceEngine } from '../confidence';
import { ILearningEngine, InMemoryLearningRepository, LearningEngine } from '../learning';
import { IAIResolver, defaultAIResolver } from '../ai';
import { MessageFilter, defaultMessageFilter } from '../filter';
import { configManager, ParserConfigurationManager } from '../config';
import { StructuredExpense } from '../models';

export interface IParserOrchestrator {
  parse(rawMessage: string, sender?: string, source?: TransactionSource): StructuredExpense | null;
  parseAsync(rawMessage: string, sender?: string, source?: TransactionSource): Promise<StructuredExpense | null>;
}

export class ParserOrchestrator implements IParserOrchestrator {
  private normalizer: INormalizer;
  private tokenizer: ITokenizer;
  private extractor: IEntityExtractor;
  private merchantResolver: IMerchantResolver;
  private transactionResolver: ITransactionResolver;
  private categoryResolver: ICategoryResolver;
  private confidenceEngine: IConfidenceEngine;
  private learningEngine: ILearningEngine;
  private aiResolver: IAIResolver;
  private filter: MessageFilter;
  private config: ParserConfigurationManager;

  constructor(dependencies?: {
    normalizer?: INormalizer;
    tokenizer?: ITokenizer;
    extractor?: IEntityExtractor;
    merchantResolver?: IMerchantResolver;
    transactionResolver?: ITransactionResolver;
    categoryResolver?: ICategoryResolver;
    confidenceEngine?: IConfidenceEngine;
    learningEngine?: ILearningEngine;
    aiResolver?: IAIResolver;
    filter?: MessageFilter;
    config?: ParserConfigurationManager;
  }) {
    this.normalizer = dependencies?.normalizer || defaultNormalizer;
    this.tokenizer = dependencies?.tokenizer || defaultTokenizer;
    this.extractor = dependencies?.extractor || defaultEntityExtractor;
    this.merchantResolver = dependencies?.merchantResolver || defaultMerchantResolver;
    this.transactionResolver = dependencies?.transactionResolver || defaultTransactionResolver;
    this.categoryResolver = dependencies?.categoryResolver || defaultCategoryResolver;
    this.confidenceEngine = dependencies?.confidenceEngine || defaultConfidenceEngine;
    this.learningEngine = dependencies?.learningEngine || new LearningEngine(new InMemoryLearningRepository());
    this.aiResolver = dependencies?.aiResolver || defaultAIResolver;
    this.filter = dependencies?.filter || defaultMessageFilter;
    this.config = dependencies?.config || configManager;
  }

  public parse(
    rawMessage: string,
    sender: string = '',
    source: TransactionSource = 'sms'
  ): StructuredExpense | null {
    try {
      // Step 0: Pre-flight sanity filter (reject OTP, login, pure balance, promotional)
      const filterRes = this.filter.filter(rawMessage, sender);
      if (!filterRes.isTransaction) {
        return null;
      }

      // Step 1: Normalizer
      const normalized = this.normalizer.normalize(rawMessage);

      // Step 2: Tokenizer
      const tokens = this.tokenizer.tokenize(normalized);

      // Step 3: Entity Extraction
      const entities = this.extractor.extract(normalized, sender);

      // If no monetary amount could be extracted, cannot form a structured expense
      if (!entities.amount || entities.amount.value <= 0) {
        return null;
      }

      // Step 4: Merchant Resolver (checks learning engine, strip prefixes/suffixes, aliases)
      const resolvedMerchant = this.merchantResolver.resolve(
        entities.rawMerchant,
        entities.vpa,
        this.learningEngine
      );

      // Step 5: Transaction Resolver (evaluates tokens, context, action verbs)
      const resolvedTxn = this.transactionResolver.resolve(
        tokens,
        normalized,
        entities.transactionSignal
      );

      // Step 6: Category Resolver (checks learning engine, merchant rules, keyword heuristics)
      const resolvedCat = this.categoryResolver.resolve(
        resolvedMerchant.normalized,
        resolvedMerchant.raw,
        rawMessage,
        this.learningEngine
      );

      // Step 7: Confidence Engine (computes per-module and weighted overall confidence)
      const accountConfidence = entities.account ? entities.account.confidence : 0.50;
      const confidenceEval = this.confidenceEngine.evaluate({
        amountConfidence: entities.amount.confidence,
        transactionConfidence: resolvedTxn.confidence,
        merchantConfidence: resolvedMerchant.confidence,
        categoryConfidence: resolvedCat.confidence,
        accountConfidence,
      });

      const currentVersion = this.config.getConfig().version;

      // Step 8: Assemble Structured Expense
      return {
        amount: entities.amount.value,
        currency: entities.amount.currency,
        merchant: resolvedMerchant.raw || resolvedMerchant.normalized,
        normalizedMerchant: resolvedMerchant.normalized,
        transactionType: resolvedTxn.type,
        paymentMode: entities.paymentMode,
        account: entities.account ? entities.account.accountNumber : null,
        bank: entities.bank || undefined,
        category: resolvedCat.category,
        timestamp: entities.timestamp,
        referenceNumber: entities.referenceNumber || null,
        availableBalance: entities.availableBalance,
        confidence: confidenceEval.overall,
        confidenceBreakdown: confidenceEval.breakdown,
        requiresConfirmation: confidenceEval.requiresConfirmation,
        source,
        rawMessage,
        parserVersion: currentVersion,
      };
    } catch (error) {
      console.error('ParserOrchestrator error while parsing message:', error);
      return null;
    }
  }

  public async parseAsync(
    rawMessage: string,
    sender: string = '',
    source: TransactionSource = 'sms'
  ): Promise<StructuredExpense | null> {
    const expense = this.parse(rawMessage, sender, source);
    if (!expense) return null;

    // Step 9: AI Resolver (Conditional fallback when needed)
    if (
      this.aiResolver.shouldInvoke(
        expense.normalizedMerchant,
        expense.category,
        expense.confidence
      )
    ) {
      try {
        const aiResult = await this.aiResolver.resolve(
          rawMessage,
          expense.merchant || expense.normalizedMerchant
        );
        if (aiResult) {
          expense.normalizedMerchant = aiResult.merchant;
          expense.category = aiResult.category;
          expense.confidence = Math.max(expense.confidence, aiResult.confidence);
          expense.requiresConfirmation = expense.confidence < this.config.getConfig().confirmationThreshold;
        }
      } catch (err) {
        console.warn('AIResolver execution failed:', err);
      }
    }

    return expense;
  }
}

export const defaultParserOrchestrator = new ParserOrchestrator();
