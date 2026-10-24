import { NormalizedMessage } from '../normalizer';

export class RawMerchantExtractor {
  public extract(message: NormalizedMessage): string | null {
    let cleanMessage = message.clean;

    // 1. Clean dates preceded by "on" so they aren't captured as merchants
    cleanMessage = cleanMessage.replace(/\bon\s+\d{1,2}[-/.]\w+[-/.]\d{2,4}\b/gi, '');
    cleanMessage = cleanMessage.replace(/\bon\s+\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/gi, '');
    cleanMessage = cleanMessage.replace(/\bon\s+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{2,4}\b/gi, '');
    cleanMessage = cleanMessage.replace(/\bon\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s+\d{2,4}\b/gi, '');

    // 2. High-signal directional targets (e.g. "Dr. to 8543851508@ybl", "Cr. to harshithrn@ybl", "paid to Uber", "spent at STARBUCKS")
    const directionalMatch = cleanMessage.match(
      /\b(?:credited|debited|spent|paid|transferred|transfer|trf|Cr\.?|Dr\.?)\s+(?:to|at|towards)\s+([A-Za-z0-9\s&'./\-@]+?)(?:\s+from\b|\s+using\b|\s+on\b|\s+[Rr]ef\b|\s+via\b|\s+UPI\b|\s+NEFT\b|\s+IMPS\b|\s+RTGS\b|\bAvl\s+Bal\b|\bAvailable\s+Bal\b|\bCredit\s+Limit\b|\bAvl\s+Limit\b|\.\s|\s*\(|[.\s]*$)/i
    );
    if (directionalMatch) {
      const name = this.cleanCandidate(directionalMatch[1]);
      if (this.isValidMerchantCandidate(name)) {
        return name;
      }
    }

    // 3. Explicit "at/to/towards <merchant>"
    const prepositionMatch = cleanMessage.match(
      /\b(?:at|(?<!linked\s+)\bto\b|towards)\s+([A-Za-z0-9\s&'./\-@]+?)(?:\s+-\s+[A-Za-z\s]+$|\s+from\b|\s+using\b|\s+on\b|\s+ref\b|\s+via\b|\s+upi\b|\s+neft\b|\s+imps\b|\s+rtgs\b|\bavl\s+bal\b|\bavailable\s+bal\b|\.\s|\s*\(|[.\s]*$)/i
    );
    if (prepositionMatch) {
      const name = this.cleanCandidate(prepositionMatch[1]);
      if (this.isValidMerchantCandidate(name)) {
        return name;
      }
    }

    // 3b. Fallback "for <merchant>" (ensuring it is not an amount like "for Rs. 500")
    const forMatch = cleanMessage.match(
      /\bfor\s+(?!(?:Rs\.?|INR|₹|\d))\s*([A-Za-z0-9\s&'./\-@]+?)(?:\s+-\s+[A-Za-z\s]+$|\s+from\b|\s+using\b|\s+on\b|\s+ref\b|\s+via\b|\s+upi\b|\s+neft\b|\s+imps\b|\s+rtgs\b|\bavl\s+bal\b|\bavailable\s+bal\b|\.\s|\s*\(|[.\s]*$)/i
    );
    if (forMatch) {
      const name = this.cleanCandidate(forMatch[1]);
      if (this.isValidMerchantCandidate(name)) {
        return name;
      }
    }

    // 4. Receiver/Payee label
    const receiverMatch = cleanMessage.match(
      /\b(?:receiver|reciever|payee)\s*[:\-]?\s*([A-Za-z0-9\s&'./\-@]+?)(?:\s+from\b|\s+using\b|\s+on\b|\s+[Rr]ef\b|\s+via\b|\s+UPI\b|\s+NEFT\b|\s+IMPS\b|\s+RTGS\b|\bAvl\s+Bal\b|\bAvailable\s+Bal\b|\.\s|\s*\(|[.\s]*$)/i
    );
    if (receiverMatch) {
      const name = this.cleanCandidate(receiverMatch[1]);
      if (this.isValidMerchantCandidate(name)) {
        return name;
      }
    }

    // 5. UPI reference block pattern: e.g. UPI/CR/534765332543/GANGA SAGAR/BARB/7930010000
    const upiBlockMatch = cleanMessage.match(/\bUPI\/(?:CR|DR)\/\d+\/([A-Za-z0-9\s&'./\-@]+?)(?:\/|$)/i);
    if (upiBlockMatch) {
      const name = this.cleanCandidate(upiBlockMatch[1]);
      if (this.isValidMerchantCandidate(name)) {
        return name;
      }
    }

    // 6. NEFT/IMPS reference payee patterns: e.g. NEFT-HSBCN08932182457-HP PPS
    const neftImpsMatch = cleanMessage.match(/\b(?:NEFT|IMPS|RTGS|UPI)-[A-Z0-9]+-([A-Za-z0-9\s&'./\-@]+?)(?:\.|\s+Available|$)/i);
    if (neftImpsMatch) {
      const name = this.cleanCandidate(neftImpsMatch[1]);
      if (this.isValidMerchantCandidate(name)) {
        return name;
      }
    }

    // 7. Check for "on <merchant>" where merchant is not a date (e.g. "on TECHMASH SOLUTI")
    const onMatch = cleanMessage.match(/\bon\s+([A-Za-z0-9\s&'./\-@]+?)(?:\s+using\b|\s+on\b|\s+[Rr]ef\b|\s+via\b|\s+UPI\b|\s+NEFT\b|\s+IMPS\b|\s+RTGS\b|\bAvl\s+Bal\b|\bAvailable\s+Bal\b|\bCredit\s+Limit\b|\bAvl\s+Limit\b|\.\s|\s*\(|[.\s]*$)/i);
    if (onMatch) {
      const name = this.cleanCandidate(onMatch[1]);
      const isDate = /^\d{1,2}[-/.]\w+[-/.]\d{2,4}$/i.test(name) ||
                     /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/i.test(name) ||
                     /^\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(name) ||
                     /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i.test(name);
      if (!isDate && this.isValidMerchantCandidate(name)) {
        return name;
      }
    }

    // 8. Fallback: extract from VPA handle (e.g. swiggy@icici -> swiggy, or 8543851508@ybl -> 8543851508@ybl)
    const vpaMatch = cleanMessage.match(/\b([A-Za-z0-9._-]+)@([A-Za-z0-9.-]+)\b/);
    if (vpaMatch) {
      const username = vpaMatch[1];
      const handle = vpaMatch[2].toLowerCase();
      // Only treat as VPA if it is a banking handle
      if (!handle.endsWith('.com') && !handle.endsWith('.org')) {
        // If username is all digits (phone number VPA), return full VPA
        if (/^\d{10}$/.test(username)) {
          return vpaMatch[0];
        }
        // If username starts with a letter, return username
        if (/^[A-Za-z]/.test(username) && username.length >= 3) {
          return username;
        }
        return vpaMatch[0];
      }
    }

    return null;
  }

  private cleanCandidate(raw: string): string {
    if (!raw) return '';
    let cleaned = raw.trim();

    // Remove leading/trailing dates
    cleaned = cleaned.replace(/^\b\d{1,2}(?:\s*|-)*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z0-9]*(?:\s*|-)*\d{2,4}\b/i, '');
    cleaned = cleaned.replace(/^\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/i, '');

    // Remove standard bank transaction words/prefixes at the start
    cleaned = cleaned.replace(/^\b(?:transfer(?:red)?\s+(?:from|to)|received\s+from|payment\s+from|payment\s+to|refund\s+from|trf\s+from|trf\s+to)\b/i, '');

    // Remove account patterns at the start (e.g. "your A/c XX0604 by")
    cleaned = cleaned.replace(/\b(?:your\s+)?a\/c\s*(?:xx\d+|\d+)?(?:\s+(?:by|to|from|debited|credited))?\b/i, '');
    cleaned = cleaned.replace(/\bac\b\s*(?:xx\d+|\d+)?(?:\s+(?:by|to|from|debited|credited))?\b/i, '');
    cleaned = cleaned.replace(/\baccount\s*(?:xx\d+|\d+)?(?:\s+(?:by|to|from|debited|credited))?\b/i, '');

    // Remove leading/trailing "by", "to", "from", "at"
    cleaned = cleaned.replace(/^(?:by|to|from|at)\s+/i, '').replace(/\s+(?:by|to|from|at)$/i, '');

    // Remove honorifics
    cleaned = cleaned.replace(/\b(?:Mr|Mrs|Ms|Shri|Smt)\.?\s+/gi, '');
    cleaned = cleaned.replace(/\b(?:S\/O|D\/O|W\/O|SO|DO|WO)\s+[A-Za-z0-9\s&'./\-]+$/i, '');

    // Collapse multiple spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // Remove trailing junk
    cleaned = cleaned.replace(/\s+(?:from|using|on|ref|at|for|via)$/i, '').trim();

    return cleaned;
  }

  private isValidMerchantCandidate(name: string): boolean {
    if (!name || name.length < 2) return false;
    // Cannot be a currency amount
    if (/^(?:Rs\.?|INR|₹|inr)\b/i.test(name) || /^[0-9,.]+$/.test(name)) return false;
    // Cannot be purely digits
    if (/^\d+$/.test(name)) return false;
    // Cannot be a bank generic word
    if (/^(?:bank|acct|account|transfer|card)$/i.test(name)) return false;
    return true;
  }
}

export const rawMerchantExtractor = new RawMerchantExtractor();
