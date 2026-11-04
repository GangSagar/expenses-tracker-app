import { configManager } from '../config';
import { NormalizedMessage } from '../normalizer';

const GENERIC_EXCLUSIONS = new Set([
  'THE', 'YOUR', 'ANY', 'MY', 'OUR', 'A', 'AN', 'NEW',
  'BLOOD', 'FOOD', 'RESERVE', 'COMMERCIAL', 'WORLD', 'PIGGY',
  'POWER', 'DATA', 'MEMORY', 'RIVER', 'TEST', 'ONLINE',
  'MOBILE', 'INTERNET', 'PHONE', 'SMS', 'CALL', 'NET', 'INFO',
]);

const CARD_NETWORK_EXCLUSIONS = new Set([
  'CREDIT', 'DEBIT', 'CARD', 'CARDS', 'FOREX', 'PREPAID',
  'VISA', 'MASTERCARD', 'MASTER', 'RUPAY', 'AMEX', 'AMERICAN EXPRESS',
  'DINERS', 'GIFT', 'VIRTUAL', 'CORPORATE', 'BUSINESS', 'TITANIUM',
  'PLATINUM', 'GOLD', 'SILVER', 'REWARDS', 'CASHBACK', 'YOUR', 'THE',
  'MY', 'OUR', 'A', 'AN', 'NEW', 'ONLINE',
]);

export class BankExtractor {
  public extract(sender: string, message: NormalizedMessage): string | null {
    const bankRegistry = configManager.getBankRegistry();
    const upperSender = (sender || '').toUpperCase();
    const cleanBody = message.clean;
    const upperBody = cleanBody.toUpperCase();

    // 1. First priority: Check sender ID
    if (upperSender) {
      for (const entry of bankRegistry) {
        if (entry.code && upperSender.includes(entry.code.toUpperCase())) {
          return entry.name;
        }
        for (const kw of entry.senderKeywords) {
          if (upperSender.includes(kw.toUpperCase())) {
            return entry.name;
          }
        }
      }
    }

    // 2. High-priority message signatures / sign-offs (e.g. "- BOB", "Call ...-BOB", "-BOI", "-P&SB")
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
    for (const entry of bankRegistry) {
      for (const kw of entry.bodyKeywords) {
        const searchKw = kw.toUpperCase();
        if (searchKw.length <= 4) {
          const regex = new RegExp(`\\b${searchKw}\\b`, 'i');
          if (regex.test(bodyWithoutVpa)) {
            return entry.name;
          }
        } else {
          if (bodyWithoutVpa.includes(searchKw)) {
            return entry.name;
          }
        }
      }
    }

    // 5. Structural Linguistic Grammar Heuristics (Universal Global Bank Detection)
    // 5a. "<Bank Name> Bank" or "<Bank Name> Payments Bank"
    const bankSuffixMatch = cleanBody.match(/\b([A-Z][a-zA-Z0-9&]*(?:\s+[A-Z][a-zA-Z0-9&]*){0,3})\s+(?:Bank|Banking|Payments\s+Bank|BANK|BANKING)\b/);
    if (bankSuffixMatch) {
      const candidate = bankSuffixMatch[1].trim();
      const upperCand = candidate.toUpperCase();
      if (!GENERIC_EXCLUSIONS.has(upperCand) && candidate.length >= 2) {
        return `${candidate} Bank`;
      }
    }

    // 5b. "Bank of <Name>"
    const bankOfMatch = cleanBody.match(/\bBank\s+of\s+([A-Z][a-zA-Z0-9&]*(?:\s+[A-Z][a-zA-Z0-9&]*){0,2})\b/);
    if (bankOfMatch) {
      const candidate = bankOfMatch[1].trim();
      const upperCand = candidate.toUpperCase();
      if (!GENERIC_EXCLUSIONS.has(upperCand) && candidate.length >= 2) {
        return `Bank of ${candidate}`;
      }
    }

    // 5c. "<Bank Name> Credit/Debit Card"
    const cardMatch = cleanBody.match(/\b(?:[Yy]our\s+)?([A-Z][a-zA-Z0-9&]*(?:\s+[A-Z][a-zA-Z0-9&]*){0,2})\s+(?:Credit|Debit|credit|debit)?\s*(?:Card|CARD|card)\b/);
    if (cardMatch) {
      let candidate = cardMatch[1].trim();
      candidate = candidate.replace(/^(?:your|the|a|an|my|our)\s+/i, '').trim();
      const upperCand = candidate.toUpperCase();
      if (!CARD_NETWORK_EXCLUSIONS.has(upperCand) && !GENERIC_EXCLUSIONS.has(upperCand) && candidate.length >= 2) {
        return candidate;
      }
    }

    return null;
  }
}

export const bankExtractor = new BankExtractor();
