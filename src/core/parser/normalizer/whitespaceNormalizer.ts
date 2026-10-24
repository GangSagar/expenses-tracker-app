/**
 * Normalizes whitespaces, control characters, and clean punctuation in text.
 */
export function normalizeWhitespace(text: string): string {
  if (!text) return '';

  return text
    // Replace non-breaking spaces and zero-width spaces with regular space
    .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ')
    // Replace newlines and tabs with single space
    .replace(/[\r\n\t]+/g, ' ')
    // Standardize unicode quotes and hyphens
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    // Collapse multiple consecutive spaces into one
    .replace(/\s+/g, ' ')
    .trim();
}
