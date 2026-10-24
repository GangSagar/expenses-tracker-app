/**
 * Converts stylized Unicode alphanumeric characters (Mathematical Bold, Sans-Serif,
 * Italic, Monospace, etc.) frequently found in modern bank/telecom SMS alerts
 * into standard ASCII characters.
 */
export function normalizeUnicode(text: string): string {
  if (!text) return '';

  return text
    .normalize('NFKD')
    .replace(/[\u{1D400}-\u{1D7FF}]/gu, char => {
      const code = char.codePointAt(0);
      if (!code) return char;

      // Mathematical Sans-Serif Bold/Regular capital letters A-Z (0x1D5A0 - 0x1D5B9)
      if (code >= 0x1d5a0 && code <= 0x1d5b9) {
        return String.fromCharCode(65 + (code - 0x1d5a0));
      }
      // Mathematical Sans-Serif Bold/Regular small letters a-z (0x1D5BA - 0x1D5D3)
      if (code >= 0x1d5ba && code <= 0x1d5d3) {
        return String.fromCharCode(97 + (code - 0x1d5ba));
      }
      // Mathematical Bold capital letters A-Z (0x1D400 - 0x1D419)
      if (code >= 0x1d400 && code <= 0x1d419) {
        return String.fromCharCode(65 + (code - 0x1d400));
      }
      // Mathematical Bold small letters a-z (0x1D41A - 0x1D433)
      if (code >= 0x1d41a && code <= 0x1d433) {
        return String.fromCharCode(97 + (code - 0x1d41a));
      }
      // Mathematical Bold/Sans-Serif digits 0-9 (0x1D7CE - 0x1D7E1)
      if (code >= 0x1d7ce && code <= 0x1d7d7) {
        return String.fromCharCode(48 + (code - 0x1d7ce));
      }
      if (code >= 0x1d7e2 && code <= 0x1d7eb) {
        return String.fromCharCode(48 + (code - 0x1d7e2));
      }
      return char;
    });
}
