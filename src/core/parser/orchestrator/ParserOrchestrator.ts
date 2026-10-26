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
import { mayRunAIForContext, ParseExecutionContext } from '../ai/AIExtractionProposal';
import {
  AIExtractionEngine,
  AIExtractionProposal,
  validateAIExtractionProposal,
} from '../ai/AIExtractionProposal';

export interface IParserOrchestrator {
  parse(rawMessage: string, sender?: string, source?: TransactionSource): StructuredExpense | null;
  parseAsync(rawMessage: string, sender?: string, source?: TransactionSource, context?: ParseExecutionContext): Promise<StructuredExpense | null>;
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
  private aiExtractionEngine?: AIExtractionEngine;
  private isLocalAIEnabled: () => boolean;

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
    aiExtractionEngine?: AIExtractionEngine;
    isLocalAIEnabled?: () => boolean;
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
    this.aiExtractionEngine = dependencies?.aiExtractionEngine;
    this.isLocalAIEnabled = dependencies?.isLocalAIEnabled || (() => false);
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
        fieldEvidence: {
          amount: { value: entities.amount.value, confidence: entities.amount.confidence, source: 'deterministic' },
          currency: { value: entities.amount.currency, confidence: entities.amount.confidence, source: 'deterministic' },
          transactionType: { value: resolvedTxn.type === 'credit' || resolvedTxn.type === 'refund' || resolvedTxn.type === 'reversal' ? 'credit' : 'debit', confidence: resolvedTxn.confidence, source: 'deterministic' },
          merchant: { value: resolvedMerchant.normalized, confidence: resolvedMerchant.confidence, source: 'deterministic' },
          category: { value: resolvedCat.category, confidence: resolvedCat.confidence, source: 'deterministic' },
          ...(entities.referenceNumber ? { referenceId: { value: entities.referenceNumber, confidence: 0.9, source: 'deterministic' as const } } : {}),
        },
      };
    } catch (error) {
      console.error('ParserOrchestrator error while parsing message:', error);
      return null;
    }
  }

  public async parseAsync(
    rawMessage: string,
    sender: string = '',
    source: TransactionSource = 'sms',
    context: ParseExecutionContext = 'unknown',
  ): Promise<StructuredExpense | null> {
    let expense = this.parse(rawMessage, sender, source);

    // Background and unknown work remains deterministic. The current legacy
    // resolver only enriches merchant/category and is not trusted for scoring.
    if (
      mayRunAIForContext(context) &&
      this.aiExtractionEngine &&
      this.isLocalAIEnabled() &&
      (!expense || !expense.normalizedMerchant || expense.normalizedMerchant.toLowerCase() === 'unknown' ||
        expense.category === 'Other' || expense.confidence < this.config.getConfig().aiConfidenceThreshold)
    ) {
      try {
        // parse() returning null can mean missing amount. Recheck the message
        // filter before allowing inference to construct a review candidate.
        if (!expense && !this.filter.filter(rawMessage, sender).isTransaction) return null;
        const rawProposal = await this.aiExtractionEngine.propose({
            message: rawMessage,
            merchantCandidate: expense?.merchant || expense?.normalizedMerchant,
            context,
          });
        const rawMetadata = rawProposal && typeof rawProposal === 'object'
          ? rawProposal as { modelId?: unknown; modelVersion?: unknown }
          : {};
        const proposal = validateAIExtractionProposal(
          rawProposal,
          typeof rawMetadata.modelId === 'string' ? rawMetadata.modelId : 'configured-local-model',
          typeof rawMetadata.modelVersion === 'string' ? rawMetadata.modelVersion : 'configured-version',
        );
        if (proposal) expense = this.mergeAIProposal(expense, proposal, rawMessage, source);
      } catch {
        // Inference is best-effort. Deterministic parsing remains authoritative.
      }
    }
    if (!expense) return null;

    // An enabled proposal engine replaces the legacy enrichment path. When no
    // local slot is assigned, preserve the old opt-in resolver contract.
    if ((this.aiExtractionEngine && this.isLocalAIEnabled()) || !mayRunAIForContext(context)) return expense;

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
          const modelConfidence = Number.isFinite(aiResult.confidence)
            ? Math.max(0, Math.min(1, aiResult.confidence))
            : 0;
          const merchantConflict = Boolean(expense.normalizedMerchant && aiResult.merchant &&
            expense.normalizedMerchant.toLowerCase() !== aiResult.merchant.toLowerCase());
          const categoryConflict = expense.category !== 'Other' && aiResult.category !== expense.category;
          if (!expense.normalizedMerchant || expense.normalizedMerchant.toLowerCase() === 'unknown') {
            expense.normalizedMerchant = aiResult.merchant;
            expense.merchant = aiResult.merchant;
          }
          if (expense.category === 'Other') expense.category = aiResult.category;
          // Model confidence never raises parser confidence or grants auto-save.
          // Any model-derived enrichment requires the shared policy to review.
          if (merchantConflict || categoryConflict || modelConfidence > 0) {
            expense.requiresConfirmation = true;
          }
        }
      } catch (err) {
        console.warn('AIResolver execution failed:', err);
      }
    }

    return expense;
  }

  private mergeAIProposal(
    deterministic: StructuredExpense | null,
    proposal: AIExtractionProposal,
    rawMessage: string,
    source: TransactionSource,
  ): StructuredExpense | null {
    if (!deterministic) {
      // Amount and direction are required to form a candidate. It is always
      // marked for review and can never receive model-derived save authority.
      if (!proposal.amount || !proposal.transactionType) return null;
      const modelType = proposal.transactionType.value === 'credit' ? 'credit' : 'debit';
      const confidence = 0.5;
      return {
        amount: proposal.amount.value,
        currency: proposal.currency?.value === 'INR' || !proposal.currency ? '₹' : proposal.currency.value,
        merchant: proposal.merchant?.value || 'Unknown',
        normalizedMerchant: proposal.merchant?.value || 'Unknown',
        transactionType: modelType,
        paymentMode: 'unknown',
        account: null,
        category: proposal.category?.value || 'Other',
        timestamp: Date.now(),
        referenceNumber: proposal.referenceId?.value || null,
        confidence,
        confidenceBreakdown: {
          amount: proposal.amount.confidence,
          transactionType: proposal.transactionType.confidence,
          merchant: proposal.merchant?.confidence || 0,
          category: proposal.category?.confidence || 0,
          account: 0,
          overall: confidence,
        },
        requiresConfirmation: true,
        source,
        rawMessage,
        parserVersion: this.config.getConfig().version,
        aiProposal: proposal,
        fieldEvidence: {
          amount: proposal.amount,
          currency: proposal.currency,
          transactionType: proposal.transactionType,
          merchant: proposal.merchant,
          category: proposal.category,
          referenceId: proposal.referenceId,
        },
      };
    }

    const conflicts = [...proposal.conflicts];
    if (proposal.amount && proposal.amount.value !== deterministic.amount && !conflicts.includes('amount')) conflicts.push('amount');
    const deterministicCurrency = deterministic.currency === '₹' ? 'INR' : deterministic.currency.toUpperCase();
    if (proposal.currency && proposal.currency.value !== deterministicCurrency && !conflicts.includes('currency')) conflicts.push('currency');
    const deterministicDirection = deterministic.transactionType === 'credit' || deterministic.transactionType === 'refund' || deterministic.transactionType === 'reversal' ? 'credit' : 'debit';
    if (proposal.transactionType && proposal.transactionType.value !== deterministicDirection && !conflicts.includes('transactionType')) conflicts.push('transactionType');
    if (proposal.merchant && deterministic.normalizedMerchant && deterministic.normalizedMerchant.toLowerCase() !== 'unknown' &&
        proposal.merchant.value.toLowerCase() !== deterministic.normalizedMerchant.toLowerCase() && !conflicts.includes('merchant')) conflicts.push('merchant');
    if (proposal.category && deterministic.category !== 'Other' && proposal.category.value !== deterministic.category &&
        !conflicts.includes('category')) conflicts.push('category');
    if (proposal.referenceId && deterministic.referenceNumber && proposal.referenceId.value !== deterministic.referenceNumber &&
        !conflicts.includes('referenceId')) conflicts.push('referenceId');

    // Only fill unknown/default descriptive fields. Deterministic material facts
    // always win; any model evidence or conflict requests review.
    if ((!deterministic.normalizedMerchant || deterministic.normalizedMerchant.toLowerCase() === 'unknown') && proposal.merchant) {
      deterministic.merchant = proposal.merchant.value;
      deterministic.normalizedMerchant = proposal.merchant.value;
      deterministic.fieldEvidence = { ...deterministic.fieldEvidence, merchant: proposal.merchant };
    }
    if (deterministic.category === 'Other' && proposal.category) {
      deterministic.category = proposal.category.value;
      deterministic.fieldEvidence = { ...deterministic.fieldEvidence, category: proposal.category };
    }
    if (!deterministic.referenceNumber && proposal.referenceId) {
      deterministic.referenceNumber = proposal.referenceId.value;
      deterministic.fieldEvidence = { ...deterministic.fieldEvidence, referenceId: proposal.referenceId };
    }
    deterministic.requiresConfirmation = deterministic.requiresConfirmation || conflicts.length > 0 || Boolean(
      proposal.merchant || proposal.category || proposal.referenceId,
    );
    deterministic.aiProposal = { ...proposal, conflicts };
    return deterministic;
  }
}

export const defaultParserOrchestrator = new ParserOrchestrator();
