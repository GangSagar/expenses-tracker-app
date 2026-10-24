/**
 * Formats a raw number into a clean, localized Indian Rupee currency representation.
 */
export function formatAmount(amount: number): string {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const formatted = absAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${isNegative ? '-' : ''}₹${formatted}`;
}

/**
 * Returns premium thematic colors for standard transaction categories.
 */
export function getCategoryColor(category: string, index: number): string {
  const colors = ['#34a853', '#fbbc05', '#ea4335', '#9c27b0', '#00bcd4'];
  if (category === 'Food & Dining') return '#34a853';
  if (category === 'Shopping') return '#9c27b0';
  if (category === 'Travel') return '#fbbc05';
  if (category === 'Games') return '#e91e63';
  return colors[index % colors.length];
}


interface AlphanumericBlock {
  start: number;
  end: number;
  asciiStart: number;
}

const ALPHABET_BLOCKS: AlphanumericBlock[] = [
  { start: 0x1d400, end: 0x1d419, asciiStart: 65 },  // Bold Capital
  { start: 0x1d41a, end: 0x1d433, asciiStart: 97 },  // Bold Small
  { start: 0x1d434, end: 0x1d44d, asciiStart: 65 },  // Italic Capital
  { start: 0x1d44e, end: 0x1d467, asciiStart: 97 },  // Italic Small
  { start: 0x1d468, end: 0x1d481, asciiStart: 65 },  // Bold Italic Capital
  { start: 0x1d482, end: 0x1d49b, asciiStart: 97 },  // Bold Italic Small
  { start: 0x1d49c, end: 0x1d4b5, asciiStart: 65 },  // Script Capital
  { start: 0x1d4b6, end: 0x1d4cf, asciiStart: 97 },  // Script Small
  { start: 0x1d4d0, end: 0x1d4e9, asciiStart: 65 },  // Bold Script Capital
  { start: 0x1d4ea, end: 0x1d503, asciiStart: 97 },  // Bold Script Small
  { start: 0x1d504, end: 0x1d51d, asciiStart: 65 },  // Fraktur Capital
  { start: 0x1d51e, end: 0x1d537, asciiStart: 97 },  // Fraktur Small
  { start: 0x1d538, end: 0x1d551, asciiStart: 65 },  // Double-struck Capital
  { start: 0x1d552, end: 0x1d56b, asciiStart: 97 },  // Double-struck Small
  { start: 0x1d56c, end: 0x1d585, asciiStart: 65 },  // Bold Fraktur Capital
  { start: 0x1d586, end: 0x1d59f, asciiStart: 97 },  // Bold Fraktur Small
  { start: 0x1d5a0, end: 0x1d5b9, asciiStart: 65 },  // Sans-serif Capital
  { start: 0x1d5ba, end: 0x1d5d3, asciiStart: 97 },  // Sans-serif Small
  { start: 0x1d5d4, end: 0x1d5ed, asciiStart: 65 },  // Bold Sans-serif Capital
  { start: 0x1d5ee, end: 0x1d607, asciiStart: 97 },  // Bold Sans-serif Small
  { start: 0x1d608, end: 0x1d621, asciiStart: 65 },  // Sans-serif Italic Capital
  { start: 0x1d622, end: 0x1d63b, asciiStart: 97 },  // Sans-serif Italic Small
  { start: 0x1d63c, end: 0x1d655, asciiStart: 65 },  // Bold Sans-serif Italic Capital
  { start: 0x1d656, end: 0x1d66f, asciiStart: 97 },  // Bold Sans-serif Italic Small
  { start: 0x1d670, end: 0x1d689, asciiStart: 65 },  // Monospace Capital
  { start: 0x1d68a, end: 0x1d6a3, asciiStart: 97 },  // Monospace Small
];

/**
 * Normalizes stylized mathematical sans-serif/bold Unicode characters back to standard ASCII.
 * Extremely robust fallback covering all Mathematical Alphanumeric ranges (U+1D400 to U+1D7FF).
 */
export function normalizeUnicodeText(text: string): string {
  if (!text) return '';
  
  // Safety check: protect against Bare Hermes engines on Android where normalize() is undefined
  const normalized = typeof text.normalize === 'function' ? text.normalize('NFKD') : text;
  
  let result = '';
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.codePointAt(i);
    if (code === undefined) continue;
    
    // Check if the character lies within the Mathematical Alphanumeric Symbols block (U+1D400 to U+1D7FF)
    if (code >= 0x1d400 && code <= 0x1d7ff) {
      // Skip the low surrogate since codePointAt reads the full 32-bit codepoint
      if (normalized.charCodeAt(i) >= 0xd800 && normalized.charCodeAt(i) <= 0xdbff) {
        i++;
      }
      
      // Match against the 26 known alphabet blocks
      let matched = false;
      for (const block of ALPHABET_BLOCKS) {
        if (code >= block.start && code <= block.end) {
          result += String.fromCharCode(code - block.start + block.asciiStart);
          matched = true;
          break;
        }
      }
      
      if (!matched) {
        // Handle the 5 stylized numeric digit blocks:
        // Bold numbers 0-9: U+1D7CE to U+1D7D7
        if (code >= 0x1d7ce && code <= 0x1d7d7) {
          result += String.fromCharCode(code - 0x1d7ce + 48);
        }
        // Double-struck numbers 0-9: U+1D7D8 to U+1D7E1
        else if (code >= 0x1d7d8 && code <= 0x1d7e1) {
          result += String.fromCharCode(code - 0x1d7d8 + 48);
        }
        // Sans-serif numbers 0-9: U+1D7E2 to U+1D7EB
        else if (code >= 0x1d7e2 && code <= 0x1d7eb) {
          result += String.fromCharCode(code - 0x1d7e2 + 48);
        }
        // Sans-serif bold numbers 0-9: U+1D7EC to U+1D7F5
        else if (code >= 0x1d7ec && code <= 0x1d7f5) {
          result += String.fromCharCode(code - 0x1d7ec + 48);
        }
        // Monospace numbers 0-9: U+1D7F6 to U+1D7FF
        else if (code >= 0x1d7f6 && code <= 0x1d7ff) {
          result += String.fromCharCode(code - 0x1d7f6 + 48);
        }
        else {
          const char = String.fromCodePoint(code);
          result += char !== '\uFFFD' ? char : '';
        }
      }
    }
    // Handle Fullwidth Forms (U+FF01 to U+FF5E)
    else if (code >= 0xff01 && code <= 0xff5e) {
      result += String.fromCharCode(code - 0xfee0);
    }
    else {
      result += normalized[i];
    }
  }
  
  return result;
}
