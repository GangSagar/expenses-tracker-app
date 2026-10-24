import { configManager } from '../config';
import { ConfidenceEvaluation } from './ConfidenceResult';

export interface ModuleConfidenceInputs {
  amountConfidence: number;
  transactionConfidence: number;
  merchantConfidence: number;
  categoryConfidence: number;
  accountConfidence: number;
}

export interface IConfidenceEngine {
  evaluate(inputs: ModuleConfidenceInputs): ConfidenceEvaluation;
}

export class ConfidenceEngine implements IConfidenceEngine {
  public evaluate(inputs: ModuleConfidenceInputs): ConfidenceEvaluation {
    const config = configManager.getConfig();
    const weights = config.weights;

    // Normalize weights to sum to 1.0 in case user customized them
    const totalWeight =
      weights.amountWeight +
      weights.transactionWeight +
      weights.merchantWeight +
      weights.categoryWeight +
      weights.accountWeight;

    const wAmount = weights.amountWeight / totalWeight;
    const wTxn = weights.transactionWeight / totalWeight;
    const wMerch = weights.merchantWeight / totalWeight;
    const wCat = weights.categoryWeight / totalWeight;
    const wAcct = weights.accountWeight / totalWeight;

    const amount = this.clamp(inputs.amountConfidence);
    const transactionType = this.clamp(inputs.transactionConfidence);
    const merchant = this.clamp(inputs.merchantConfidence);
    const category = this.clamp(inputs.categoryConfidence);
    const account = this.clamp(inputs.accountConfidence);

    const overall =
      amount * wAmount +
      transactionType * wTxn +
      merchant * wMerch +
      category * wCat +
      account * wAcct;

    const roundedOverall = Math.round(overall * 100) / 100;
    const requiresConfirmation = roundedOverall < config.confirmationThreshold;

    return {
      overall: roundedOverall,
      breakdown: {
        amount,
        transactionType,
        merchant,
        category,
        account,
        overall: roundedOverall,
      },
      requiresConfirmation,
    };
  }

  private clamp(val: number): number {
    if (isNaN(val)) return 0;
    return Math.max(0, Math.min(1, Math.round(val * 100) / 100));
  }
}

export const defaultConfidenceEngine = new ConfidenceEngine();
