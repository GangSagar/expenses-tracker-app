import { ExtractedVpa } from './ExtractedEntities';
import { NormalizedMessage } from '../normalizer';

export class VpaExtractor {
  // Regex strictly matching UPI VPA syntax (e.g., username@bankhandle)
  private static readonly VPA_REGEX = /\b([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+)\b/;

  public extract(message: NormalizedMessage): ExtractedVpa | null {
    const text = message.clean;
    if (!text) return null;

    const match = text.match(VpaExtractor.VPA_REGEX);
    if (match) {
      const fullVpa = match[0];
      const username = match[1];
      const handle = match[2];

      // Avoid matching standard email addresses ending in .com / .org
      if (handle.toLowerCase().endsWith('.com') || handle.toLowerCase().endsWith('.org') || handle.toLowerCase().endsWith('.in')) {
        return null;
      }

      const isPhoneNumber = /^\d{10}$/.test(username);

      return {
        vpa: fullVpa,
        username,
        handle,
        isPhoneNumber,
      };
    }

    return null;
  }
}

export const vpaExtractor = new VpaExtractor();
