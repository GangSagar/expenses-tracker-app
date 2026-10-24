import { configManager, BankRule } from '../config';
import { NormalizedMessage } from '../normalizer';

export class BankExtractor {
  public extract(sender: string, message: NormalizedMessage): string | null {
    const bankRules = configManager.getBankRules();
    const upperSender = (sender || '').toUpperCase();
    const cleanBody = message.clean;
    const upperBody = cleanBody.toUpperCase();

    // 1. First priority: Check sender ID
    if (upperSender) {
      for (const rule of bankRules) {
        for (const kw of rule.senderKeywords) {
          if (upperSender.includes(kw.toUpperCase())) {
            return rule.name;
          }
        }
      }
    }

    // 2. High-priority message signatures / sign-offs (e.g. "- BOB", "Call ...-BOB", "-BOI", "-P&SB")
    // Specifically test Bank of Baroda signature
    if (/-\s*BOB\b|18005700[/\d]*-BOB|\bBOB\s+UPI\b/i.test(cleanBody)) {
      return 'Bank of Baroda';
    }
    if (/-\s*BOI\b|\bBOI\s*-|\bBOI\s+UPI\b|\bBOI\b/i.test(cleanBody)) {
      return 'Bank of India';
    }
    if (/-\s*P&SB\b|-\s*PUNJAB&SIND\b|\bP&S\s+BANK\b|\bP&SB\b|\bPSB\s+UPI\b/i.test(cleanBody)) {
      return 'Punjab and Sind Bank';
    }

    // 3. Remove recipient VPA handles (@axisbank, @okhdfcbank, @okicici, @ybl)
    // so they do not falsely identify the sender's bank!
    const bodyWithoutVpa = upperBody.replace(/[A-Z0-9._-]+@[A-Z0-9.-]+/gi, '');

    // 4. Check body keywords on sanitized body
    for (const rule of bankRules) {
      for (const kw of rule.bodyKeywords) {
        const searchKw = kw.toUpperCase();
        // If keyword is a short 3-letter acronym (like PNB, SBI, BOB, UBI), require word boundary
        if (searchKw.length <= 4) {
          const regex = new RegExp(`\\b${searchKw}\\b`, 'i');
          if (regex.test(bodyWithoutVpa)) {
            return rule.name;
          }
        } else {
          if (bodyWithoutVpa.includes(searchKw)) {
            return rule.name;
          }
        }
      }
    }

    return null;
  }
}

export const bankExtractor = new BankExtractor();
