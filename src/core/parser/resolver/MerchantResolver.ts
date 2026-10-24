import { configManager } from '../config';
import { ExtractedVpa } from '../extractor';
import { ILearningEngine } from '../learning/LearningEngine';

export interface ResolvedMerchant {
  raw: string;
  normalized: string;
  confidence: number;
  source: 'learned' | 'alias' | 'cleaned' | 'vpa' | 'unknown';
}

export interface IMerchantResolver {
  resolve(rawMerchant: string | null, vpa?: ExtractedVpa | null, learningEngine?: ILearningEngine | null): ResolvedMerchant;
}

export class MerchantResolver implements IMerchantResolver {
  public resolve(
    rawMerchant: string | null,
    vpa?: ExtractedVpa | null,
    learningEngine?: ILearningEngine | null
  ): ResolvedMerchant {
    // 1. If no raw merchant candidate, check VPA
    let candidate = rawMerchant?.trim();
    let isFromVpa = false;

    if (!candidate && vpa && vpa.vpa) {
      // If VPA is a phone number like 8543851508@ybl, use full VPA as candidate
      if (vpa.isPhoneNumber) {
        candidate = vpa.vpa;
      } else {
        // e.g. "netflixupi.payu@hdfcbank" -> "netflixupi"
        const cleanUser = vpa.username.split('.')[0];
        candidate = cleanUser.length >= 3 ? cleanUser : vpa.vpa;
      }
      isFromVpa = true;
    }

    if (!candidate) {
      return {
        raw: '',
        normalized: 'Unknown',
        confidence: 0.1,
        source: 'unknown',
      };
    }

    // 2. Check Learning Engine first (user personalized knowledge base)
    if (learningEngine) {
      const learned = learningEngine.getLearnedMerchant(candidate);
      if (learned) {
        return {
          raw: candidate,
          normalized: learned.displayName,
          confidence: 1.0,
          source: 'learned',
        };
      }
    }

    const aliasConfig = configManager.getMerchantAliases();
    let cleaned = candidate;

    // 3. Strip payment gateway / aggregator prefixes (e.g. PAY*Tobox Ventu -> Tobox Ventu)
    for (const prefix of aliasConfig.stripPrefixes) {
      const upper = cleaned.toUpperCase();
      const upperPrefix = prefix.toUpperCase();
      if (upper.startsWith(upperPrefix)) {
        cleaned = cleaned.substring(prefix.length).trim();
      }
    }

    // 4. Strip corporate suffixes (e.g. "Swiggy Pvt Ltd" -> "Swiggy")
    for (const suffix of aliasConfig.stripSuffixes) {
      const regex = new RegExp(`\\b${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      cleaned = cleaned.replace(regex, '').trim();
    }

    // Collapse spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // 5. Check alias dictionary
    const upperCleaned = cleaned.toUpperCase();
    if (aliasConfig.aliases[upperCleaned]) {
      return {
        raw: candidate,
        normalized: aliasConfig.aliases[upperCleaned],
        confidence: 0.95,
        source: 'alias',
      };
    }

    // Check if the original candidate matches an alias
    const upperOrig = candidate.toUpperCase();
    if (aliasConfig.aliases[upperOrig]) {
      return {
        raw: candidate,
        normalized: aliasConfig.aliases[upperOrig],
        confidence: 0.95,
        source: 'alias',
      };
    }

    // 6. Title-case formatting for unknown but clean candidates
    const formatted = this.toTitleCase(cleaned || candidate);

    return {
      raw: candidate,
      normalized: formatted,
      confidence: isFromVpa ? 0.70 : 0.85,
      source: isFromVpa ? 'vpa' : 'cleaned',
    };
  }

  private toTitleCase(str: string): string {
    if (!str) return '';
    // If it's a VPA like "user@okhdfcbank", keep as is
    if (str.includes('@')) return str;
    return str
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

export const defaultMerchantResolver = new MerchantResolver();
