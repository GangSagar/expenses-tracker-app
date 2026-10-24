import { NormalizedMessage } from '../normalizer';
import { ExtractedEntities } from './ExtractedEntities';
import { amountExtractor } from './AmountExtractor';
import { accountExtractor } from './AccountExtractor';
import { vpaExtractor } from './VpaExtractor';
import { referenceExtractor } from './ReferenceExtractor';
import { balanceExtractor } from './BalanceExtractor';
import { bankExtractor } from './BankExtractor';
import { paymentModeExtractor } from './PaymentModeExtractor';
import { rawMerchantExtractor } from './RawMerchantExtractor';
import { ExtendedTransactionType } from '../models';

export interface IEntityExtractor {
  extract(normalized: NormalizedMessage, sender?: string): ExtractedEntities;
}

export class EntityExtractor implements IEntityExtractor {
  public extract(normalized: NormalizedMessage, sender: string = ''): ExtractedEntities {
    const amount = amountExtractor.extract(normalized);
    const account = accountExtractor.extract(normalized);
    const vpa = vpaExtractor.extract(normalized);
    const referenceNumber = referenceExtractor.extract(normalized);
    const availableBalance = balanceExtractor.extract(normalized);
    const bank = bankExtractor.extract(sender, normalized);
    const paymentMode = paymentModeExtractor.extract(normalized);
    const rawMerchant = rawMerchantExtractor.extract(normalized);

    // Initial signal detection for transaction type from canonical tokens
    let transactionSignal: ExtendedTransactionType = 'debit';
    const canonical = normalized.canonical;
    if (/\b(?:REFUND|CASHBACK)\b/.test(canonical)) {
      transactionSignal = 'refund';
    } else if (/\b(?:REVERSAL|REVERSED)\b/.test(canonical)) {
      transactionSignal = 'reversal';
    } else if (/\b(?:FAILED|DECLINED)\b/.test(canonical)) {
      transactionSignal = 'failed';
    } else if (/\b(?:PENDING|HOLD)\b/.test(canonical)) {
      transactionSignal = 'pending';
    } else if (/\bCREDIT\b/.test(canonical)) {
      transactionSignal = 'credit';
    } else if (/\bDEBIT\b/.test(canonical)) {
      transactionSignal = 'debit';
    }

    return {
      amount,
      rawMerchant,
      account,
      vpa,
      referenceNumber,
      availableBalance,
      bank,
      paymentMode,
      transactionSignal,
      timestamp: Date.now(),
      rawMessage: normalized.raw,
    };
  }
}

export const defaultEntityExtractor = new EntityExtractor();
